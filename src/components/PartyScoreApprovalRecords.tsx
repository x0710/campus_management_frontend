/**
 * 党建活动加分申请的「审批意见」流转（复用组件）。
 *
 * 通过 GET /api/approvals/{id}/records 拉取审批实例中的全部审批意见，
 * 按环节顺序展示：决定、操作人、转交对象、意见与时间。
 * 党员端「成绩申报详情」与首页 / 我的成绩记录详情共用。
 */
import { Spin, Tag } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { getApprovalRecords } from '../api/approvals'
import { extractErrorReason } from '../api/common'
import type { ApprovalRecordItem } from '../api/types/approvals'
import { useUserNames } from '../composables/useUserNames'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import ErrorState from './ErrorState'

interface PartyScoreApprovalRecordsProps {
  /** 审批实例 ID（必填） */
  instanceId: number
  /** 强制绕过缓存重新请求（打开详情时传 true，保证展示最新意见） */
  force?: boolean
}

/** 审批决定 → 标签文案 key（agree/reject/transfer） */
const DECISION_TEXT_KEY: Record<ApprovalRecordItem['decision'], string> = {
  agree: 'partyDeclaration.decision_agree',
  reject: 'partyDeclaration.decision_reject',
  transfer: 'partyDeclaration.decision_transfer',
}

/** 审批决定 → Tag 配色 */
const DECISION_TAG_COLOR: Record<ApprovalRecordItem['decision'], string> = {
  agree: 'success',
  reject: 'error',
  transfer: 'processing',
}

/**
 * 审批意见流转列表。
 * @param props instanceId 为审批实例 ID；force 为是否强制刷新（默认 false）
 */
export default function PartyScoreApprovalRecords({
  instanceId,
  force = false,
}: PartyScoreApprovalRecordsProps) {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const [records, setRecords] = useState<ApprovalRecordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 重试计数：递增以触发 effect 重新拉取 */
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getApprovalRecords(instanceId, force)
      .then((list) => {
        if (!cancelled) setRecords(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRecords([])
          setError(extractErrorReason(err, t))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [instanceId, force, retryKey, t])

  /** 记录涉及的操作人与转交对象，批量解析姓名 */
  const recordUserIds = useMemo(
    () =>
      records.flatMap((record) => [
        record.operator_id,
        ...(record.transfer_to === null ? [] : [record.transfer_to]),
      ]),
    [records],
  )
  const recordUserNames = useUserNames(recordUserIds)

  if (loading) {
    return (
      <div className="party-approval-flow-empty">
        <Spin size="small" />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => setRetryKey((n) => n + 1)} />
  }

  if (records.length === 0) {
    return <div className="party-approval-flow-empty">{t('partyDeclaration.flowEmpty')}</div>
  }

  return (
    <div className="party-approval-flow-list">
      {records.map((record) => {
        const operatorName = recordUserNames.get(record.operator_id)
        const transferName =
          record.transfer_to === null ? null : recordUserNames.get(record.transfer_to)
        return (
          <div
            key={record.id}
            className={`party-approval-flow-item party-approval-flow-item--${record.decision}`}
          >
            <div className="party-approval-flow-head">
              <span className={`party-approval-flow-dot party-approval-flow-dot--${record.decision}`} />
              <span className="party-approval-flow-step">
                {t('partyDeclaration.flowStep', { n: String(record.step_order) })}
              </span>
              <Tag color={DECISION_TAG_COLOR[record.decision]} className="party-approval-flow-decision-tag">
                {t(DECISION_TEXT_KEY[record.decision])}
              </Tag>
              <span className="party-approval-flow-time">
                {formatDateTime(record.created_at, locale)}
              </span>
            </div>
            <div className="party-approval-flow-meta">
              <span>
                <span className="party-approval-flow-meta-label">
                  {t('partyDeclaration.flowOperator')}
                </span>
                {operatorName === undefined
                  ? t('common.loading')
                  : (operatorName ?? record.operator_id)}
              </span>
              {record.transfer_to !== null && (
                <span>
                  <span className="party-approval-flow-meta-label">
                    {t('partyDeclaration.flowTransferTo')}
                  </span>
                  {transferName === undefined
                    ? t('common.loading')
                    : (transferName ?? record.transfer_to)}
                </span>
              )}
            </div>
            <div className="party-approval-flow-comment">
              <span className="party-approval-flow-comment-label">
                {t('partyDeclaration.flowComment')}
              </span>
              <span className="party-approval-flow-comment-text">{record.comment || '—'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
