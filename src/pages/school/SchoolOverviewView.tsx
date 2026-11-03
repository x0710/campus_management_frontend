/**
 * 党委学校端：总览（学校驾驶舱 → 全校党建驾驶舱 / 各二级党委排名）。
 *
 * 已接入真实接口：
 *   全校党员（人）  固定以「学院党委」容器（ID=2）为起点 →
 *                   POST /api/organizations/member-counts（org_id=2 + recursive=true，
 *                   后端按用户 ID 去重，含全部下级组织）
 *   平均分          GET /api/party/scores/organization-average?organization_id=2&recursive=true
 *   各二级党委排名   GET /api/organizations/{id}/subsidiaries 获取「学院党委」容器（ID=2）下的
 *                   各二级学院党委，再逐个调用 GET /api/party/scores/organization-average
 *                   （recursive=true）后按平均分排序
 *
 * 交互：点击某二级党委的成绩排名 → 选中该党委并跳转「组织概览」（school_m6），
 * 由组织概览展示该党委的下级组织统计（选中态与树展开态经 uiState 跨路由传递）。
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
import {
  SCHOOL_COLLEGE_PARENT_ORG_ID,
  SCHOOL_ORG_OVERVIEW_MODULE_KEY,
} from '../../config/organization'
import { useT } from '../../i18n'
import { useUiStateStore } from '../../store/uiState'
import { formatPartyScoreTotalDecimal, formatScoreDecimal, toPartyScoreTotal } from '../../utils/partyScore'

interface CommitteeRankingItem {
  id: number
  name: string
  score: number | null
}

export default function SchoolOverviewView() {
  const t = useT()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()
  const setSelectedOrgId = useUiStateStore((s) => s.setSelectedOrgId)
  const setOrgTreeExpanded = useUiStateStore((s) => s.setOrgTreeExpanded)
  const setOrgTreeCollapsed = useUiStateStore((s) => s.setOrgTreeCollapsed)

  /** 全校党员总数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
  /** 全校党建活动加分平均分（后端为字符串；null 表示无数据或加载失败） */
  const [averageScore, setAverageScore] = useState<string | null>(null)
  /** 各二级党委排名（按平均分从高到低） */
  const [committeeRankings, setCommitteeRankings] = useState<CommitteeRankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      const [memberTotal, average, subsidiaries] = await Promise.all([
        countOrgMemberTotal(SCHOOL_COLLEGE_PARENT_ORG_ID),
        getPartyScoreOrganizationAverage({
          organization_id: SCHOOL_COLLEGE_PARENT_ORG_ID,
          recursive: true,
        }),
        listSubsidiaries(SCHOOL_COLLEGE_PARENT_ORG_ID),
      ])
      const committeeAverages = await Promise.all(
        subsidiaries.map((committee) =>
          getPartyScoreOrganizationAverage({
            organization_id: committee.id,
            recursive: true,
          }),
        ),
      )
      const rankedCommittees = subsidiaries
        .map((committee, index) => ({
          id: committee.id,
          name: committee.name,
          score: toPartyScoreTotal(committeeAverages[index].average_score),
        }))
        .sort(
          (a, b) =>
            (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY),
        )
      setMembers(memberTotal)
      setAverageScore(average.average_score)
      setCommitteeRankings(rankedCommittees)
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
   * 点击某二级党委的成绩排名：选中该党委并跳转到「组织概览」，
   * 同时展开其在组织树上的节点，使右侧直接展示该党委的下级组织统计
   * （与组织成员管理的搜索定位一致：选中 + 展开祖先链 + 滚动到节点）。
   * @param orgId 目标党委组织 ID（必填）
   */
  const openOrgOverview = useCallback(
    (orgId: number) => {
      setSelectedOrgId(SCHOOL_ORG_OVERVIEW_MODULE_KEY, orgId)
      // 排名项均为「学院党委」容器（ID=2）的直接下级，展开容器与目标党委即可看到其下级组织
      setOrgTreeExpanded(SCHOOL_ORG_OVERVIEW_MODULE_KEY, [
        SCHOOL_COLLEGE_PARENT_ORG_ID,
        orgId,
      ])
      // 组织树被收起时先展开，保证跳转后能看到定位到该党委的节点
      setOrgTreeCollapsed(SCHOOL_ORG_OVERVIEW_MODULE_KEY, false)
      navigate(`/portal/${portalKey ?? 'school'}/${SCHOOL_ORG_OVERVIEW_MODULE_KEY}`, {
        // 透传定位目标：组织概览挂载后把树滚动到该节点
        state: { focusOrgId: orgId },
      })
    },
    [navigate, portalKey, setOrgTreeCollapsed, setOrgTreeExpanded, setSelectedOrgId],
  )

  /** 加载中显示占位符，避免先闪出 0 再跳变为真实值 */
  const statText = (value: number | null) => (loading ? '—' : String(value ?? 0))
  // 全校平均分最多保留小数点后 3 位（如 70.035），避免浮点误差产生超长文本
  const averageText = loading ? '—' : formatPartyScoreTotalDecimal(averageScore)
  const maxCommitteeScore = useMemo(
    () => Math.max(0, ...committeeRankings.map((item) => item.score ?? 0)),
    [committeeRankings],
  )

  return (
    <div className="party-view">
      {error && (
        <ErrorState
          message={error}
          onRetry={retry}
        />
      )}

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('school.title')}</h3>
        </header>
        <div className="panel-card-body">
          {/* 全校党建驾驶舱 */}
          <h4 className="school-section-title">{t('school.cockpitTitle')}</h4>
          <div className="school-overview">
            <div className="school-overview-item">
              <span className="school-overview-label">{t('school.statMembers')}</span>
              <span className="school-overview-value">
                {statText(members)}
                <em className="school-overview-unit">{t('school.membersUnit')}</em>
              </span>
            </div>
            <div className="school-overview-item">
              <span className="school-overview-label">{t('school.statAvgScore')}</span>
              <span className="school-overview-value">{averageText}</span>
            </div>
          </div>

          {/* 各二级党委排名 */}
          <h4 className="school-section-title">{t('school.rankingTitle')}</h4>
          <div className="school-rank-list">
            {committeeRankings.map((item, index) => {
              const score = item.score ?? 0
              const barWidth =
                maxCommitteeScore > 0 && item.score !== null
                  ? `${Math.max(0, score / maxCommitteeScore) * 100}%`
                  : '0%'
              return (
                <Tooltip key={item.id} title={t('school.rankJumpHint')} placement="top">
                  <button
                    type="button"
                    className="school-rank-row"
                    aria-label={`${item.name}：${t('school.rankJumpHint')}`}
                    onClick={() => openOrgOverview(item.id)}
                  >
                    <span className="school-rank-name">
                      {index + 1}. {item.name}
                    </span>
                    {/* 条形只按分数比例占宽，分数文本独立成列（固定宽度），
                        避免「70.035」比「70」更宽时挤压条形，导致分数高的条形反而更短 */}
                    <div className="school-rank-track">
                      <div className="school-rank-bar" style={{ width: barWidth }} />
                    </div>
                    <span className="school-rank-score">
                      {loading ? '—' : formatScoreDecimal(item.score)}
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
