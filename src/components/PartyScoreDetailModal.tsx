/**
 * 党建活动加分申请详情弹窗。
 * 审批管理点击「查看详情」时，直接用审批行已带出的加分申请 ID 调 GET /api/party-scores/{id}；
 * 详情返回 file_urls 附件下载地址，加载失败时弹窗内展示带状态码的错误并支持重试。
 * 审批行可操作时，弹窗底部提供「通过 / 驳回」按钮，点击后转入对应的审批动作弹窗。
 */
import { Button, Descriptions, Modal, Skeleton, Space } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { extractErrorReason } from '../api/common'
import { getPartyScore } from '../api/partyScores'
import type { PartyScoreDetail } from '../api/types/partyScores'
import { useUserNames } from '../composables/useUserNames'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import AttachmentLinks from './AttachmentLinks'
import ErrorState from './ErrorState'

interface Props {
  open: boolean
  /** 加分申请 ID（审批行 score.id；open 为 true 时必填） */
  scoreId: number | null
  /** 当前审批行是否可操作（true 时展示通过 / 驳回按钮） */
  actionable?: boolean
  /** 点击「通过」回调（可选；未提供时不展示按钮） */
  onApprove?: () => void
  /** 点击「驳回」回调（可选；未提供时不展示按钮） */
  onReject?: () => void
  /** 点击「转交」回调（可选；未提供时不展示按钮） */
  onTransfer?: () => void
  onClose: () => void
}

/**
 * 党建活动加分申请详情弹窗。
 * @param props.open 是否展示（必填）
 * @param props.scoreId 加分申请 ID（open 为 true 时必填，用于直接调详情接口）
 * @param props.actionable 审批行是否可操作（可选，默认 false）
 * @param props.onApprove 点击通过的回调（可选）
 * @param props.onReject 点击驳回的回调（可选）
 * @param props.onTransfer 点击转交的回调（可选）
 * @param props.onClose 关闭回调（必填）
 * @returns 加分申请详情弹窗（含附件预览、申请人姓名解析与审批操作入口）
 */
export default function PartyScoreDetailModal({
  open,
  scoreId,
  actionable = false,
  onApprove,
  onReject,
  onTransfer,
  onClose,
}: Props) {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  const [detail, setDetail] = useState<PartyScoreDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const userNames = useUserNames(detail ? [detail.user_id] : [])

  const load = useCallback(
    async (id: number, force?: boolean) => {
      setLoading(true)
      setErrorText(null)
      try {
        setDetail(await getPartyScore(id, force))
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) return
        setErrorText(extractErrorReason(err, t))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    // 详情包含附件下载地址，打开时绕过缓存重新请求，避免展示旧数据导致看不到附件
    if (open && scoreId !== null) void load(scoreId, true)
  }, [open, scoreId, load])

  return (
    <Modal
      open={open}
      title={t('partyScoreApproval.detailTitle')}
      footer={
        actionable && (onApprove || onReject || onTransfer) ? (
          <Space style={{ width: '100%', justifyContent: 'center' }}>
            {onReject ? (
              <Button danger onClick={onReject}>
                {t('partyScoreApproval.reject')}
              </Button>
            ) : null}
            {onTransfer ? (
              <Button onClick={onTransfer}>{t('partyScoreApproval.transfer')}</Button>
            ) : null}
            {onApprove ? (
              <Button type="primary" onClick={onApprove}>
                {t('partyScoreApproval.approve')}
              </Button>
            ) : null}
          </Space>
        ) : null
      }
      onCancel={onClose}
      destroyOnHidden
      width={640}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : errorText ? (
        <ErrorState
          message={errorText}
          onRetry={scoreId !== null ? () => void load(scoreId, true) : undefined}
        />
      ) : detail ? (
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label={t('partyScoreApproval.fieldId')}>
            {detail.id}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyScoreApproval.fieldApplicant')}>
            {userNames.get(detail.user_id) ?? detail.user_id}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyScoreApproval.fieldTemplateId')}>
            {detail.template_id}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyScoreApproval.fieldRequestedScore')}>
            <span className={detail.requested_score < 0 ? 'party-score-minus' : 'party-score-plus'}>
              {detail.requested_score > 0 ? `+${detail.requested_score}` : detail.requested_score}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={t('partyScoreApproval.fieldApprovedScore')}>
            {detail.approved_score === null ? '—' : detail.approved_score}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyScoreApproval.fieldApprovalInstanceId')}>
            {detail.approval_instance_id}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyScoreApproval.fieldFiles')} span={2}>
            <AttachmentLinks
              urls={detail.file_urls}
              emptyText={t('leaveDetail.noAttachment')}
            />
          </Descriptions.Item>
          <Descriptions.Item label={t('partyScoreApproval.fieldCreatedAt')}>
            {formatDateTime(detail.created_at, locale)}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyScoreApproval.fieldUpdatedAt')}>
            {formatDateTime(detail.updated_at, locale)}
          </Descriptions.Item>
        </Descriptions>
      ) : null}
    </Modal>
  )
}
