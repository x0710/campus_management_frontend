import { getPortalPath } from '../../config/routes'
import { usePortalParams } from '../../hooks/usePortalParams'
import { isEntryActionTarget } from '../../utils/entryInteraction'
/**
 * 党委学校端：组织概览区域（左侧组织树 + 右侧下级组织统计列表）。
 *
 * 该区域内嵌在「总览」（school_m1）页面下方，不再作为独立菜单模块；
 * 原各二级党委排名条形图已由此区域替代。
 *
 * 左侧组织树与「组织成员管理」（school_m2）一致：按「学院党委」容器（ID=2）裁剪。
 * 进入「总览」时默认选中并展开「学院党委」根组织，右侧直接查询其**直接下级组织**
 * （各二级党委）的统计与平均分；之后可继续在左侧树中选择其它组织切换查询。
 * 右侧标题旁展示当前组织的平均分（含下级组织），位置与支部端「支部管理」一致。
 * 双击表格行 / 「查看详细」会跳转到组织成员管理并选中该组织，以便查看该组织的成员
 * （成员详细页沿用组织成员管理的跳转链路）。
 *
 * 组织维护：右侧表头提供「新建下级 / 编辑 / 删除」，与组织成员管理的组织 CRUD 一致，
 * 操作对象为左侧当前选中的组织；「学院党委」根容器禁止删除。新建/编辑/删除成功后
 * 强制重新拉取组织树并重算下级统计（代码要求 5、25）。
 *
 * 列表排序：预备党员人数 / 党员人数 / 先锋指数平均分三列支持点击表头排序，
 * 同一时间仅一列生效（切换列自动取消上一列，再次点击可取消排序），支持正序与逆序；
 * 空值（统计未取到）始终排在最后，排序变化时回到第 1 页。
 *
 * 统计口径（人数与平均分均含全部下级组织，与学校端总览「各二级党委排名」一致）：
 * - 党员人数：POST /api/organizations/member-counts，条件 { org_id, recursive: true }，
 *   后端按用户 ID 去重（同一成员跨组织任职也只计一次），旧 GET member-counts 已下线；
 * - 先锋指数平均分：GET /api/party/scores/organization-average 的 average_score
 *   （后端 DecimalText），按「基础分 + 加分」换算，最多保留小数点后 3 位；
 * - 预备党员人数：职位名称为「中共预备党员」的成员数。职位名称经 GET /api/positions
 *   解析为职位编码后，把每个编码作为同一批量人数接口的一条条件（position + recursive=true），
 *   与党员人数合并成一次请求。
 *
 * 请求复用：批量人数接口本身不走会话缓存（人数需实时），本页在模块级按
 * 「下级组织 ID」缓存统计 Promise，切换组织再切回、切到别的菜单再回来、或组织/职位
 * 数据晚到导致重跑时都不会重复请求；点「刷新」会清空缓存并重新统计。
 */
import {
  DeleteOutlined,
  EditOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Spin,
  Table,
  Tooltip,
  Tree,
  TreeSelect,
} from 'antd'
import type { ColumnsType, TableProps } from 'antd/es/table'
import type { TreeProps } from 'antd/es/tree'
import axios from 'axios'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { useNavigate } from 'react-router'
import { subscribeCacheInvalidation } from '../../api/cache'
import { extractErrorReason } from '../../api/common'
import {
  createOrganization,
  deleteOrganization,
  listAllOrganizations,
  queryOrganizationMemberCounts,
  updateOrganization,
} from '../../api/organizations'
import { getPartyScoreOrganizationAverage } from '../../api/partyScores'
import { listAllPositions } from '../../api/positions'
import type {
  OrganizationInfo,
  OrganizationMemberCountRequest,
} from '../../api/types/organizations'
import ErrorState from '../../components/ErrorState'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import {
  MEMBER_TABLE_PAGE_SIZE,
  ORG_OVERVIEW_STATS_CONCURRENCY,
  SCHOOL_COLLEGE_PARENT_ORG_ID,
  SCHOOL_ORG_ADMIN_MODULE_KEY,
  SCHOOL_ORG_OVERVIEW_UI_KEY,
} from '../../config/organization'
import { PARTY_PROBATIONARY_STATUS_NAME } from '../../config/partyProfile'
import { useT } from '../../i18n'
import { formatPaginationTotal } from '../../utils/pagination'
import { useUiStateStore } from '../../store/uiState'
import { countEthnicMinority } from '../../utils/ethnic'
import { mapInBatches } from '../../utils/mapInBatches'
import { formatPartyScoreTotalDecimal } from '../../utils/partyScore'
import { buildOrgTreeData, collectOrgSubtree } from '../../utils/orgTree'

/** 下级组织统计（null 表示未取到：加载中或加载失败） */
interface OrgChildStats {
  /** 党员人数（含下级组织） */
  memberCount: number | null
  /** 预备党员人数（含下级组织） */
  reserveMemberCount: number | null
  /** 少数民族人数（民族分布中排除汉族与 unknown，含下级组织） */
  minorityCount: number | null
  /** 先锋指数平均分（后端 DecimalText，含下级组织） */
  averageScore: string | null
}

/** 右侧下级组织表的一行 */
interface OrgChildRow extends OrgChildStats {
  id: number
  name: string
  code: string
  parentName: string
}

/** 组织新建/编辑弹窗的表单值 */
interface OrgFormValues {
  code: string
  name: string
  parent_id: number | null
}

/** antd 排序方向 */
type SortOrder = 'ascend' | 'descend' | null

/**
 * 可排序数值比较：null 表示统计未取到（加载中 / 失败），正序与倒序都排在最后。
 * antd 会对降序结果整体取反，因此降序时把空值的符号也反过来，保证取反后仍在末尾。
 * @param a 对比值 A（必填，可为 null）
 * @param b 对比值 B（必填，可为 null）
 * @param order 当前排序方向（可选，antd 传入）
 * @returns 比较结果（<0 / 0 / >0）
 */
function compareNullableNumber(a: number | null, b: number | null, order?: SortOrder): number {
  if (a === null && b === null) return 0
  if (a === null) return order === 'descend' ? -1 : 1
  if (b === null) return order === 'descend' ? 1 : -1
  return a - b
}

/**
 * 先锋指数平均分（后端 DecimalText）排序比较：转成数字后比较，空值同样排在最后。
 * @param a 平均分 A（必填，可为 null）
 * @param b 平均分 B（必填，可为 null）
 * @param order 当前排序方向（可选）
 * @returns 比较结果（<0 / 0 / >0）
 */
function compareNullableScore(a: string | null, b: string | null, order?: SortOrder): number {
  const parse = (value: string | null): number | null => {
    if (value === null || value.trim() === '') return null
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return compareNullableNumber(parse(a), parse(b), order)
}

/**
 * 加载单个下级组织的统计项（党员人数 / 预备党员人数 / 先锋指数平均分）。
 *
 * 人数统一走 POST /api/organizations/member-counts 批量接口：一次请求同时包含
 * 「全部职位人数」与「预备党员各职位编码人数」两组条件（均 recursive=true，含下级组织），
 * 由后端按用户 ID 去重（同一成员跨组织任职也只计一次），无需前端逐级汇总成员列表。
 *
 * @param childId 下级组织 ID（必填）
 * @param reserveCodes 预备党员职位编码（可为 null：职位未加载成功，预备党员人数返回 null）
 * @param force 是否绕过会话缓存重新请求（可选，默认 false；仅影响平均分缓存）
 * @returns Promise<OrgChildStats> 统计项（单项失败时对应字段为 null）
 */
async function loadChildStats(
  childId: number,
  reserveCodes: string[] | null,
  force?: boolean,
): Promise<OrgChildStats> {
  // 第 1 项统计全部职位人数，其余各项按预备党员职位编码统计，响应顺序与请求一致
  const countRequests: OrganizationMemberCountRequest[] = [{ org_id: childId, recursive: true }]
  if (reserveCodes !== null) {
    for (const code of reserveCodes) {
      countRequests.push({ org_id: childId, position: code, recursive: true })
    }
  }

  const [averageResult, countsResult] = await Promise.allSettled([
    getPartyScoreOrganizationAverage({ organization_id: childId, recursive: true }, force),
    // 人数需实时，批量人数接口本身不走会话缓存
    // include=ethnic 同时返回民族分布，用于统计少数民族人数（统一作用于本批所有条件）
    queryOrganizationMemberCounts(countRequests, ['ethnic']),
  ])

  // 平均分与人数都失败说明该组织统计整体不可用：抛出首个错误由调用方统一提示
  if (averageResult.status === 'rejected' && countsResult.status === 'rejected') {
    throw averageResult.reason
  }

  const memberCount =
    countsResult.status === 'fulfilled' ? (countsResult.value[0]?.member_count ?? 0) : null
  // 预备党员人数：职位未加载成功 → null（占位符）；职位未配置 → 0；其余为各职位编码人数之和
  const reserveMemberCount =
    reserveCodes === null || countsResult.status === 'rejected'
      ? null
      : countsResult.value.slice(1).reduce((sum, item) => sum + item.member_count, 0)

  // 少数民族人数：与总人数同一次统计，失败时保持 null（占位符）
  const minorityCount =
    countsResult.status === 'fulfilled'
      ? countEthnicMinority(countsResult.value[0]?.ethnic_counts)
      : null

  return {
    memberCount,
    reserveMemberCount,
    minorityCount,
    averageScore: averageResult.status === 'fulfilled' ? averageResult.value.average_score : null,
  }
}

/**
 * 下级组织统计的会话内缓存：key = 下级组织 ID → 统计 Promise。
 * 批量人数接口不走向会话缓存，这里在模块内复用统计请求：
 * 组织概览内嵌在总览页，切换菜单再回来时直接复用已有统计，不重复发起请求；
 * 手动刷新（force）或组织/成员数据变化（invalidate 触发）、退出登录时清空。
 */
const childStatsCache = new Map<string, Promise<OrgChildStats>>()

subscribeCacheInvalidation(() => {
  childStatsCache.clear()
})

/**
 * 组织概览区域的可配置项（默认值对应学校端总览页内嵌的组织概览）
 */
interface SchoolOrgOverviewViewProps {
  /** 组织树根组织 ID（默认学校端「学院党委」容器 ID=2）；二级党委端传入当前学院组织 */
  rootOrgId?: number
  /** 会话状态 key（记忆选中组织与树展开态），不同入口需使用不同的 key */
  uiKey?: string
  /** 「查看详细」跳转的目标模块 key（默认学校端组织成员管理） */
  detailModuleKey?: string
  /** 是否展示组织维护按钮（新建下级 / 编辑 / 删除）；只读场景传 false */
  showOrgActions?: boolean
  /** 当前组织没有下级组织时隐藏组织树（只展示空表），默认 false */
  hideTreeWhenNoChildren?: boolean
}

/**
 * 党委学校端：组织概览（组织树 + 下级组织统计表）
 * @param props 可配置项（可选，默认学校端总览页配置）
 * @returns 类型：Element
 */
export default function SchoolOrgOverviewView({
  rootOrgId = SCHOOL_COLLEGE_PARENT_ORG_ID,
  uiKey = SCHOOL_ORG_OVERVIEW_UI_KEY,
  detailModuleKey = SCHOOL_ORG_ADMIN_MODULE_KEY,
  showOrgActions = true,
  hideTreeWhenNoChildren = false,
}: SchoolOrgOverviewViewProps = {}) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey } = usePortalParams<{ portalKey: string }>()
  const reportError = useErrorFeedback()

  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)
  /** 手动刷新代数：变化时强制重新统计（同时刷新组织树） */
  const [refreshTick, setRefreshTick] = useState(0)
  /** 下一次统计是否强制绕过缓存（仅手动刷新触发，避免之后的切换组织都打网络请求） */
  const forceNextLoadRef = useRef(false)

  const selectedId = useUiStateStore((s) => s.selectedOrgIds[uiKey] ?? null)
  const setSelectedId = useUiStateStore((s) => s.setSelectedOrgId)
  /** 组织成员管理的成员页码（跳转查看该组织成员时回到第 1 页，避免沿用上次的页码） */
  const setMemberPage = useUiStateStore((s) => s.setMemberPage)
  const treeCollapsed = useUiStateStore((s) => s.collapsedOrgTrees[uiKey] ?? false)
  const setTreeCollapsed = useUiStateStore((s) => s.setOrgTreeCollapsed)
  const storedExpandedKeys = useUiStateStore((s) => s.expandedOrgTreeKeys[uiKey])
  const setOrgTreeExpanded = useUiStateStore((s) => s.setOrgTreeExpanded)

  const [orgSearch, setOrgSearch] = useState('')
  const [page, setPage] = useState(1)

  /** 组织新建/编辑弹窗：null 表示关闭 */
  const [orgModal, setOrgModal] = useState<
    { mode: 'create' | 'edit'; org?: OrganizationInfo } | null
  >(null)
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgDeleting, setOrgDeleting] = useState(false)
  const [orgForm] = Form.useForm<OrgFormValues>()

  /** 预备党员职位编码；null 表示职位列表尚未加载成功（此时预备党员人数展示占位符） */
  const [reserveCodes, setReserveCodes] = useState<string[] | null>(null)
  /** 职位列表是否已加载结束（成功或失败都算结束）：统计需等它结束再开始，避免半成品结果被缓存 */
  const [reserveReady, setReserveReady] = useState(false)

  /** 下级组织统计（key = 下级组织 ID） */
  const [stats, setStats] = useState<Map<number, OrgChildStats>>(new Map())
  /** 统计完成的选择标识（`组织ID:刷新代数`）；与当前标识不一致即表示加载中 */
  const [statsKey, setStatsKey] = useState('')

  /** 当前选中组织自身的平均分（含下级组织；null 表示未取到或无数据） */
  const [orgAverageScore, setOrgAverageScore] = useState<string | null>(null)
  const [orgAverageLoading, setOrgAverageLoading] = useState(false)

  /** 加载全部组织（force=true 绕过会话缓存，代码要求 5） */
  const loadOrgs = useCallback(
    async (force?: boolean) => {
      setOrgsLoading(true)
      setOrgsError(null)
      try {
        setOrgs(await listAllOrganizations(force))
      } catch (err) {
        // 401 由 http 拦截器统一处理登录态，此处不重复提示
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setOrgsError(extractErrorReason(err, t))
        }
      } finally {
        setOrgsLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    void loadOrgs()
  }, [loadOrgs])

  /** 加载职位列表并把「中共预备党员」职位名映射为编码（失败时保持 null，仅影响预备党员人数） */
  const loadReserveCodes = useCallback(async (force?: boolean) => {
    try {
      const list = await listAllPositions(force)
      setReserveCodes(
        list
          .filter((position) => position.name.trim() === PARTY_PROBATIONARY_STATUS_NAME)
          .map((position) => position.code),
      )
    } catch {
      // 无 position.read 权限或接口异常：保持 null，预备党员人数展示占位符
      setReserveCodes(null)
    } finally {
      // 无论成功与否都标记就绪：失败时统计照常进行，只把预备党员人数展示为占位符
      setReserveReady(true)
    }
  }, [])

  useEffect(() => {
    void loadReserveCodes()
  }, [loadReserveCodes])

  /** 组织树展示范围：与组织成员管理一致，只展示根组织及其全部下级 */
  const orgsInTree = useMemo(
    () => collectOrgSubtree(orgs, rootOrgId),
    [orgs, rootOrgId],
  )

  const treeData = useMemo(
    () => buildOrgTreeData(orgsInTree, orgSearch, rootOrgId),
    [orgsInTree, orgSearch, rootOrgId],
  )

  /** 当前选中的组织；进入「总览」时默认选中「学院党委」根组织，用户可继续切换 */
  const activeOrgId = selectedId

  // 默认展开「学院党委」根节点（展示各二级党委）；之后沿用用户手动调整过的展开态（跨路由保留）
  const expandedKeys = useMemo<React.Key[]>(
    () => storedExpandedKeys ?? [],
    [storedExpandedKeys],
  )

  const activeOrg = useMemo(
    () => (activeOrgId === null ? null : orgsInTree.find((org) => org.id === activeOrgId) ?? null),
    [orgsInTree, activeOrgId],
  )

  /**
   * 当前选中组织的平均分（含下级组织），展示在右侧标题旁。
   * 与支部端「支部管理」的同一位置（组织名右侧）保持一致；手动刷新时随刷新代数一起重新请求。
   */
  useEffect(() => {
    if (activeOrgId === null) {
      setOrgAverageScore(null)
      return
    }
    let cancelled = false
    setOrgAverageLoading(true)
    void (async () => {
      try {
        const res = await getPartyScoreOrganizationAverage({
          organization_id: activeOrgId,
          recursive: true,
        })
        if (!cancelled) setOrgAverageScore(res.average_score)
      } catch {
        // 平均分取不到时不阻塞组织信息与下级统计的展示
        if (!cancelled) setOrgAverageScore(null)
      } finally {
        if (!cancelled) setOrgAverageLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeOrgId, refreshTick])

  /**
   * 进入「总览」时默认选中并展开「学院党委」根组织：
   * 右侧直接展示其下级组织（各二级党委）的详细统计；用户仍可在左侧树中选择其它组织。
   * 同时重置展开态，避免沿用上次浏览过的深层组织展开记录。
   */
  useEffect(() => {
    setSelectedId(uiKey, rootOrgId)
    setOrgTreeExpanded(uiKey, [rootOrgId])
  }, [rootOrgId, setOrgTreeExpanded, setSelectedId, uiKey])

  /** 右侧列表数据：当前选中组织的直接下级组织（按 ID 升序；未选择组织时为空，不查询） */
  const childOrgs = useMemo(
    () =>
      activeOrgId === null
        ? []
        : orgsInTree
            .filter((org) => org.parent_id === activeOrgId)
            .sort((a, b) => a.id - b.id),
    [orgsInTree, activeOrgId],
  )

  /** 组织 ID → 名称（用于「上级组织」列，不额外请求接口） */
  const orgNameById = useMemo(
    () => new Map(orgsInTree.map((org) => [org.id, org.name])),
    [orgsInTree],
  )

  /** 根容器与上级容器不可删除，其余组织均可维护 */
  const canDeleteOrg =
    showOrgActions && activeOrg !== null && activeOrg.id !== rootOrgId

  /** 弹窗中「上级组织」的可选项：与组织树同一范围，避免把组织挂到页面看不到的组织下 */
  const parentOptions = useMemo(
    () => orgsInTree.map((org) => ({ value: org.id, title: `${org.name}（${org.code}）` })),
    [orgsInTree],
  )

  /** 打开新建弹窗：默认把当前选中组织作为上级（即「新建下级」，也可在弹窗内改上级） */
  const openCreate = () => {
    setOrgModal({ mode: 'create' })
    orgForm.setFieldsValue({ code: '', name: '', parent_id: activeOrgId ?? null })
  }

  /** 打开编辑弹窗：回填当前选中组织的名称、编码与上级组织 */
  const openEdit = () => {
    if (!activeOrg) return
    setOrgModal({ mode: 'edit', org: activeOrg })
    orgForm.setFieldsValue({
      code: activeOrg.code,
      name: activeOrg.name,
      parent_id: activeOrg.parent_id,
    })
  }

  /** 保存组织（新建 / 编辑）：成功后重新拉取组织树，由下级统计 effect 自动重算（代码要求 25） */
  const submitOrg = async () => {
    if (!orgModal) return
    setOrgSaving(true)
    try {
      const values = await orgForm.validateFields()
      const body = {
        code: values.code.trim(),
        name: values.name.trim(),
        parent_id: values.parent_id ?? null,
      }
      if (orgModal.mode === 'create') {
        await createOrganization(body)
        message.success(t('adminOrg.createSuccess'))
        // 新建后展开其上级组织，确保左侧组织树中能看到新加的下级节点
        const keys = new Set(expandedKeys.map(Number))
        if (body.parent_id !== null) keys.add(body.parent_id)
        setOrgTreeExpanded(uiKey, [...keys])
      } else {
        await updateOrganization(orgModal.org!.id, body)
        message.success(t('adminOrg.updateSuccess'))
      }
      setOrgModal(null)
      // 组织接口在 CRUD 后已自动失效会话缓存，这里再强制拉取一次，确保树与统计立即更新
      await loadOrgs(true)
    } catch (err) {
      // 表单校验失败（errorFields）由弹窗内提示，不再弹全局错误
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setOrgSaving(false)
    }
  }

  /**
   * 删除当前选中组织：成功后选中态回退到其上级组织，并重新拉取组织树与统计。
   * 「学院党委」根容器由按钮 disabled 拦截（见渲染处），避免误删学校端根节点。
   */
  const removeOrg = async () => {
    if (!activeOrg || activeOrg.id === rootOrgId) return
    setOrgDeleting(true)
    try {
      await deleteOrganization(activeOrg.id)
      message.success(t('adminOrg.deleteSuccess'))
      if (selectedId === activeOrg.id) {
        setSelectedId(uiKey, activeOrg.parent_id ?? rootOrgId)
      }
      await loadOrgs(true)
    } catch (err) {
      reportError(err)
    } finally {
      setOrgDeleting(false)
    }
  }

  const childrenKey = childOrgs.map((org) => org.id).join(',')
  const activeStatsKey = `${activeOrgId ?? 'none'}:${refreshTick}`
  // 未选择组织时不统计、不展示加载态，避免出现「无意义的加载中」
  const statsLoading =
    activeOrgId !== null && childOrgs.length > 0 && statsKey !== activeStatsKey

  // 切换选中组织（或手动刷新）后统计其下级组织：
  // 组织/职位数据未就绪时先跳过，数据到达后由依赖变化自动重跑。
  useEffect(() => {
    if (childrenKey === '' || orgsLoading || !reserveReady) return
    const childIds = childrenKey.split(',').map(Number)
    const force = forceNextLoadRef.current
    forceNextLoadRef.current = false
    // 手动刷新：丢弃模块内统计缓存（刷新代数同时变化，正常情况下也会重新请求）
    if (force) childStatsCache.clear()
    let cancelled = false

    /**
     * 取某个下级组织的统计：命中模块内缓存直接复用，未命中才请求并写入。
     * 失败不缓存，下一次切换组织 / 重跑 effect 时可重试。
     * @param childId 下级组织 ID（必填）
     * @returns Promise<OrgChildStats> 该组织（含下级组织）的统计项
     */
    function getChildStats(childId: number): Promise<OrgChildStats> {
      const cacheKey = String(childId)
      const cached = childStatsCache.get(cacheKey)
      if (cached) return cached
      const pending = loadChildStats(childId, reserveCodes, force)
      childStatsCache.set(cacheKey, pending)
      pending.catch(() => {
        if (childStatsCache.get(cacheKey) === pending) {
          childStatsCache.delete(cacheKey)
        }
      })
      return pending
    }

    void (async () => {
      let firstError: unknown = null
      const entries = await mapInBatches(childIds, async (childId) => {
        try {
          return [childId, await getChildStats(childId)] as const
        } catch (err) {
          firstError ??= err
          return [childId, {
            memberCount: null,
            reserveMemberCount: null,
            minorityCount: null,
            averageScore: null,
          }] as const
        }
      }, ORG_OVERVIEW_STATS_CONCURRENCY)
      if (cancelled) return
      const next = new Map<number, OrgChildStats>(entries)
      // 合并到已有统计中：切换组织再切回时可直接展示已经统计过的组织结果
      setStats((prev) => {
        const merged = new Map(prev)
        for (const [childId, item] of next) merged.set(childId, item)
        return merged
      })
      setStatsKey(activeStatsKey)
      if (firstError) reportError(firstError)
    })()

    return () => {
      cancelled = true
    }
  }, [
    childrenKey,
    orgsLoading,
    reserveReady,
    reserveCodes,
    refreshTick,
    activeStatsKey,
    reportError,
  ])

  /** 表格行：下级组织 + 已加载的统计值（统计未就绪时统计列显示占位符，避免闪现上一次的数据） */
  const rows = useMemo<OrgChildRow[]>(
    () =>
      childOrgs.map((org) => {
        const item = statsLoading ? undefined : stats.get(org.id)
        return {
          id: org.id,
          name: org.name,
          code: org.code,
          parentName: org.parent_id !== null ? (orgNameById.get(org.parent_id) ?? '—') : '—',
          memberCount: item?.memberCount ?? null,
          reserveMemberCount: item?.reserveMemberCount ?? null,
          minorityCount: item?.minorityCount ?? null,
          averageScore: item?.averageScore ?? null,
        }
      }),
    [childOrgs, orgNameById, stats, statsLoading],
  )

  /**
   * 跳转到「组织成员管理」并选中该组织（查看其成员）。
   * 组织成员管理与本页共用 uiState 的 selectedOrgIds，因此跳转后直接展示该组织的成员列表。
   * @param orgId 目标组织 ID（必填）
   */
  const openOrgMembers = useCallback(
    (orgId: number) => {
      setSelectedId(detailModuleKey, orgId)
      // 组织成员管理首次加载会沿用记忆页码，这里先重置为第 1 页，确保能直接看到成员
      setMemberPage(detailModuleKey, 1)
      navigate(`${getPortalPath(portalKey ?? 'school')}/${detailModuleKey}`)
    },
    [navigate, portalKey, setMemberPage, setSelectedId, detailModuleKey],
  )

  /** 手动刷新：绕过缓存重新拉取组织树、预备党员职位与全部统计（代码要求 5、25） */
  const refresh = useCallback(() => {
    forceNextLoadRef.current = true
    // 等职位重新加载结束再统计，避免用刷新前的职位编码算出预备党员人数
    setReserveReady(false)
    setPage(1)
    setRefreshTick((tick) => tick + 1)
    void loadOrgs(true)
    void loadReserveCodes(true)
  }, [loadOrgs, loadReserveCodes])

  /**
   * 选中组织：右侧展示其直接下级组织；同时展开该节点，
   * 左侧组织树立即显示下级组织，与右侧列表保持一致。
   * 若该组织没有下级组织，则直接跳到「组织成员管理」查看该组织成员，不再展开空节点。
   * @param keys antd Tree 选中的节点 key（点击已选中节点会被清空，此时保持原选中组织）
   */
  const onSelectTree: TreeProps['onSelect'] = (keys: React.Key[]) => {
    setPage(1)
    const nextId = keys.length ? Number(keys[0]) : activeOrgId
    if (nextId === null) return
    // 叶子组织：直接跳转组织成员管理查看成员（openOrgMembers 会选中该组织并重置页码）
    if (!orgsInTree.some((org) => org.parent_id === nextId)) {
      openOrgMembers(nextId)
      return
    }
    setSelectedId(uiKey, nextId)
    const current = expandedKeys.map((key) => Number(key))
    if (!current.includes(nextId)) setOrgTreeExpanded(uiKey, [...current, nextId])
  }

  /** 双击表格行与「查看详细」行为一致：跳转到组织成员管理查看该组织成员（代码要求 14） */
  const onRow = useCallback(
    (record: OrgChildRow) => ({
      onDoubleClick: (e: React.MouseEvent) => {
        if (isEntryActionTarget(e.target)) return
        // 点击按钮 / 链接时不触发行点击
        const target = e.target as HTMLElement
        if (target.closest('button')) return
        openOrgMembers(record.id)
      },
      title: t('memberDetail.rowClickHint'),
      style: { cursor: 'pointer' },
    }),
    [openOrgMembers, t],
  )

  /**
   * 表格变更：点击统计列表头排序（单列生效，切换列时自动取消上一列）后回到第 1 页；
   * 翻页时沿用用户选择的页码。
   */
  const onTableChange: TableProps<OrgChildRow>['onChange'] = useCallback(
    (pagination, _filters, _sorter, extra) => {
      setPage(extra.action === 'sort' ? 1 : (pagination.current ?? 1))
    },
    [],
  )

  const columns = useMemo<ColumnsType<OrgChildRow>>(
    () => [
      {
        title: t('schoolOrgOverview.colId'),
        dataIndex: 'id',
        key: 'id',
        width: 80,
      },
      {
        // 悬停展示组织编码，便于与组织成员管理中的「名称（编码）」对应
        title: t('schoolOrgOverview.colName'),
        key: 'name',
        width: 220,
        render: (_, record) => (
          <Tooltip title={record.code}>
            <span>{record.name}</span>
          </Tooltip>
        ),
      },
      {
        title: t('schoolOrgOverview.colParent'),
        dataIndex: 'parentName',
        key: 'parentName',
        width: 180,
        render: (value: string) => value || '—',
      },
      {
        // 悬停说明预备党员人数的统计口径（按职位名称统计，代码要求 10）；
        // 标题已有口径提示，关闭 antd 的排序提示避免 Tooltip 嵌套
        title: (
          <Tooltip title={t('schoolOrgOverview.reserveHint')}>
            <span>{t('schoolOrgOverview.colReserveMembers')}</span>
          </Tooltip>
        ),
        key: 'reserveMemberCount',
        width: 130,
        sorter: (a, b, order) =>
          compareNullableNumber(a.reserveMemberCount, b.reserveMemberCount, order),
        showSorterTooltip: false,
        render: (_, record) =>
          statsLoading ? (
            <span className="cell-sub">{t('common.loading')}</span>
          ) : (
            (record.reserveMemberCount ?? '—')
          ),
      },
      {
        title: t('schoolOrgOverview.colMembers'),
        key: 'memberCount',
        width: 110,
        sorter: (a, b, order) => compareNullableNumber(a.memberCount, b.memberCount, order),
        render: (_, record) =>
          statsLoading ? (
            <span className="cell-sub">{t('common.loading')}</span>
          ) : (
            (record.memberCount ?? '—')
          ),
      },
      {
        title: t('schoolOrgOverview.colMinorityMembers'),
        key: 'minorityCount',
        width: 130,
        sorter: (a, b, order) => compareNullableNumber(a.minorityCount, b.minorityCount, order),
        render: (_, record) =>
          statsLoading ? (
            <span className="cell-sub">{t('common.loading')}</span>
          ) : (
            (record.minorityCount ?? '—')
          ),
      },
      {
        title: t('schoolOrgOverview.colAverageScore'),
        key: 'averageScore',
        width: 140,
        sorter: (a, b, order) => compareNullableScore(a.averageScore, b.averageScore, order),
        render: (_, record) =>
          statsLoading ? (
            <span className="cell-sub">{t('common.loading')}</span>
          ) : (
            formatPartyScoreTotalDecimal(record.averageScore)
          ),
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 120,
        render: (_, record) => (
          <Tooltip title={t('schoolOrgOverview.viewDetailHint')}>
            <Button type="link" size="small" onClick={() => openOrgMembers(record.id)}>
              {t('schoolOrgOverview.viewDetail')}
            </Button>
          </Tooltip>
        ),
      },
    ],
    [t, statsLoading, openOrgMembers],
  )

  /** 当前组织是否还有下级组织：没有下级组织时可隐藏组织树，只展示空表 */
  const hasChildOrgs = childOrgs.length > 0
  /**
   * 是否隐藏组织树：仅二级党委端等入口在「组织加载完成且确实没有下级组织」时隐藏；
   * 加载中或加载失败时仍展示组织树卡片（错误信息与重试入口在其中）。
   */
  const treeHidden =
    hideTreeWhenNoChildren && !orgsLoading && orgsError === null && !hasChildOrgs

  return (
    <div
      className={`admin-org-view${treeCollapsed || treeHidden ? ' is-tree-collapsed' : ''}`}
    >
      <section className="panel-card org-tree-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('adminOrg.treeTitle')}</h3>
          <div className="approval-toolbar">
            <Tooltip title={t('common.refresh')}>
              <Button size="small" icon={<ReloadOutlined />} onClick={refresh} />
            </Tooltip>
          </div>
        </header>
        <div className="panel-card-body">
          {orgsError ? (
            <ErrorState message={orgsError} onRetry={() => void loadOrgs(true)} />
          ) : (
            <>
              <Input.Search
                allowClear
                size="small"
                style={{ marginBottom: 8 }}
                prefix={<SearchOutlined />}
                placeholder={t('adminOrg.searchPlaceholder')}
                value={orgSearch}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgSearch(e.target.value)}
              />
              <Spin spinning={orgsLoading}>
                {/* 数据到达后强制重挂载，保证受控 expandedKeys 生效（与组织成员管理页一致） */}
                <Tree
                  key={(treeData?.length ?? 0) > 0 ? 'tree-loaded' : 'tree-empty'}
                  treeData={treeData}
                  expandedKeys={expandedKeys}
                  onExpand={(keys: React.Key[]) => {
                    setOrgTreeExpanded(uiKey, keys.map((k) => Number(k)))
                  }}
                  selectedKeys={activeOrgId === null ? [] : [activeOrgId]}
                  onSelect={onSelectTree}
                  showLine
                  blockNode
                />
              </Spin>
            </>
          )}
        </div>
      </section>

      <section className="panel-card org-members-card">
        <header className="panel-card-header org-member-header">
          <div className="org-members-title">
            {/* 左侧组织树收起/展开（无下级组织时不展示组织树，也就无需收起按钮） */}
            {!treeHidden && (
              <Tooltip
                title={
                  treeCollapsed ? t('memberDetail.expandTree') : t('memberDetail.collapseTree')
                }
              >
                <Button
                  type="text"
                  size="small"
                  aria-label={
                    treeCollapsed ? t('memberDetail.expandTree') : t('memberDetail.collapseTree')
                  }
                  icon={treeCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setTreeCollapsed(uiKey, !treeCollapsed)}
                />
              </Tooltip>
            )}
            <h3 className="panel-card-title">
              {activeOrg
                ? `${activeOrg.name}（${activeOrg.code}）`
                : t('schoolOrgOverview.selectOrgTitle')}
            </h3>
            {/* 当前选中组织的平均分，位置与支部端「支部管理」一致（组织名右侧） */}
            {activeOrg && (
              <span className="org-average-score">
                {t('orgExplorer.orgAverageScore')}
                <strong>
                  {orgAverageLoading ? '—' : formatPartyScoreTotalDecimal(orgAverageScore)}
                </strong>
                <em>{t('party.scoreUnit')}</em>
              </span>
            )}
          </div>
          <div className="approval-toolbar">
            {/* 说明统计口径：人数与平均分均含下级组织（代码要求 10：悬停提示） */}
            <Tooltip title={t('schoolOrgOverview.countHint')}>
              <span className="cell-sub">{t('schoolOrgOverview.listTitle')}</span>
            </Tooltip>
            {/* 组织维护：与「组织成员管理」一致，操作对象为左侧当前选中的组织；只读入口不展示 */}
            {showOrgActions && (
              <>
                <Tooltip title={t('schoolOrgOverview.newSubOrgHint')}>
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    disabled={!activeOrg}
                    onClick={openCreate}
                  >
                    {t('adminOrg.newSubOrg')}
                  </Button>
                </Tooltip>
                <Tooltip title={t('schoolOrgOverview.editOrgHint')}>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    disabled={!activeOrg}
                    onClick={openEdit}
                  >
                    {t('adminOrg.editOrg')}
                  </Button>
                </Tooltip>
                <Tooltip
                  title={
                    activeOrg === null
                      ? t('schoolOrgOverview.selectOrgFirstHint')
                      : canDeleteOrg
                        ? t('schoolOrgOverview.deleteOrgHint')
                        : t('schoolOrgOverview.rootDeleteHint')
                  }
                >
                  {/* 禁用按钮不派发鼠标事件，用 span 包裹以便根节点也能展示悬停提示 */}
                  <span>
                    <Popconfirm
                      title={t('adminOrg.orgDeleteConfirm')}
                      okText={t('adminOrg.delete')}
                      cancelText={t('approval.cancel')}
                      okButtonProps={{ danger: true, loading: orgDeleting }}
                      disabled={!canDeleteOrg}
                      onConfirm={() => void removeOrg()}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} disabled={!canDeleteOrg}>
                        {t('adminOrg.delete')}
                      </Button>
                    </Popconfirm>
                  </span>
                </Tooltip>
              </>
            )}
          </div>
        </header>
        <div className="panel-card-body">
          {/* 未选择组织时不展示表格、也不发起统计请求：需先在左侧组织树中选择 */}
          {activeOrgId === null ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('schoolOrgOverview.selectOrgPrompt')}
              style={{ padding: '32px 0' }}
            />
          ) : (
            <Table<OrgChildRow>
              rowKey="id"
              loading={orgsLoading || statsLoading}
              columns={columns}
              dataSource={rows}
              locale={{
                emptyText: orgsLoading
                  ? t('common.loading')
                  : t('schoolOrgOverview.emptyChildren'),
              }}
              scroll={{ x: 1000 }}
              onRow={onRow}
              onChange={onTableChange}
              pagination={{
                current: page,
                pageSize: MEMBER_TABLE_PAGE_SIZE,
                total: rows.length,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) => formatPaginationTotal(t, n, MEMBER_TABLE_PAGE_SIZE),
              }}
            />
          )}
        </div>
      </section>

      {/* 组织新建/编辑弹窗：字段与校验规则和组织成员管理保持一致 */}
      <Modal
        open={orgModal !== null}
        title={orgModal?.mode === 'create' ? t('adminOrg.newOrg') : t('adminOrg.editOrg')}
        okText={t('adminOrg.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={orgSaving}
        onCancel={() => setOrgModal(null)}
        onOk={() => void submitOrg()}
        forceRender
        destroyOnHidden
      >
        <Form form={orgForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label={t('adminOrg.fieldName')}
            rules={[{ required: true, message: t('adminOrg.nameRequired') }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="code"
            label={t('adminOrg.fieldCode')}
            rules={[{ required: true, message: t('adminOrg.codeRequired') }]}
          >
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item name="parent_id" label={t('adminOrg.fieldParent')}>
            <TreeSelect
              treeData={parentOptions}
              treeDefaultExpandAll
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder={t('adminOrg.parentPlaceholder')}
              onChange={(v: number | undefined) => orgForm.setFieldValue('parent_id', v ?? null)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
