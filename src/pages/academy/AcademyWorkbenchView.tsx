/**
 * 党委学院端：工作台（学院先锋指数总览 / 各支部排名）。
 *
 * 已接入真实接口：
 *   全院党员（人）  经 composables/usePortalOrg 定位当前用户所属「学院」组织（组织树深度 1）→
 *                   GET /api/organizations/{id}/member-counts?recursive=true
 *                   按组织统计成员数（含全部下级组织，前端相加得总数）
 *   平均分          GET /api/party/scores/organization-average?organization_id=…&recursive=true
 *   各支部排名       GET /api/organizations/{id}/subsidiaries 获取直接下级支部，
 *                   再逐个调用 GET /api/party/scores/organization-average 后按平均分排序
 *
 * 交互：点击某支部的成绩排名 → 选中该支部并跳转「学院支部管理」（academy_m5），
 * 由该页直接展示该支部的成员列表（选中态与树展开态经 uiState 跨路由传递）。
 *
 */
import { Tooltip } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { extractErrorReason } from '../../api/common'
import { listSubsidiaries } from '../../api/organizations'
import { getPartyScoreOrganizationAverage } from '../../api/partyScores'
import ErrorState from '../../components/ErrorState'
import { countOrgMemberTotal } from '../../composables/useOrgMemberTotal'
import { resolvePortalOrg } from '../../composables/usePortalOrg'
import { ACADEMY_ANCESTOR_DEPTHS, ACADEMY_BRANCH_MODULE_KEY } from '../../config/organization'
import { useT } from '../../i18n'
import { useUiStateStore } from '../../store/uiState'
import { formatPartyScoreTotalDecimal, formatScoreDecimal, toPartyScoreTotal } from '../../utils/partyScore'

interface BranchRankingItem {
  id: number
  name: string
  score: number | null
}

export default function AcademyWorkbenchView() {
  const t = useT()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()
  const setSelectedOrgId = useUiStateStore((s) => s.setSelectedOrgId)
  const setMemberPage = useUiStateStore((s) => s.setMemberPage)
  const setOrgTreeExpanded = useUiStateStore((s) => s.setOrgTreeExpanded)
  const setOrgTreeCollapsed = useUiStateStore((s) => s.setOrgTreeCollapsed)
  const setMemberSearchState = useUiStateStore((s) => s.setMemberSearchState)

  /** 当前用户所属学院组织 ID（null 表示尚未解析到）：用于跳转时展开到支部节点的祖先链 */
  const [academyOrgId, setAcademyOrgId] = useState<number | null>(null)

  /** 本院党员总数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
  /** 本院党建活动加分平均分（后端为字符串；null 表示无数据或加载失败） */
  const [averageScore, setAverageScore] = useState<string | null>(null)
  /** 下级支部排名（按平均分从高到低） */
  const [branchRankings, setBranchRankings] = useState<BranchRankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      const { orgId } = await resolvePortalOrg(ACADEMY_ANCESTOR_DEPTHS)
      setAcademyOrgId(orgId)
      if (orgId === null) {
        setMembers(0)
        setAverageScore(null)
        setBranchRankings([])
        return
      }
      const [memberTotal, average, subsidiaries] = await Promise.all([
        countOrgMemberTotal(orgId),
        getPartyScoreOrganizationAverage({ organization_id: orgId, recursive: true }),
        listSubsidiaries(orgId),
      ])
      const branchAverages = await Promise.all(
        subsidiaries.map((branch) =>
          getPartyScoreOrganizationAverage({ organization_id: branch.id }),
        ),
      )
      const rankedBranches = subsidiaries
        .map((branch, index) => ({
          id: branch.id,
          name: branch.name,
          score: toPartyScoreTotal(branchAverages[index].average_score),
        }))
        .sort(
          (a, b) =>
            (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY),
        )
      setMembers(memberTotal)
      setAverageScore(average.average_score)
      setBranchRankings(rankedBranches)
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

  /**
   * 点击某支部成绩排名：选中该支部并跳转「学院支部管理」（academy_m5），
   * 由该页直接展示该支部的成员列表（与组织概览跳转一致，选中态经 uiState 跨路由传递）。
   * @param branchId 支部组织 ID（必填）
   */
  const openBranchMembers = useCallback(
    (branchId: number) => {
      setSelectedOrgId(ACADEMY_BRANCH_MODULE_KEY, branchId)
      // 清空该模块上次的成员搜索状态：避免「单独查看匹配人员」或旧搜索定位覆盖本次跳转
      setMemberSearchState(ACADEMY_BRANCH_MODULE_KEY, null)
      // 回到第 1 页，避免沿用上次浏览的页码导致跳转后看不到成员
      setMemberPage(ACADEMY_BRANCH_MODULE_KEY, 1)
      // 展开到该支部：学院组织 + 支部自身，保证左侧组织树能看到选中节点及其下级
      setOrgTreeExpanded(
        ACADEMY_BRANCH_MODULE_KEY,
        academyOrgId !== null ? [academyOrgId, branchId] : [branchId],
      )
      // 组织树被收起时先展开，保证跳转后能看到定位到该支部的节点
      setOrgTreeCollapsed(ACADEMY_BRANCH_MODULE_KEY, false)
      navigate(`/portal/${portalKey ?? 'academy'}/${ACADEMY_BRANCH_MODULE_KEY}`, {
        // 透传定位目标：学院支部管理挂载后把组织树滚动到该支部节点
        state: { focusOrgId: branchId },
      })
    },
    [
      academyOrgId,
      navigate,
      portalKey,
      setMemberPage,
      setMemberSearchState,
      setOrgTreeCollapsed,
      setOrgTreeExpanded,
      setSelectedOrgId,
    ],
  )

  /** 加载中显示占位符，避免先闪出 0 再跳变为真实值 */
  const statText = (value: number | null) => (loading ? '—' : String(value ?? 0))
  // 全院平均分最多保留小数点后 3 位（如 70.035），避免浮点误差产生超长文本
  const averageText = loading ? '—' : formatPartyScoreTotalDecimal(averageScore)
  const maxBranchScore = useMemo(
    () => Math.max(0, ...branchRankings.map((branch) => branch.score ?? 0)),
    [branchRankings],
  )

  return (
    <div className="party-view">
      {error ? (
        <ErrorState
          message={error}
          onRetry={retry}
        />
      ) : null}

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('academy.title')}</h3>
        </header>
        <div className="panel-card-body">
          {/* 学院先锋指数总览 */}
          <h4 className="academy-section-title">{t('academy.overviewTitle')}</h4>
          <div className="academy-overview">
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('academy.statMembers')}</span>
              <span className="academy-overview-value">
                {statText(members)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('academy.statAvgScore')}</span>
              <span className="academy-overview-value">{averageText}</span>
            </div>
          </div>

          {/* 各支部排名 */}
          <h4 className="academy-section-title">{t('academy.rankingTitle')}</h4>
          <div className="academy-rank-list">
            {branchRankings.map((branch, index) => {
              const branchScore = branch.score ?? 0
              const barWidth =
                maxBranchScore > 0 && branch.score !== null
                  ? `${Math.max(0, branchScore / maxBranchScore) * 100}%`
                  : '0%'
              return (
                <Tooltip key={branch.id} title={t('academy.rankJumpHint')} placement="top">
                  <button
                    type="button"
                    className="academy-rank-row"
                    aria-label={`${branch.name}：${t('academy.rankJumpHint')}`}
                    onClick={() => openBranchMembers(branch.id)}
                  >
                    <span className="academy-rank-name">
                      {index + 1}. {branch.name}
                    </span>
                    {/* 条形只按分数比例占宽，分数文本独立成列（固定宽度），
                        避免「70.035」比「70」更宽时挤压条形，导致分数高的条形反而更短 */}
                    <div className="academy-rank-track">
                      <div className="academy-rank-bar" style={{ width: barWidth }} />
                    </div>
                    <span className="academy-rank-score">
                      {loading ? '—' : formatScoreDecimal(branch.score)}
                    </span>
                  </button>
                </Tooltip>
              )
            })}
          </div>

        </div>
      </section>
    </div>
  )
}
