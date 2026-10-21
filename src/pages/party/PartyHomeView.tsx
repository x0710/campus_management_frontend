/**
 * 党员端：首页（先锋指数概览 + 近期成绩申报记录）。
 * 顶部「姓名 + 所属组织」：经 useCurrentIdentity 取当前登录用户的真实姓名与任职组织，
 * 姓名取不到时回退账户名，组织无任职时回退占位符（不使用业务数据做默认填充）。
 *
 * 近期记录：接真实接口 GET /api/party-scores（显式传 user_id 限定本人，接口不会自动过滤当前用户），
 * 按创建时间倒序取最近 PARTY_RECENT_RECORD_LIMIT 条；「申报类型」名称取自审批模板
 * GET /api/approvals/templates（business_type='party'，见 config/partyDeclaration.ts），
 * 查不到名称时回退展示模板 ID，不编造名称。
 * 注意：「先锋指数 + 三项分数」仍为模拟数据预览（后端暂无对应接口），页面顶部保留说明提示。
 */
import { Alert, Spin, Tooltip } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { queryApprovalTemplates } from '../../api/approvalmodel'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { queryPartyScores } from '../../api/partyScores'
import type { PartyScore } from '../../api/types/partyScores'
import ErrorState from '../../components/ErrorState'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import { useCurrentIdentity } from '../../composables/useCurrentIdentity'
import {
  PARTY_DECLARATION_PAGE_SIZE,
  PARTY_RECENT_RECORD_LIMIT,
  PARTY_TEMPLATE_BUSINESS_TYPE,
} from '../../config/partyDeclaration'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** 近期记录日期标签：月.日（数值型，各语言下通用；时间非法时返回占位符） */
function formatRecordDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getMonth() + 1}.${date.getDate()}`
}

/** 分数展示：正数带 + 号，负数保持原样 */
function formatScore(score: number): string {
  return score > 0 ? `+${score}` : String(score)
}

export default function PartyHomeView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const username = useAuthStore((s) => s.username)
  const { name, organizations } = useCurrentIdentity()

  // 姓名：真实姓名优先，取不到时回退账户名，最后回退占位符
  const displayName = name?.trim() || username || t('common.unknown')
  // 所属组织：取第一项任职组织名称，无任职时回退占位符
  const displayOrg = organizations[0] || t('common.unknown')

  /** 当前登录用户 ID（作为近期记录的 user_id；就绪前不请求，避免取到他人数据） */
  const [myUid, setMyUid] = useState<number | null>(null)
  /** 本人成绩申报记录（已按创建时间倒序截取近期若干条） */
  const [records, setRecords] = useState<PartyScore[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  /** 审批模板 ID → 模板名称（即「申报类型」名称） */
  const [templateNames, setTemplateNames] = useState<Map<number, string>>(new Map())

  // 获取当前登录用户 ID
  useEffect(() => {
    let cancelled = false
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setMyUid(user.uid)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // uid 取不到时无法按本人过滤，直接展示错误并停止 loading（不展示他人数据）
        setRecordsError(extractErrorReason(err, t))
        setRecordsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  /**
   * 重新请求本人成绩申报记录（手动重试）。
   * 先在事件回调里置 loading / 清错误，再递增 reloadKey 触发 effect 重新请求（force 绕过会话缓存）。
   * 不直接在 effect 内同步 setState，避免额外渲染。
   */
  const [reloadKey, setReloadKey] = useState(0)
  const retryRecords = () => {
    setRecordsLoading(true)
    setRecordsError(null)
    setReloadKey((k) => k + 1)
  }

  useEffect(() => {
    if (myUid === null) return
    let cancelled = false
    // 首轮走会话缓存；用户点重试（reloadKey > 0）时绕过缓存取最新数据
    queryPartyScores(
      { user_id: myUid, page: 1, page_size: PARTY_DECLARATION_PAGE_SIZE },
      reloadKey > 0,
    )
      .then((res) => {
        if (cancelled) return
        setRecords(res.data)
        setRecordsError(null)
        setRecordsLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRecordsError(extractErrorReason(err, t))
        setRecordsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [myUid, reloadKey, t])

  // 申报类型名称：失败时保持空 Map，列表回退展示模板 ID，不影响其余内容
  useEffect(() => {
    let cancelled = false
    queryApprovalTemplates({
      business_type: PARTY_TEMPLATE_BUSINESS_TYPE,
      enabled: true,
      page: 1,
      page_size: PARTY_DECLARATION_PAGE_SIZE,
    })
      .then((res) => {
        if (!cancelled) {
          setTemplateNames(new Map(res.data.map((item) => [item.id, item.name])))
        }
      })
      .catch(() => {
        /* 名称取不到时回退展示模板 ID */
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** 近期记录：创建时间倒序后截取固定条数 */
  const recentRecords = useMemo(
    () =>
      [...records]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, PARTY_RECENT_RECORD_LIMIT),
    [records],
  )

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('party.indexPendingHint')} />

      {/* 顶部：姓名 + 所属支部 */}
      <section className="party-profile">
        <span className="party-member-name">{displayName}</span>
        <span className="party-branch-name">{displayOrg}</span>
      </section>

      {/* 总成绩：先锋指数 + 基础分/加分项/减分（模拟数据） */}
      <PartyScoreSummary />

      {/* 近期记录：本人最近若干条成绩申报 */}
      <section className="party-records">
        <h3 className="party-records-title">{t('party.recentRecords')}</h3>
        {recordsError ? (
          <ErrorState message={recordsError} onRetry={retryRecords} />
        ) : recordsLoading ? (
          <div className="party-records-loading">
            <Spin size="small" />
          </div>
        ) : recentRecords.length === 0 ? (
          <p className="party-records-empty">{t('party.recordsEmpty')}</p>
        ) : (
          <ul className="party-records-list">
            {recentRecords.map((record) => (
              <Tooltip
                key={record.id}
                title={
                  <div>
                    <div>
                      {t('partyDeclaration.colId')}: {record.id}
                    </div>
                    <div>
                      {t('partyDeclaration.colApproved')}:{' '}
                      {record.approved_score === null
                        ? '—'
                        : formatScore(record.approved_score)}
                    </div>
                    <div>
                      {t('partyDeclaration.colCreatedAt')}:{' '}
                      {formatDateTime(record.created_at, locale)}
                    </div>
                  </div>
                }
              >
                <li className="party-record-item">
                  <span className="party-record-date">
                    {formatRecordDate(record.created_at)}
                  </span>
                  <span className="party-record-act">
                    {templateNames.get(record.template_id) ?? record.template_id}
                  </span>
                  <span
                    className={
                      record.requested_score < 0
                        ? 'party-record-delta party-score-minus'
                        : 'party-record-delta'
                    }
                  >
                    {formatScore(record.requested_score)}
                  </span>
                </li>
              </Tooltip>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
