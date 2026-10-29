/**
 * 党员端：首页（先锋指数概览 + 近期成绩申报记录）。
 * 顶部「姓名 + 所属组织」：经 useCurrentIdentity 取当前登录用户的真实姓名与任职组织，
 * 再取首个任职组织的组织树，展示「学院党委」容器节点之前的名称并用 `|` 连接；
 * 姓名取不到时回退账户名，组织无任职时回退占位符（不使用业务数据做默认填充）。
 *
 * 分数与近期记录：经 useMyPartyScores 接真实接口 GET /api/party-scores，
 * 按创建时间倒序取最近 PARTY_RECENT_RECORD_LIMIT 条；点击记录可查看申报详情。
 * 先锋指数由 computePartyScoreSummary 计算：基础分 70 + 加分项（封顶 30），总分封顶 100，减分固定 0。
 */
import { Spin } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { queryApprovalTemplates } from '../../api/approvalmodel'
import { getOrganizationTree } from '../../api/organizations'
import type { PartyScore } from '../../api/types/partyScores'
import ErrorState from '../../components/ErrorState'
import PartyScoreDetailModal from '../../components/PartyScoreDetailModal'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import { useCurrentIdentity } from '../../composables/useCurrentIdentity'
import { useMyPartyScores } from '../../composables/useMyPartyScores'
import {
  PARTY_DECLARATION_PAGE_SIZE,
  PARTY_RECENT_RECORD_LIMIT,
  PARTY_TEMPLATE_BUSINESS_TYPE,
} from '../../config/partyDeclaration'
import {
  PARTY_HOME_ORG_FALLBACK_NAME,
  PARTY_HOME_ORG_PATH_STOP_ID,
} from '../../config/organization'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'
import { formatPartyScore, isNegativePartyScore } from '../../utils/partyScore'

/** 近期记录日期标签：月.日（数值型，各语言下通用；时间非法时返回占位符） */
function formatRecordDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getMonth() + 1}.${date.getDate()}`
}

export default function PartyHomeView() {
  const t = useT()
  const username = useAuthStore((s) => s.username)
  const { name, organizations, organizationIds } = useCurrentIdentity()
  const { records, loading, error, refresh } = useMyPartyScores()
  const [templateNames, setTemplateNames] = useState<Map<number, string>>(new Map())
  const [detailRecord, setDetailRecord] = useState<PartyScore | null>(null)
  /** 首页顶部组织路径：取首个任职组织的祖先链，截取到「学院党委」容器节点之前 */
  const [organizationPath, setOrganizationPath] = useState<string | null>(null)
  const firstOrganizationId = organizationIds[0]

  // 姓名：真实姓名优先，取不到时回退账户名，最后回退占位符
  const displayName = name?.trim() || username || t('common.unknown')
  // 所属组织：优先展示组织路径；树查询失败时回退根组织名称，无任职时回退占位符
  const displayOrg = organizationPath || organizations[0] || t('common.unknown')

  useEffect(() => {
    let cancelled = false

    if (firstOrganizationId === undefined) {
      setOrganizationPath(null)
      return
    }

    getOrganizationTree(firstOrganizationId)
      .then((chain) => {
        if (cancelled) return
        const stopIndex = chain.findIndex((node) => node.id === PARTY_HOME_ORG_PATH_STOP_ID)
        const prefix = stopIndex === -1 ? chain : chain.slice(0, stopIndex)
        setOrganizationPath(prefix.map((node) => node.name).filter(Boolean).join('|'))
      })
      .catch(() => {
        if (!cancelled) setOrganizationPath(PARTY_HOME_ORG_FALLBACK_NAME)
      })

    return () => {
      cancelled = true
    }
  }, [firstOrganizationId])

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
      {/* 顶部：姓名 + 所属支部 */}
      <section className="party-profile">
        <span className="party-member-name">{displayName}</span>
        <span className="party-profile-separator">|</span>
        <span className="party-branch-name">{displayOrg}</span>
      </section>

      {/* 总成绩：先锋指数 + 基础分/加分项/减分 */}
      <PartyScoreSummary />

      {/* 近期记录：本人最近若干条成绩申报 */}
      <section className="party-records">
        <h3 className="party-records-title">{t('party.recentRecords')}</h3>
        {error ? (
          <ErrorState message={error} onRetry={() => refresh(true)} />
        ) : loading ? (
          <div className="party-records-loading">
            <Spin size="small" />
          </div>
        ) : recentRecords.length === 0 ? (
          <p className="party-records-empty">{t('party.recordsEmpty')}</p>
        ) : (
          <ul className="party-records-list">
            {recentRecords.map((record) => (
              <li
                key={record.id}
                className="party-record-item"
                style={{ cursor: 'pointer' }}
                title={t('partyDeclaration.rowClickHint')}
                onClick={() => setDetailRecord(record)}
              >
                <span className="party-record-date">
                  {formatRecordDate(record.created_at)}
                </span>
                <span className="party-record-act">
                  {record.template_id !== undefined
                    ? templateNames.get(record.template_id) ?? record.template_id
                    : t('common.unknown')}
                </span>
                <span
                  className={
                    isNegativePartyScore(record.requested_score)
                      ? 'party-record-delta party-score-minus'
                      : 'party-record-delta'
                  }
                >
                  {formatPartyScore(record.requested_score)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PartyScoreDetailModal
        record={detailRecord}
        templateNames={templateNames}
        onClose={() => setDetailRecord(null)}
      />
    </div>
  )
}
