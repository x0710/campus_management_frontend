/**
 * 党建活动加分申请详情弹窗（只读）。
 * 审批管理点击行时，用审批步骤的 instance_id 反查对应加分申请并展示完整信息；
 * 数据走 queryPartyScores 的会话缓存，详情加载失败时弹窗内展示带状态码的错误并支持重试。
 */
import { Descriptions, Modal, Skeleton } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { extractErrorReason } from '../api/common'
import { queryPartyScores } from '../api/partyScores'
import type { PartyScore } from '../api/types/partyScores'
import { useUserNames } from '../composables/useUserNames'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import ErrorState from './ErrorState'

interface Props {
  open: boolean
  /** 审批实例 ID（即加分申请的 approval_instance_id） */
  approvalInstanceId: number | null
  onClose: () => void
}

/**
 * 党建活动加分申请详情弹窗。
 * @param props.open 是否展示（必填）
 * @param props.approvalInstanceId 审批实例 ID（open 为 true 时必填，用于反查申请）
 * @param props.onClose 关闭回调（必填）
 * @returns 加分申请详情弹窗（含申请人姓名解析与时间格式化）
 */
export default function PartyScoreDetailModal({
  open,
  approvalInstanceId,
  onClose,
}: Props) {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  const [detail, setDetail] = useState<PartyScore | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const userNames = useUserNames(detail ? [detail.user_id] : [])

  const load = useCallback(
    async (instanceId: number, force?: boolean) => {
      setLoading(true)
      setErrorText(null)
      try {
        const page = await queryPartyScores(
          { approval_instance_id: instanceId, page: 1, page_size: 1 },
          force,
        )
        setDetail(page.data[0] ?? null)
        if (!page.data[0]) setErrorText(t('partyScoreApproval.emptyScore'))
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
    if (open && approvalInstanceId !== null) void load(approvalInstanceId)
  }, [open, approvalInstanceId, load])

  return (
    <Modal
      open={open}
      title={t('partyScoreApproval.detailTitle')}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
      width={640}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : errorText ? (
        <ErrorState
          message={errorText}
          onRetry={approvalInstanceId !== null ? () => void load(approvalInstanceId, true) : undefined}
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
