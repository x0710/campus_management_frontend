/**
 * 党委支部端：工作台（本支部概况 / 等级分布 / 待办事项）。
 *
 * 已接入真实接口：
 *   党员总数（人）  经 composables/usePortalOrg 定位当前用户所属支部 →
 *                   GET /api/organizations/{id}/member-counts?recursive=true
 *                   按组织统计成员数（含全部下级组织，前端相加得总数）
 *   待审核申报（条） 前端用 GET /api/party-scores + /api/approvals 合成党建加分审批步骤，
 *                   按 status=waiting / pending 各取一页后合计条数；
 *                   底层接口不返回分页 total，故以返回条数计（默认过滤「我的待办」= 当前审批人的待处理申报）
 *   平均分          GET /api/party/scores/organization-average?organization_id=…&recursive=true
 *   等级分布        前端拉取支部成员 uid，再经 GET /api/party/scores 批量查询分数后按等级统计
 *
 * 卡片跳转：党员总数 → 支部管理（branch_m5），待审核申报 → 审核管理（branch_m3）。
 */
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { listSubsidiaries, queryOrgMembers } from '../../api/organizations'
import {
  getPartyScoreOrganizationAverage,
  getPartyScoreTotals,
  queryPartyScoreApprovals,
} from '../../api/partyScores'
import { extractErrorReason } from '../../api/common'
import ErrorState from '../../components/ErrorState'
import { countOrgMemberTotal } from '../../composables/useOrgMemberTotal'
import { resolvePortalOrg } from '../../composables/usePortalOrg'
import { BRANCH_ANCESTOR_DEPTHS } from '../../config/organization'
import { useT } from '../../i18n'
import { formatPartyScoreTotal, getPartyScoreGrade, toPartyScoreTotal } from '../../utils/partyScore'

/** 待审核申报统计单页条数：底层审批步骤接口无 total，按返回条数合计（代码要求 12：单页最多 100 条） */
const APPROVAL_TODO_PAGE_SIZE = 100

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

/** 收集组织及其全部下级组织 ID */
async function collectOrgIds(rootId: number): Promise<number[]> {
  const ids = [rootId]
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) continue
    const children = await listSubsidiaries(current)
    for (const child of children) {
      ids.push(child.id)
      queue.push(child.id)
    }
  }
  return ids
}

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
  const orgIds = await collectOrgIds(orgId)
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

  /** 本支部党员总数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
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
      const [memberTotal, waitingSteps, pendingSteps, average, gradeDistribution] = await Promise.all([
        orgId === null
          ? Promise.resolve(0)
          : countOrgMemberTotal(orgId),
        queryPartyScoreApprovals({ status: 'waiting', page: 1, page_size: APPROVAL_TODO_PAGE_SIZE }),
        queryPartyScoreApprovals({ status: 'pending', page: 1, page_size: APPROVAL_TODO_PAGE_SIZE }),
        orgId === null
          ? Promise.resolve({ average_score: null } as const)
          : getPartyScoreOrganizationAverage({ organization_id: orgId, recursive: true }),
        orgId === null
          ? Promise.resolve([])
          : buildGradeDistribution(orgId),
      ])
      setMembers(memberTotal)
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
  const averageText = loading ? '—' : formatPartyScoreTotal(averageScore)

  return (
    <div className="party-view">
      {error && (
        <ErrorState
          message={error}
          onRetry={retry}
        />
      )}

      {/* 本支部概况 */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('branch.overviewTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <div className="branch-overview">
            {/* 党员总数 → 支部管理（查看本支部及下级组织成员） */}
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
