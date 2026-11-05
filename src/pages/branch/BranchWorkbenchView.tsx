/**
 * 支部端：工作台（本支部概况 / 等级分布 / 待办事项）。
 *
 * 已接入真实接口：
 *   支部总人数（人）  经 composables/usePortalOrg 定位当前用户所属支部 →
 *                   POST /api/organizations/member-counts（org_id + recursive=true，
 *                   后端按用户 ID 去重，含全部下级组织）
 *   党员人数（人）  按职位名称「中共党员」经 GET /api/positions 解析职位编码后，
 *                   调用 POST /api/organizations/member-counts（position + recursive=true）
 *   预备党员人数（人） 同上，按职位名称「中共预备党员」统计
 *   待审核申报（条） 前端用 GET /api/party-scores + /api/approvals 合成党建加分审批步骤，
 *                   按 status=waiting / pending 各取一页后合计条数；
 *                   底层接口不返回分页 total，故以返回条数计（默认过滤「我的待办」= 当前审批人的待处理申报）
 *   平均分          GET /api/party/scores/organization-average?organization_id=…&recursive=true
 *   等级分布        前端拉取支部成员 uid，再经 GET /api/party/scores 批量查询分数后按等级统计
 *
 * 卡片跳转：支部总人数 → 支部管理（branch_m5），待审核申报 → 审核管理（branch_m3）。
 */
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { queryOrgMembers } from '../../api/organizations'
import {
  getPartyScoreOrganizationAverage,
  getPartyScoreTotals,
  queryPartyScoreApprovals,
} from '../../api/partyScores'
import { extractErrorReason } from '../../api/common'
import ErrorState from '../../components/ErrorState'
import { countOrgMemberTotal } from '../../composables/useOrgMemberTotal'
import {
  countOrgMembersByPositionNames,
  listOrgSelfAndDescendantIds,
} from '../../composables/useOrgPositionMemberCounts'
import { resolvePortalOrg } from '../../composables/usePortalOrg'
import { BRANCH_ANCESTOR_DEPTHS } from '../../config/organization'
import {
  PARTY_FULL_MEMBER_STATUS_NAME,
  PARTY_PROBATIONARY_STATUS_NAME,
} from '../../config/partyProfile'
import { PARTY_SCORE_TODO_PAGE_SIZE } from '../../config/partyScoreApproval'
import { useT } from '../../i18n'
import {
  formatPartyScoreTotalDecimal,
  getPartyScoreGrade,
  toPartyScoreTotal,
} from '../../utils/partyScore'

/** 支部成员单页拉取条数 */
const BRANCH_MEMBER_PAGE_SIZE = 100

interface GradeDistributionItem {
  key: string
  tone: 'pioneer' | 'demonstration' | 'progress' | 'warning'
  count: number
}

const GRADE_DISTRIBUTION_ITEMS: Omit<GradeDistributionItem, 'count'>[] = [
  { key: 'branch.grade_pioneer', tone: 'pioneer' },
  { key: 'branch.grade_demonstration', tone: 'demonstration' },
  { key: 'branch.grade_progress', tone: 'progress' },
  { key: 'branch.grade_warning', tone: 'warning' },
]

/** 收集多个组织下的去重成员 uid */
async function collectMemberIds(orgIds: number[]): Promise<number[]> {
  const memberIds = new Set<number>()
  for (const orgId of orgIds) {
    for (let page = 1; ; page += 1) {
      const res = await queryOrgMembers(
        orgId,
        { page, page_size: BRANCH_MEMBER_PAGE_SIZE },
      )
      for (const member of res.data) memberIds.add(member.user_id)
      if (page >= res.total_pages) break
    }
  }
  return [...memberIds]
}

/** 前端根据成员党建活动加分计算等级分布 */
async function buildGradeDistribution(orgId: number): Promise<GradeDistributionItem[]> {
  const orgIds = await listOrgSelfAndDescendantIds(orgId)
  const memberIds = await collectMemberIds(orgIds)
  const batchScores = await getPartyScoreTotals(memberIds)
  const scoreMap = new Map<number, string>()
  for (const [uid, score] of batchScores) {
    scoreMap.set(uid, score)
  }

  const counts = new Map<string, number>()
  for (const item of GRADE_DISTRIBUTION_ITEMS) counts.set(item.key, 0)
  for (const uid of memberIds) {
    const total = toPartyScoreTotal(scoreMap.get(uid) ?? '0') ?? 0
    const grade = getPartyScoreGrade(total).grade
    const key = `branch.grade_${grade}` as const
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return GRADE_DISTRIBUTION_ITEMS.map((item) => ({
    ...item,
    count: counts.get(item.key) ?? 0,
  }))
}

export default function BranchWorkbenchView() {
  const t = useT()
  const { portalKey } = useParams<{ portalKey: string }>()

  /** 本支部总人数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
  /** 本支部党员人数（职位为「中共党员」）；null 表示未取到或职位未配置 */
  const [partyMembers, setPartyMembers] = useState<number | null>(null)
  /** 本支部预备党员人数（职位为「中共预备党员」）；null 表示未取到或职位未配置 */
  const [probationaryMembers, setProbationaryMembers] = useState<number | null>(null)
  /** 待审核申报条数（waiting + pending） */
  const [todoApprove, setTodoApprove] = useState<number | null>(null)
  /** 本支部党建活动加分平均分（后端为字符串；null 表示无数据或加载失败） */
  const [averageScore, setAverageScore] = useState<string | null>(null)
  /** 等级分布（前端根据成员分数计算） */
  const [distribution, setDistribution] = useState<GradeDistributionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      const { orgId } = await resolvePortalOrg(BRANCH_ANCESTOR_DEPTHS)
      const [
        memberTotal,
        waitingSteps,
        pendingSteps,
        average,
        gradeDistribution,
        partyCounts,
      ] = await Promise.all([
        orgId === null
          ? Promise.resolve(0)
          : countOrgMemberTotal(orgId),
        queryPartyScoreApprovals({ status: 'waiting', page: 1, page_size: PARTY_SCORE_TODO_PAGE_SIZE }),
        queryPartyScoreApprovals({ status: 'pending', page: 1, page_size: PARTY_SCORE_TODO_PAGE_SIZE }),
        orgId === null
          ? Promise.resolve({ average_score: null } as const)
          : getPartyScoreOrganizationAverage({ organization_id: orgId, recursive: true }),
        orgId === null
          ? Promise.resolve([])
          : buildGradeDistribution(orgId),
        // 党员 / 预备党员人数：按职位名称经成员列表接口统计（含全部下级组织）
        orgId === null
          ? Promise.resolve<Record<string, number | null>>({})
          : countOrgMembersByPositionNames(orgId, [
              PARTY_FULL_MEMBER_STATUS_NAME,
              PARTY_PROBATIONARY_STATUS_NAME,
            ]),
      ])
      setMembers(memberTotal)
      setPartyMembers(partyCounts[PARTY_FULL_MEMBER_STATUS_NAME] ?? null)
      setProbationaryMembers(partyCounts[PARTY_PROBATIONARY_STATUS_NAME] ?? null)
      setTodoApprove(waitingSteps.length + pendingSteps.length)
      setAverageScore(average.average_score)
      setDistribution(gradeDistribution)
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  /** 重新加载（事件回调内可安全重置加载态） */
  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    void load()
  }, [load])

  // 横向柱状图以最高人数为满长基准
  const maxCount = Math.max(0, ...distribution.map((item) => item.count))
  /** 加载中显示占位符，避免先闪出 0 再跳变为真实值 */
  const statText = (value: number | null) => (loading ? '—' : String(value ?? 0))
  /** 按职位统计的人数：加载中或职位未配置时显示占位符，不误显示为 0 */
  const positionCountText = (value: number | null) =>
    loading || value === null ? '—' : String(value)
  // 支部平均分同样最多保留小数点后 3 位（与学校端 / 学院端口径一致）
  const averageText = loading ? '—' : formatPartyScoreTotalDecimal(averageScore)

  return (
    <div className="party-view">
      {error && (
        <ErrorState
          message={error}
          onRetry={retry}
        />
      )}

      {/* 本支部概况（红色背景统计区，与学院端工作台保持一致） */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('branch.overviewTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <div className="branch-overview">
            {/* 支部总人数 → 支部管理（查看本支部及下级组织成员） */}
            <Link
              className="branch-overview-item branch-overview-link"
              to={`/portal/${portalKey}/branch_m5`}
            >
              <div className="branch-overview-label">{t('branch.statMembers')}</div>
              <div className="branch-overview-value">
                {statText(members)}
                <span className="branch-overview-unit">{t('branch.membersUnit')}</span>
              </div>
            </Link>
            {/* 党员人数：按职位「中共党员」统计（含全部下级组织） */}
            <div className="branch-overview-item">
              <div className="branch-overview-label">{t('branch.statPartyMembers')}</div>
              <div className="branch-overview-value">
                {positionCountText(partyMembers)}
                <span className="branch-overview-unit">{t('branch.membersUnit')}</span>
              </div>
            </div>
            {/* 预备党员人数：按职位「中共预备党员」统计（含全部下级组织） */}
            <div className="branch-overview-item">
              <div className="branch-overview-label">{t('branch.statProbationaryMembers')}</div>
              <div className="branch-overview-value">
                {positionCountText(probationaryMembers)}
                <span className="branch-overview-unit">{t('branch.membersUnit')}</span>
              </div>
            </div>
            <div className="branch-overview-item">
              <div className="branch-overview-label">{t('branch.statAvgScore')}</div>
              <div className="branch-overview-value">
                {averageText}
                <span className="branch-overview-unit">{t('party.scoreUnit')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 等级分布（横向柱状图） */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('branch.distributionTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <div className="branch-chart-list">
            {distribution.map((item) => (
              <div key={item.tone} className="branch-chart-row">
                <span className="branch-chart-label">{t(item.key)}</span>
                <div className="branch-chart-track">
                  <div
                    className={`branch-chart-bar branch-bar-${item.tone}`}
                    style={{ width: `${Math.round((item.count / maxCount) * 100)}%` }}
                  />
                  <span className="branch-chart-value">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 待办事项（待审核申报：我的党建加分审批待办中 waiting + pending 条数） */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('branch.todoTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <ul className="branch-todo-list">
            {/* 待审核申报 → 审核管理（处理待办审批） */}
            <li className="branch-todo-item">
              <Link className="branch-todo-link" to={`/portal/${portalKey}/branch_m3`}>
                <span className="branch-todo-label">{t('branch.todo_approve')}</span>
                <span className="branch-todo-count">
                  {statText(todoApprove)}
                  <span className="branch-todo-unit">{t('branch.todoUnitItems')}</span>
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
