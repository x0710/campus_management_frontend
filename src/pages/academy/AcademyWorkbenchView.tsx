import { getPortalPath } from '../../config/routes'
import { usePortalParams } from '../../hooks/usePortalParams'
/**
 * 党委学院端：工作台（学院先锋指数总览 / 组织概览 / 待办事项）。
 *
 * 已接入真实接口：
 *   学院总人数（人）  经 composables/usePortalOrg 定位当前用户所属「学院」组织（组织树深度 1）→
 *                   POST /api/organizations/member-counts（org_id + recursive=true，
 *                   后端按用户 ID 去重，含全部下级组织）
 *   党员人数（人）  按职位名称「中共党员」经 GET /api/positions 解析职位编码后，
 *                   调用 POST /api/organizations/member-counts（position + recursive=true）
 *   预备党员人数（人） 同上，按职位名称「中共预备党员」统计
 *   党员 / 预备党员的男女分布  同上统计加 ?include=gender，返回 male / female 人数
 *   少数民族人数（人） 学院总人数同一次统计加 ?include=ethnic，
 *                   从 ethnic_counts 中排除「汉族 / unknown」后求和
 *   平均分          GET /api/party/scores/organization-average?organization_id=…&recursive=true
 *   待审核申报（条） 与支部端工作台同一口径：GET /api/party-scores + /api/approvals 合成党建加分审批步骤，
 *                   按 status=waiting / pending 各取一页后合计条数
 *
 * 组织概览：与学校端总览下方的组织概览一致（左侧组织树 + 右侧下级组织统计表），
 * 以当前学院组织为根；学院没有下级组织时隐藏组织树，只展示空表。
 *
 * 交互：点击待办事项 → 跳转「审核管理」（academy_m3）；
 * 组织概览中双击行 / 「查看详细」→ 跳转「学院支部管理」（academy_m5）查看该支部成员。
 *
 */
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { extractErrorReason } from '../../api/common'
import { queryOrganizationMemberCounts } from '../../api/organizations'
import { getPartyScoreOrganizationAverage, queryPartyScoreApprovals } from '../../api/partyScores'
import ErrorState from '../../components/ErrorState'
import { countOrgMembersByPositionNamesWithGender } from '../../composables/useOrgPositionMemberCounts'
import { resolvePortalOrg } from '../../composables/usePortalOrg'
import {
  ACADEMY_ANCESTOR_DEPTHS,
  ACADEMY_BRANCH_MODULE_KEY,
  ACADEMY_ORG_OVERVIEW_UI_KEY,
} from '../../config/organization'
import {
  PARTY_FULL_MEMBER_STATUS_NAME,
  PARTY_PROBATIONARY_STATUS_NAME,
} from '../../config/partyProfile'
import { PARTY_SCORE_TODO_PAGE_SIZE } from '../../config/partyScoreApproval'
import { useT } from '../../i18n'
import SchoolOrgOverviewView from '../school/SchoolOrgOverviewView'
import { countEthnicMinority } from '../../utils/ethnic'
import { formatPartyScoreTotalDecimal } from '../../utils/partyScore'

/** AcademyWorkbenchView 组件。
 * @returns 类型：Element
 */
export default function AcademyWorkbenchView() {
  const t = useT()
  const { portalKey } = usePortalParams<{ portalKey: string }>()

  /** 当前用户所属学院组织 ID（null 表示尚未解析到）：作为组织概览的组织树根 */
  const [academyOrgId, setAcademyOrgId] = useState<number | null>(null)

  /** 学院总人数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
  /** 本院党员人数（职位为「中共党员」）；null 表示未取到或职位未配置 */
  const [partyMembers, setPartyMembers] = useState<number | null>(null)
  /** 本院预备党员人数（职位为「中共预备党员」）；null 表示未取到或职位未配置 */
  const [probationaryMembers, setProbationaryMembers] = useState<number | null>(null)
  /** 中共党员中的男性人数；null 表示未取到或职位未配置 */
  const [malePartyMembers, setMalePartyMembers] = useState<number | null>(null)
  /** 中共党员中的女性人数；null 表示未取到或职位未配置 */
  const [femalePartyMembers, setFemalePartyMembers] = useState<number | null>(null)
  /** 预备党员中的男性人数；null 表示未取到或职位未配置 */
  const [maleProbationaryMembers, setMaleProbationaryMembers] = useState<number | null>(null)
  /** 预备党员中的女性人数；null 表示未取到或职位未配置 */
  const [femaleProbationaryMembers, setFemaleProbationaryMembers] = useState<number | null>(null)
  /** 本院少数民族人数（民族分布中排除汉族与 unknown 后的人数） */
  const [minorityMembers, setMinorityMembers] = useState<number | null>(null)
  /** 本院党建活动加分平均分（后端为字符串；null 表示无数据或加载失败） */
  const [averageScore, setAverageScore] = useState<string | null>(null)
  /** 待审核申报条数（waiting + pending，与支部端工作台同一口径） */
  const [todoApprove, setTodoApprove] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      // 待办统计与组织解析并行：待办不依赖学院组织，任何情况下都应展示
      const [{ orgId }, waitingSteps, pendingSteps] = await Promise.all([
        resolvePortalOrg(ACADEMY_ANCESTOR_DEPTHS),
        queryPartyScoreApprovals({
          status: 'waiting',
          page: 1,
          page_size: PARTY_SCORE_TODO_PAGE_SIZE,
        }),
        queryPartyScoreApprovals({
          status: 'pending',
          page: 1,
          page_size: PARTY_SCORE_TODO_PAGE_SIZE,
        }),
      ])
      setAcademyOrgId(orgId)
      setTodoApprove(waitingSteps.length + pendingSteps.length)
      if (orgId === null) {
        setMembers(0)
        setMinorityMembers(null)
        setPartyMembers(null)
        setMalePartyMembers(null)
        setFemalePartyMembers(null)
        setProbationaryMembers(null)
        setMaleProbationaryMembers(null)
        setFemaleProbationaryMembers(null)
        setAverageScore(null)
        return
      }
      const [memberCounts, average, partyCounts] = await Promise.all([
        // 学院总人数与少数民族人数同一次统计：include=ethnic 返回 ethnic_counts
        queryOrganizationMemberCounts([{ org_id: orgId, recursive: true }], ['ethnic']),
        getPartyScoreOrganizationAverage({ organization_id: orgId, recursive: true }),
        // 党员 / 预备党员人数及男女分布：按职位名称（身份）解析编码后递归统计
        countOrgMembersByPositionNamesWithGender(orgId, [
          PARTY_FULL_MEMBER_STATUS_NAME,
          PARTY_PROBATIONARY_STATUS_NAME,
        ]),
      ])
      setMembers(memberCounts[0]?.member_count ?? 0)
      setMinorityMembers(countEthnicMinority(memberCounts[0]?.ethnic_counts))
      setPartyMembers(partyCounts[PARTY_FULL_MEMBER_STATUS_NAME]?.total ?? null)
      setMalePartyMembers(partyCounts[PARTY_FULL_MEMBER_STATUS_NAME]?.male ?? null)
      setFemalePartyMembers(partyCounts[PARTY_FULL_MEMBER_STATUS_NAME]?.female ?? null)
      setProbationaryMembers(partyCounts[PARTY_PROBATIONARY_STATUS_NAME]?.total ?? null)
      setMaleProbationaryMembers(partyCounts[PARTY_PROBATIONARY_STATUS_NAME]?.male ?? null)
      setFemaleProbationaryMembers(partyCounts[PARTY_PROBATIONARY_STATUS_NAME]?.female ?? null)
      setAverageScore(average.average_score)
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

  /** 加载中显示占位符，避免先闪出 0 再跳变为真实值 */
  const statText = (value: number | null) => (loading ? '—' : String(value ?? 0))
  /** 按职位统计的人数：加载中或职位未配置时显示占位符，不误显示为 0 */
  const positionCountText = (value: number | null) =>
    loading || value === null ? '—' : String(value)
  // 全院平均分最多保留小数点后 3 位（如 70.035），避免浮点误差产生超长文本
  const averageText = loading ? '—' : formatPartyScoreTotalDecimal(averageScore)

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
            {/* 少数民族人数：民族分布中排除汉族与 unknown */}
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('partyStats.minorityMembers')}</span>
              <span className="academy-overview-value">
                {statText(minorityMembers)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            {/* 党员人数：按职位「中共党员」统计（含全部下级组织） */}
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('academy.statPartyMembers')}</span>
              <span className="academy-overview-value">
                {positionCountText(partyMembers)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            {/* 男 / 女中共党员人数 */}
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('partyStats.maleFullMembers')}</span>
              <span className="academy-overview-value">
                {positionCountText(malePartyMembers)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('partyStats.femaleFullMembers')}</span>
              <span className="academy-overview-value">
                {positionCountText(femalePartyMembers)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            {/* 预备党员人数：按职位「中共预备党员」统计（含全部下级组织） */}
            <div className="academy-overview-item">
              <span className="academy-overview-label">
                {t('academy.statProbationaryMembers')}
              </span>
              <span className="academy-overview-value">
                {positionCountText(probationaryMembers)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            {/* 男 / 女预备党员人数 */}
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('partyStats.maleProbationaryMembers')}</span>
              <span className="academy-overview-value">
                {positionCountText(maleProbationaryMembers)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('partyStats.femaleProbationaryMembers')}</span>
              <span className="academy-overview-value">
                {positionCountText(femaleProbationaryMembers)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('academy.statAvgScore')}</span>
              <span className="academy-overview-value">{averageText}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 组织概览：与学校端总览下方一致（左侧组织树 + 右侧下级组织统计表）；
          学院没有下级组织时隐藏组织树，只展示空表 */}
      {academyOrgId !== null && (
        <section className="school-org-region">
          <h4 className="school-section-title">{t('school.orgSectionTitle')}</h4>
          <div className="school-org-section">
            <SchoolOrgOverviewView
              rootOrgId={academyOrgId}
              uiKey={ACADEMY_ORG_OVERVIEW_UI_KEY}
              detailModuleKey={ACADEMY_BRANCH_MODULE_KEY}
              showOrgActions={false}
              hideTreeWhenNoChildren
            />
          </div>
        </section>
      )}

      {/* 待办事项（与支部端工作台一致：待审核申报 = waiting + pending 条数） */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('academy.todoTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <ul className="branch-todo-list">
            {/* 待审核加分申报 → 审核管理（处理待办审批） */}
            <li className="branch-todo-item">
              <Link className="branch-todo-link" to={`${getPortalPath(portalKey)}/academy_m3`}>
                <span className="branch-todo-label">{t('academy.todoApprove')}</span>
                <span className="branch-todo-count">
                  {statText(todoApprove)}
                  <span className="branch-todo-unit">{t('academy.todoUnitItems')}</span>
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
