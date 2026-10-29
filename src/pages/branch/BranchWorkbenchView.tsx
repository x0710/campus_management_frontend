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
 *
 * 平均分与等级分布后端暂无对应接口，仍为模拟数据，故本页保留模拟数据提示。
 *
 * 卡片跳转：党员总数 → 支部管理（branch_m5），待审核申报 → 审核管理（branch_m3）。
 */
import { Alert } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { queryPartyScoreApprovals } from '../../api/partyScores'
import { extractErrorReason } from '../../api/common'
import ErrorState from '../../components/ErrorState'
import { countOrgMemberTotal } from '../../composables/useOrgMemberTotal'
import { resolvePortalOrg } from '../../composables/usePortalOrg'
import { BRANCH_ANCESTOR_DEPTHS } from '../../config/organization'
import { useT } from '../../i18n'

/** 待审核申报统计单页条数：底层审批步骤接口无 total，按返回条数合计（代码要求 12：单页最多 100 条） */
const APPROVAL_TODO_PAGE_SIZE = 100

/** 平均分（模拟数据，后端暂无接口） */
const MOCK_AVG_SCORE = 82.4

/** 等级分布（模拟数据，后端暂无接口；各等级人数合计与党员总数保持一致） */
const MOCK_DISTRIBUTION: { key: string; tone: string; count: number }[] = [
  { key: 'branch.grade_pioneer', tone: 'pioneer', count: 32 },
  { key: 'branch.grade_demonstration', tone: 'demonstration', count: 58 },
  { key: 'branch.grade_progress', tone: 'progress', count: 26 },
  { key: 'branch.grade_warning', tone: 'warning', count: 12 },
]

export default function BranchWorkbenchView() {
  const t = useT()
  const { portalKey } = useParams<{ portalKey: string }>()

  /** 本支部党员总数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
  /** 待审核申报条数（waiting + pending） */
  const [todoApprove, setTodoApprove] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      const { orgId } = await resolvePortalOrg(BRANCH_ANCESTOR_DEPTHS)
      const [memberTotal, waitingSteps, pendingSteps] = await Promise.all([
        orgId === null
          ? Promise.resolve(0)
          : countOrgMemberTotal(orgId),
        queryPartyScoreApprovals({ status: 'waiting', page: 1, page_size: APPROVAL_TODO_PAGE_SIZE }),
        queryPartyScoreApprovals({ status: 'pending', page: 1, page_size: APPROVAL_TODO_PAGE_SIZE }),
      ])
      setMembers(memberTotal)
      setTodoApprove(waitingSteps.length + pendingSteps.length)
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
  const maxCount = Math.max(...MOCK_DISTRIBUTION.map((item) => item.count))
  /** 加载中显示占位符，避免先闪出 0 再跳变为真实值 */
  const statText = (value: number | null) => (loading ? '—' : String(value ?? 0))

  return (
    <div className="party-view">
      {error ? (
        <ErrorState
          message={error}
          onRetry={retry}
        />
      ) : (
        <Alert type="warning" showIcon title={t('branch.mockHint')} />
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
                {MOCK_AVG_SCORE}
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
            {MOCK_DISTRIBUTION.map((item) => (
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
