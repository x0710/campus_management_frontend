/**
 * 党员端：首页（先锋指数概览 + 近期成绩申报记录）。
 * 顶部「姓名 | 组织链路」：经 useCurrentIdentity 取当前登录用户的真实姓名与任职组织，
 * 从任职组织树中选择 ID 为 2 的组织下最深的链路，仅展示其子组织，
 * 按「当前组织 → 上级组织」顺序展示（如：物理系学生党支部 | 数理学院党委）；
 * 姓名取不到时回退账户名，组织无任职时回退占位符（不使用业务数据做默认填充）。
 *
 * 加载期间展示骨架屏而非占位符/半成品名称，避免刷新时出现「— → 支部 → 学校」的跳变。
 *
 * 分数与近期记录：经 useMyPartyScores 接真实接口 GET /api/party-scores，
 * 按创建时间倒序取最近 PARTY_RECENT_RECORD_LIMIT 条。
 * 近期记录不再直接展示申请分数（避免被误认为已获得成绩），而是展示审核状态
 * 「审核中 / 申请成功 / 被驳回」；双击记录跳转到独立申报详情页（申请内容 + 审核内容）。
 *
 * 先锋指数由 computePartyScoreSummary 计算：基础分 70 + 加分项（封顶 30），总分封顶 100，减分固定 0。
 */
import { isPartyScoreDeduction } from '../../utils/partyScore'
import { Skeleton, Spin, Tag } from 'antd'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getOrganizationTree } from '../../api/organizations'
import type { PartyScore } from '../../api/types/partyScores'
import ErrorState from '../../components/ErrorState'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import PartyApprovalEntry from '../../components/PartyApprovalEntry'
import { useCurrentIdentity } from '../../composables/useCurrentIdentity'
import { useMyPartyScores } from '../../composables/useMyPartyScores'
import { usePartyScoreApplicationStatuses } from '../../composables/usePartyScoreApplicationStatuses'
import { usePartyTemplateNames } from '../../composables/usePartyTemplateNames'
import {
  PARTY_RECENT_RECORD_LIMIT,
  PARTY_SCORE_APPLICATION_STATUS_COLOR,
} from '../../config/partyDeclaration'
import { SCHOOL_COLLEGE_PARENT_ORG_ID } from '../../config/organization'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'

/** 近期记录日期标签：月.日（数值型，各语言下通用；时间非法时返回占位符） */
function formatRecordDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getMonth() + 1}.${date.getDate()}`
}

/** 顶部组织链路：仅包含组织 2 的子组织，按「当前组织 → 上级组织」排列。 */
type PartyOrgChain = string[]

/** PartyHomeView 组件。
 * @returns 类型：Element
 */
export default function PartyHomeView() {
  const t = useT()
  const navigate = useNavigate()
  const { portalKey, moduleKey } = useParams<{
    portalKey: string
    moduleKey?: string
  }>()
  const username = useAuthStore((s) => s.username)
  const {
    name,
    organizationIds,
    loading: identityLoading,
  } = useCurrentIdentity()
  const { records, loading, error, refresh } = useMyPartyScores()
  const templateNames = usePartyTemplateNames()
  /** 首页顶部完整组织链路：组织树返回后一次性写入，避免各级组织分批出现 */
  const [orgChain, setOrgChain] = useState<PartyOrgChain | null>(null)
  /** 组织信息是否仍在解析：为 true 时顶部整体展示骨架屏，避免占位符/半成品名称闪现 */
  const [orgLoading, setOrgLoading] = useState(true)

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

    if (organizationIds.length === 0) {
      setOrgChain(null)
      setOrgLoading(false)
      return
    }

    setOrgLoading(true)
    Promise.all(
      organizationIds.map((id) => getOrganizationTree(id).catch(() => [])),
    )
      .then((chains) => {
        if (cancelled) return
        // 不能只取首个任职：它可能属于行政等其他组织体系。
        // 组织 2 是展示范围的根，根节点自身及其上级均不显示。
        const eligibleChains = chains
          .map((chain) => {
            const rootIndex = chain.findIndex((node) => node.id === SCHOOL_COLLEGE_PARENT_ORG_ID)
            return rootIndex < 0 ? [] : chain.slice(rootIndex + 1)
          })
          .filter((chain) => chain.length > 0)
          .sort((a, b) => b.length - a.length)
        const names = (eligibleChains[0] ?? []).slice().reverse()
          .map((node) => node.name).filter(Boolean)
        // 无法确认属于组织 2 时不使用其他任职或固定学校名称兜底。
        setOrgChain(names.length > 0 ? names : null)
      })
      .finally(() => {
        if (!cancelled) setOrgLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [organizationIds, identityLoading])

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

  // 近期记录审核状态：已核定分数直接判定成功，其余读取审批记录区分「被驳回 / 审核中」
  const { statuses } = usePartyScoreApplicationStatuses(recentRecords)

  /**
   * 打开申报详情页：从近期记录跳转到独立路由，携带来源模块以便侧栏高亮与返回。
   * @param record 当前点击的申报记录（必填）
   */
  const openRecordDetail = (record: PartyScore) => {
    if (!portalKey) return
    navigate(
      `/portal/${portalKey}/party-scores/${record.id}?from=${moduleKey ?? 'party_m1'}`,
    )
  }

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
                    index === 0
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
      <PartyApprovalEntry />

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
            {recentRecords.map((record) => {
              const status = statuses.get(record.id)
              return (
                <li
                  key={record.id}
                  className="party-record-item"
                  style={{ cursor: 'pointer' }}
                  title={t('partyDeclaration.rowClickHint')}
                  onDoubleClick={() => openRecordDetail(record)}
                >
                  <span className="party-record-date">
                    {formatRecordDate(record.created_at)}
                  </span>
                  <span className="party-record-act">
                    {isPartyScoreDeduction(record) ? t('partyDeduction.type') : record.template_id != null
                      ? templateNames.get(record.template_id) ?? record.template_id
                      : t('common.unknown')}
                  </span>
                  {/* 近期记录只展示审核状态，不展示申请分数，避免被误认为已获得成绩 */}
                  <span className="party-record-status">
                    {isPartyScoreDeduction(record) ? <Tag color="error">{t('partyDeduction.success')}</Tag> : status ? (
                      <Tag color={PARTY_SCORE_APPLICATION_STATUS_COLOR[status]}>
                        {t(`partyDeclaration.applicationStatus_${status}`)}
                      </Tag>
                    ) : (
                      <Spin size="small" />
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
