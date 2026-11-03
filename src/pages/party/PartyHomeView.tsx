/**
 * 党员端：首页（先锋指数概览 + 近期成绩申报记录）。
 * 顶部「姓名 | 组织链路」：经 useCurrentIdentity 取当前登录用户的真实姓名与任职组织，
 * 再取首个任职组织的组织树，按「根 → 当前组织」顺序展示完整链路
 * （如：井冈山大学 | 学院党委 | 数理学院党委 | 物理系学生党支部）；
 * 姓名取不到时回退账户名，组织无任职时回退占位符（不使用业务数据做默认填充）。
 *
 * 加载期间展示骨架屏而非占位符/半成品名称，避免刷新时出现「— → 支部 → 学校」的跳变。
 *
 * 分数与近期记录：经 useMyPartyScores 接真实接口 GET /api/party-scores，
 * 按创建时间倒序取最近 PARTY_RECENT_RECORD_LIMIT 条；点击记录可查看申报详情。
 * 先锋指数由 computePartyScoreSummary 计算：基础分 70 + 加分项（封顶 30），总分封顶 100，减分固定 0。
 */
import { Skeleton, Spin } from 'antd'
import { Fragment, useEffect, useMemo, useState } from 'react'
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
import { PARTY_HOME_ORG_FALLBACK_NAME } from '../../config/organization'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'
import { formatPartyScore, isNegativePartyScore } from '../../utils/partyScore'

/** 近期记录日期标签：月.日（数值型，各语言下通用；时间非法时返回占位符） */
function formatRecordDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getMonth() + 1}.${date.getDate()}`
}

/** 顶部组织链路：按「根 → 当前组织」顺序记录每一级组织名称 */
type PartyOrgChain = string[]

export default function PartyHomeView() {
  const t = useT()
  const username = useAuthStore((s) => s.username)
  const {
    name,
    organizations,
    organizationIds,
    loading: identityLoading,
  } = useCurrentIdentity()
  const { records, loading, error, refresh } = useMyPartyScores()
  const [templateNames, setTemplateNames] = useState<Map<number, string>>(new Map())
  const [detailRecord, setDetailRecord] = useState<PartyScore | null>(null)
  /** 首页顶部完整组织链路：组织树返回后一次性写入，避免各级组织分批出现 */
  const [orgChain, setOrgChain] = useState<PartyOrgChain | null>(null)
  /** 组织信息是否仍在解析：为 true 时顶部整体展示骨架屏，避免占位符/半成品名称闪现 */
  const [orgLoading, setOrgLoading] = useState(true)
  const firstOrganizationId = organizationIds[0]

  // 姓名：真实姓名优先，取不到时回退账户名，最后回退占位符
  const displayName = name?.trim() || username || t('common.unknown')
  // 组织链路：解析失败或无任职时回退占位符
  const displayOrgChain =
    orgChain && orgChain.length > 0 ? orgChain : [t('common.unknown')]
  // 身份与组织树都就绪后才渲染真实内容，二者全部到齐前只显示骨架屏
  const headerLoading = identityLoading || orgLoading

  useEffect(() => {
    let cancelled = false

    // 身份仍在解析：保持加载态，避免先用占位符 / 首个任职组织名渲染再被组织树结果覆盖
    if (identityLoading) {
      setOrgLoading(true)
      return () => {
        cancelled = true
      }
    }

    if (firstOrganizationId === undefined) {
      setOrgChain(null)
      setOrgLoading(false)
      return
    }

    setOrgLoading(true)
    getOrganizationTree(firstOrganizationId)
      .then((chain) => {
        if (cancelled) return
        // 完整展示「根 → 当前组织」链路（含学院党委容器节点），与需求格式一致
        const names = chain.map((node) => node.name).filter(Boolean)
        setOrgChain(names.length > 0 ? names : null)
      })
      .catch(() => {
        if (cancelled) return
        // 组织树不可读（普通党员可能无 organization.read）：上级组织回退根组织名称，
        // 支部名称仍取已解析出的任职组织，避免把已知的支部名覆盖成「井冈山大学」
        const branch = organizations[0]
        setOrgChain(
          branch && branch !== PARTY_HOME_ORG_FALLBACK_NAME
            ? [PARTY_HOME_ORG_FALLBACK_NAME, branch]
            : [PARTY_HOME_ORG_FALLBACK_NAME],
        )
      })
      .finally(() => {
        if (!cancelled) setOrgLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [firstOrganizationId, identityLoading, organizations])

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
      {/* 顶部：姓名 | 完整组织链路（解析完成前展示骨架屏，避免刷新时跳变） */}
      <section className="party-profile">
        {headerLoading ? (
          <Skeleton.Input active size="small" style={{ width: 520, maxWidth: '100%' }} />
        ) : (
          <>
            <span className="party-member-name">{displayName}</span>
            {displayOrgChain.map((orgName, index) => (
              <Fragment key={`${index}-${orgName}`}>
                <span className="party-profile-separator">|</span>
                <span
                  className={
                    index === displayOrgChain.length - 1
                      ? 'party-branch-name'
                      : 'party-parent-org'
                  }
                >
                  {orgName}
                </span>
              </Fragment>
            ))}
          </>
        )}
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
