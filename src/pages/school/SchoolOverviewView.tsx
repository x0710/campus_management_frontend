/**
 * 党委学校端：总览（全校党建统计 + 组织概览）。
 *
 * 统计口径（人数均以「学院党委」容器 ID=2 为起点，含全部下级组织、按用户去重）：
 * - 组织人数：POST /api/organizations/member-counts（{ org_id: 2, recursive: true }）
 * - 少数民族人数：同一次统计加 ?include=ethnic，从 ethnic_counts 中排除「汉族 / unknown」后求和
 * - 中共党员人数 / 中共预备党员人数：按职位名称（身份）解析职位编码后递归统计，
 *   并通过 include=gender 同时取回男女分布
 * - 平均分：GET /api/party/scores/organization-average?organization_id=2&recursive=true
 * - 党组织个数：「学院党委」及其全部下级组织总数（组织树子树节点数）
 * - 党委个数：「学院党委」的直接下级组织数（不含再下级）
 * - 党总支个数：名称以「总支」结尾的组织数（含机关党委、附属医院党委等各条线的下级）
 * - 党支部个数：名称包含「支部」的组织数（与后端关键词检索口径一致）
 *
 * 页面结构：上方为统计卡片；下方内嵌原「组织概览」区域
 * （左侧组织树 + 右侧下级组织统计表，含组织新建/编辑/删除），
 * 原各二级党委排名条形图已由该区域替代，组织概览不再作为独立菜单模块。
 *
 * 滚动：本页自身作为滚动容器（左侧菜单不动），内容高度 = 统计卡 + 组织概览，
 * 组织概览区域高度等于一屏可用高度，因此最多只能滚到统计卡完全移出、
 * 组织概览占满整个屏幕的位置。
 */
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { subscribeCacheInvalidation } from '../../api/cache'
import { extractErrorReason } from '../../api/common'
import { listAllOrganizations, queryOrganizationMemberCounts } from '../../api/organizations'
import { getPartyScoreOrganizationAverage } from '../../api/partyScores'
import ErrorState from '../../components/ErrorState'
import { countOrgMembersByPositionNamesWithGender } from '../../composables/useOrgPositionMemberCounts'
import {
  ORG_BRANCH_NAME_KEYWORD,
  ORG_GENERAL_BRANCH_NAME_SUFFIX,
  SCHOOL_COLLEGE_PARENT_ORG_ID,
} from '../../config/organization'
import {
  PARTY_FULL_MEMBER_STATUS_NAME,
  PARTY_PROBATIONARY_STATUS_NAME,
} from '../../config/partyProfile'
import { useT } from '../../i18n'
import { formatPartyScoreTotalDecimal } from '../../utils/partyScore'
import { countEthnicMinority } from '../../utils/ethnic'
import { collectOrgSubtree } from '../../utils/orgTree'
import SchoolOrgOverviewView from './SchoolOrgOverviewView'

/** 总览统计项（null 表示未取到：加载中或加载失败） */
interface OverviewStats {
  /** 组织人数（学院党委及其全部下级组织） */
  orgMembers: number | null
  /** 少数民族人数（民族分布中排除汉族与 unknown 后的人数） */
  minorityMembers: number | null
  /** 中共党员人数 */
  fullMembers: number | null
  /** 男中共党员人数 */
  maleFullMembers: number | null
  /** 女中共党员人数 */
  femaleFullMembers: number | null
  /** 中共预备党员人数 */
  probationaryMembers: number | null
  /** 男中共预备党员人数 */
  maleProbationaryMembers: number | null
  /** 女中共预备党员人数 */
  femaleProbationaryMembers: number | null
  /** 全校组织先锋指数平均分（后端 DecimalText） */
  averageScore: string | null
  /** 党组织个数（学院党委及其全部下级组织） */
  partyOrgCount: number | null
  /** 党委个数（学院党委的直接下级） */
  committeeCount: number | null
  /** 党总支个数（机关党委的直接下级） */
  generalBranchCount: number | null
  /** 党支部个数（名称以「支部」结尾的组织） */
  branchCount: number | null
}

const EMPTY_STATS: OverviewStats = {
  orgMembers: null,
  minorityMembers: null,
  fullMembers: null,
  maleFullMembers: null,
  femaleFullMembers: null,
  probationaryMembers: null,
  maleProbationaryMembers: null,
  femaleProbationaryMembers: null,
  averageScore: null,
  partyOrgCount: null,
  committeeCount: null,
  generalBranchCount: null,
  branchCount: null,
}

/**
 * 总览统计的会话内缓存。
 * 成员人数走 POST /organizations/member-counts（本身不走向会话缓存），
 * 切换菜单再回到总览时直接复用上次请求，避免重复统计；
 * 组织/成员等数据发生变化（invalidate 触发）或退出登录时自动清空。
 */
let overviewStatsPromise: Promise<OverviewStats> | null = null

subscribeCacheInvalidation(() => {
  overviewStatsPromise = null
})

/**
 * 拉取总览的全部统计项（组织人数 / 少数民族人数 / 党员身份人数 / 平均分 / 各类组织个数）。
 * @returns Promise<OverviewStats> 统计结果
 */
async function fetchOverviewStats(): Promise<OverviewStats> {
  const [memberCounts, average, organizations, partyCounts] = await Promise.all([
    // 组织人数与少数民族人数同一次统计：include=ethnic 返回 ethnic_counts
    queryOrganizationMemberCounts(
      [{ org_id: SCHOOL_COLLEGE_PARENT_ORG_ID, recursive: true }],
      ['ethnic'],
    ),
    getPartyScoreOrganizationAverage({
      organization_id: SCHOOL_COLLEGE_PARENT_ORG_ID,
      recursive: true,
    }),
    listAllOrganizations(),
    // 党员 / 预备党员人数及男女分布：按职位名称（身份）解析编码后递归统计
    countOrgMembersByPositionNamesWithGender(SCHOOL_COLLEGE_PARENT_ORG_ID, [
      PARTY_FULL_MEMBER_STATUS_NAME,
      PARTY_PROBATIONARY_STATUS_NAME,
    ]),
  ])

  // 党组织个数：学院党委容器及其全部下级组织
  const subtree = collectOrgSubtree(organizations, SCHOOL_COLLEGE_PARENT_ORG_ID)

  // 党委个数：学院党委的直接下级（不含下级组织的下级）
  const committeeCount = organizations.filter(
    (org) => org.parent_id === SCHOOL_COLLEGE_PARENT_ORG_ID,
  ).length

  // 党总支个数：所有以「总支」结尾的组织（含机关党委、附属医院党委等各条线的下级）
  const generalBranchCount = organizations.filter((org) =>
    org.name.trim().endsWith(ORG_GENERAL_BRANCH_NAME_SUFFIX),
  ).length

  // 党支部个数：名称包含「支部」的组织（与后端按关键词「支部」检索的口径一致，
  // 因此「XX党支部委员会」等名称中带「支部」但不以「支部」结尾的组织也会计入）
  const branchCount = organizations.filter((org) =>
    org.name.includes(ORG_BRANCH_NAME_KEYWORD),
  ).length

  return {
    orgMembers: memberCounts[0]?.member_count ?? 0,
    minorityMembers: countEthnicMinority(memberCounts[0]?.ethnic_counts),
    fullMembers: partyCounts[PARTY_FULL_MEMBER_STATUS_NAME]?.total ?? null,
    maleFullMembers: partyCounts[PARTY_FULL_MEMBER_STATUS_NAME]?.male ?? null,
    femaleFullMembers: partyCounts[PARTY_FULL_MEMBER_STATUS_NAME]?.female ?? null,
    probationaryMembers: partyCounts[PARTY_PROBATIONARY_STATUS_NAME]?.total ?? null,
    maleProbationaryMembers: partyCounts[PARTY_PROBATIONARY_STATUS_NAME]?.male ?? null,
    femaleProbationaryMembers: partyCounts[PARTY_PROBATIONARY_STATUS_NAME]?.female ?? null,
    averageScore: average.average_score,
    partyOrgCount: subtree.length,
    committeeCount,
    generalBranchCount,
    branchCount,
  }
}

/**
 * 读取总览统计：命中会话内缓存直接复用，失败时清空缓存以便下次重新请求。
 * @returns Promise<OverviewStats> 统计结果
 */
function loadOverviewStats(): Promise<OverviewStats> {
  const cached = overviewStatsPromise
  if (cached) return cached
  const request = fetchOverviewStats()
  overviewStatsPromise = request
  request.catch(() => {
    if (overviewStatsPromise === request) overviewStatsPromise = null
  })
  return request
}

/** SchoolOverviewView 组件。
 * @returns 类型：Element
 */
export default function SchoolOverviewView() {
  const t = useT()

  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      setStats(await loadOverviewStats())
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

  /** 重新加载（事件回调内可安全重置加载态；手动重试丢弃缓存后重新统计） */
  const retry = useCallback(() => {
    overviewStatsPromise = null
    setLoading(true)
    setError(null)
    void load()
  }, [load])

  /** 加载中显示占位符，避免先闪出 0 再跳变为真实值 */
  const statText = (value: number | null) => (loading ? '—' : String(value ?? 0))
  // 全校平均分最多保留小数点后 3 位（如 70.035），避免浮点误差产生超长文本
  const averageText = loading ? '—' : formatPartyScoreTotalDecimal(stats.averageScore)

  /** 统计项（人数带「人」单位，组织个数只显示数字） */
  const statItems = [
    {
      key: 'orgMembers',
      label: t('school.statOrgMembers'),
      value: statText(stats.orgMembers),
      unit: t('school.membersUnit'),
    },
    {
      key: 'minorityMembers',
      label: t('school.statMinorityMembers'),
      value: statText(stats.minorityMembers),
      unit: t('school.membersUnit'),
    },
    {
      key: 'fullMembers',
      label: t('school.statFullMembers'),
      value: statText(stats.fullMembers),
      unit: t('school.membersUnit'),
    },
    {
      key: 'maleFullMembers',
      label: t('school.statMaleFullMembers'),
      value: statText(stats.maleFullMembers),
      unit: t('school.membersUnit'),
    },
    {
      key: 'femaleFullMembers',
      label: t('school.statFemaleFullMembers'),
      value: statText(stats.femaleFullMembers),
      unit: t('school.membersUnit'),
    },
    {
      key: 'probationaryMembers',
      label: t('school.statProbationaryMembers'),
      value: statText(stats.probationaryMembers),
      unit: t('school.membersUnit'),
    },
    {
      key: 'maleProbationaryMembers',
      label: t('school.statMaleProbationaryMembers'),
      value: statText(stats.maleProbationaryMembers),
      unit: t('school.membersUnit'),
    },
    {
      key: 'femaleProbationaryMembers',
      label: t('school.statFemaleProbationaryMembers'),
      value: statText(stats.femaleProbationaryMembers),
      unit: t('school.membersUnit'),
    },
    {
      key: 'averageScore',
      label: t('school.statAvgScore'),
      value: averageText,
    },
    {
      key: 'partyOrgCount',
      label: t('school.statPartyOrgs'),
      value: statText(stats.partyOrgCount),
    },
    {
      key: 'committeeCount',
      label: t('school.statCommittees'),
      value: statText(stats.committeeCount),
    },
    {
      key: 'generalBranchCount',
      label: t('school.statGeneralBranches'),
      value: statText(stats.generalBranchCount),
    },
    {
      key: 'branchCount',
      label: t('school.statBranches'),
      value: statText(stats.branchCount),
    },
  ]

  return (
    <div className="party-view school-overview-view">
      {error && <ErrorState message={error} onRetry={retry} />}

      {/* 全校党建统计卡片（滚动到底时整卡移出视口） */}
      <section className="panel-card school-stat-card">
        <div className="panel-card-body">
          <h4 className="school-section-title">{t('school.cockpitTitle')}</h4>
          <div className="school-overview">
            {statItems.map((item) => (
              <div className="school-overview-item" key={item.key}>
                <span className="school-overview-label">{item.label}</span>
                <span className="school-overview-value">
                  {item.value}
                  {item.unit && <em className="school-overview-unit">{item.unit}</em>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 组织概览（原独立页面）：滚动到底时占满整个屏幕 */}
      <section className="school-org-region">
        <h4 className="school-section-title">{t('school.orgSectionTitle')}</h4>
        <div className="school-org-section">
          <SchoolOrgOverviewView />
        </div>
      </section>
    </div>
  )
}
