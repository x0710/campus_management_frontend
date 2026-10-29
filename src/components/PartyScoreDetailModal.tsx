/**
 * 党建活动加分申请详情弹窗（党员端首页 / 我的成绩记录共用）。
 *
 * 列表摘要可能不含 template_id / created_at / file_urls；打开时先用列表数据即时展示，
 * 再按 ID 请求 GET /api/party-scores/{id} 补齐附件下载地址（详情走会话缓存）。
 * 调用方负责传入当前记录与模板名称映射，并控制弹窗关闭。
 */
import { Descriptions, Modal, Button } from 'antd'
import { useEffect, useState } from 'react'
import { extractErrorReason } from '../api/common'
import { getPartyScore } from '../api/partyScores'
import type { PartyScore } from '../api/types/partyScores'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import { formatPartyScore } from '../utils/partyScore'
import AttachmentLinks from './AttachmentLinks'
import ErrorState from './ErrorState'

interface PartyScoreDetailModalProps {
  /** 当前要展示详情的记录；null 表示关闭弹窗 */
  record: PartyScore | null
  /** 申报类型模板 ID → 名称；查不到时回退显示 ID */
  templateNames?: Map<number, string>
  /** 关闭弹窗回调 */
  onClose: () => void
}

/**
 * 党建加分申请详情弹窗。
 * @param props 组件 props，详见 PartyScoreDetailModalProps
 */
export default function PartyScoreDetailModal({
  record,
  templateNames,
  onClose,
}: PartyScoreDetailModalProps) {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const [detail, setDetail] = useState<PartyScore | null>(record)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(record)
    setError(null)
    setLoading(false)
    if (!record) return

    let cancelled = false
    setLoading(true)
    getPartyScore(record.id)
      .then((full) => {
        if (!cancelled) setDetail({ ...record, ...full })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(extractErrorReason(err, t))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [record, t])

  return (
    <Modal
      open={record !== null}
      title={t('partyDeclaration.detailTitle')}
      onCancel={onClose}
      footer={<Button onClick={onClose}>{t('partyDeclaration.close')}</Button>}
    >
      {detail ? (
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('partyDeclaration.colId')}>
            {detail.id}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyDeclaration.colDeclType')}>
            {detail.template_id !== undefined
              ? templateNames?.get(detail.template_id) ?? detail.template_id
              : t('common.unknown')}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyDeclaration.colScore')}>
            {formatPartyScore(detail.requested_score)}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyDeclaration.colApproved')}>
            {formatPartyScore(detail.approved_score)}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyDeclaration.detailInstance')}>
            {detail.approval_instance_id}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyDeclaration.colCreatedAt')}>
            {formatDateTime(detail.created_at, locale)}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyDeclaration.colUpdatedAt')}>
            {formatDateTime(detail.updated_at, locale)}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyDeclaration.fieldFiles')}>
            {loading ? (
              t('common.loading')
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <AttachmentLinks
                urls={detail.file_urls}
                emptyText={t('leaveDetail.noAttachment')}
              />
            )}
          </Descriptions.Item>
        </Descriptions>
      ) : null}
    </Modal>
  )
}
