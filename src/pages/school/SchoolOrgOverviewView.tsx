/**
 * 党委学校端：组织概览（左侧组织树 + 右侧下级组织统计列表）。
 *
 * 左侧组织树与「组织成员管理」（school_m2）一致：按「学院党委」容器（ID=2）裁剪。
 * 进入页面时不默认选中、也不默认展开任何组织（仅展示折叠的根节点），须由用户先选择组织，
 * 再查询该组织的**直接下级组织**统计；未选择时右侧展示选择提示且不发起统计请求。
 * 点击表格行 / 「查看详细」会跳转到组织成员管理并选中该组织，以便查看该组织的成员
 * （成员详细页沿用组织成员管理的跳转链路）。
 * 从「总览」点击某党委的成绩排名也会跳到本页并选中该党委（展开其节点并滚动定位）。
 *
 * 组织维护：右侧表头提供「新建下级 / 编辑 / 删除」，与组织成员管理的组织 CRUD 一致，
 * 操作对象为左侧当前选中的组织；「学院党委」根容器禁止删除。新建/编辑/删除成功后
 * 强制重新拉取组织树并重算下级统计（代码要求 5、25）。
 *
 * 统计口径（人数与平均分均含全部下级组织，与学校端总览「各二级党委排名」一致）：
 * - 党员人数：GET /api/organizations/{id}/member-counts?recursive=true（后端去重后的成员人数，
 *   前端把各下级组织计数相加，与总览「全校党员」口径一致）；
 * - 先锋指数平均分：同接口的 average_score（后端 DecimalText），按「基础分 + 加分」换算，
 *   最多保留小数点后 3 位；
 * - 预备党员人数：职位名称为「中共预备党员」的成员数。职位名称经 GET /api/positions
 *   解析为职位编码后，对目标组织及其全部下级组织调用
 *   GET /api/organizations/{id}/members?position= 按职位统计（暂不跨组织去重）。
 *
 * 请求复用：member-counts 接口本身不走会话缓存（人数需实时），本页按
 * 「下级组织 ID:刷新代数」在页面内缓存统计 Promise，切换组织再切回、或组织/职位
 * 数据晚到导致重跑时都不会重复请求；点「刷新」会递增代数并重新统计。
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
import type { ColumnsType } from 'antd/es/table'
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
import { useNavigate, useParams, useLocation } from 'react-router'
import { extractErrorReason } from '../../api/common'
import {
  createOrganization,
  deleteOrganization,
  listAllOrganizations,
  queryOrgMembers,
  updateOrganization,
} from '../../api/organizations'
import { getPartyScoreOrganizationAverage } from '../../api/partyScores'
import { listAllPositions } from '../../api/positions'
import type { OrganizationInfo } from '../../api/types/organizations'
import ErrorState from '../../components/ErrorState'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { countOrgMemberTotal } from '../../composables/useOrgMemberTotal'
import {
  MEMBER_TABLE_PAGE_SIZE,
  ORG_OVERVIEW_STATS_CONCURRENCY,
  SCHOOL_COLLEGE_PARENT_ORG_ID,
  SCHOOL_ORG_ADMIN_MODULE_KEY,
  SCHOOL_ORG_OVERVIEW_MODULE_KEY,
} from '../../config/organization'
import { PARTY_PROBATIONARY_STATUS_NAME } from '../../config/partyProfile'
import { useT } from '../../i18n'
import { useUiStateStore } from '../../store/uiState'
import { formatPartyScoreTotalDecimal } from '../../utils/partyScore'
import {
  buildOrgTreeData,
  collectOrgSubtree,
  listOrgDescendantIds,
} from '../../utils/orgTree'

/** 下级组织统计（null 表示未取到：加载中或加载失败） */
interface OrgChildStats {
  /** 党员人数（含下级组织） */
  memberCount: number | null
  /** 预备党员人数（含下级组织） */
  reserveMemberCount: number | null
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

/**
 * 统计指定组织及其全部下级组织中「预备党员」的人数。
 * @param orgIds 需要统计的组织 ID（必填，含目标组织自身）
 * @param positionCodes 职位名称为「中共预备党员」的职位编码（必填，可为空数组）
 * @param force 是否绕过会话缓存重新请求（可选，默认 false）
 * @returns Promise<number> 命中人数（按职位记录数汇总；无编码或无组织时返回 0）
 */
async function countReserveMembers(
  orgIds: number[],
  positionCodes: string[],
  force?: boolean,
): Promise<number> {
  if (orgIds.length === 0 || positionCodes.length === 0) return 0
  let total = 0
  for (let start = 0; start < orgIds.length; start += ORG_OVERVIEW_STATS_CONCURRENCY) {
    const chunk = orgIds.slice(start, start + ORG_OVERVIEW_STATS_CONCURRENCY)
    const counts = await Promise.all(
      chunk.map(async (orgId) => {
        // 每个组织按职位编码各自取一次分页总数，page_size=1 只取 total，减少返回数据量
        const positionTotals = await Promise.all(
          positionCodes.map((code) =>
            queryOrgMembers(orgId, { page: 1, page_size: 1, position: code }, force)
              .then((res) => res.total)
              .catch(() => 0),
          ),
        )
        return positionTotals.reduce((sum, count) => sum + count, 0)
      }),
    )
    total += counts.reduce((sum, count) => sum + count, 0)
  }
  return total
}

/**
 * 加载单个下级组织的统计项（党员人数 / 预备党员人数 / 先锋指数平均分）。
 * @param childId 下级组织 ID（必填）
 * @param orgsInTree 组织树范围内的全部组织（必填，用于展开该组织及其下级组织）
 * @param reserveCodes 预备党员职位编码（可为 null：职位未加载成功，预备党员人数返回 null）
 * @param force 是否绕过会话缓存（可选，默认 false）
 * @returns Promise<OrgChildStats> 统计项（单项失败时对应字段为 null）
 */
async function loadChildStats(
  childId: number,
  orgsInTree: OrganizationInfo[],
  reserveCodes: string[] | null,
  force?: boolean,
): Promise<OrgChildStats> {
  const subtreeOrgIds = [childId, ...listOrgDescendantIds(orgsInTree, childId)]
  const reservePromise =
    reserveCodes === null
      ? Promise.resolve<number | null>(null)
      : countReserveMembers(subtreeOrgIds, reserveCodes, force)

  const [averageResult, memberResult, reserveResult] = await Promise.allSettled([
    getPartyScoreOrganizationAverage({ organization_id: childId, recursive: true }, force),
    // 党员人数与总览「全校党员」同口径：member-counts?recursive=true 的去重人数（接口本身不缓存）
    countOrgMemberTotal(childId),
    reservePromise,
  ])

  // 三项全部失败说明该组织统计整体不可用：抛出首个错误由调用方统一提示
  if (
    averageResult.status === 'rejected' &&
    memberResult.status === 'rejected' &&
    reserveResult.status === 'rejected'
  ) {
    throw averageResult.reason
  }

  return {
    memberCount: memberResult.status === 'fulfilled' ? memberResult.value : null,
    reserveMemberCount: reserveResult.status === 'fulfilled' ? reserveResult.value : null,
    averageScore: averageResult.status === 'fulfilled' ? averageResult.value.average_score : null,
  }
}

/** 党委学校端：组织概览（组织树 + 下级组织统计表） */
export default function SchoolOrgOverviewView() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()
  const location = useLocation()
  const reportError = useErrorFeedback()

  /** 会话状态 key：与门户模块 key 一致，跨路由返回仍保留选中组织与树展开态 */
  const uiKey = SCHOOL_ORG_OVERVIEW_MODULE_KEY

  /**
   * 从「总览」点击某党委排名跳转时透传的目标组织 ID。
   * 仅用于挂载后把左侧组织树滚动到该节点（与组织成员管理的搜索定位一致）。
   */
  const focusOrgId =
    (location.state as { focusOrgId?: number } | null)?.focusOrgId ?? null

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

  /**
   * 页面内统计缓存：key = `下级组织ID:刷新代数` → 统计 Promise。
   * member-counts 不走向会话缓存，这里在页面内复用同一代数的统计请求：
   * 切换组织再切回、或组织/职位数据晚到导致 effect 重跑时，不会对同一组织重复发请求。
   */
  const statsCacheRef = useRef<Map<string, Promise<OrgChildStats>>>(new Map())

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

  /** 组织树展示范围：与组织成员管理一致，只展示「学院党委」容器及其全部下级 */
  const orgsInTree = useMemo(
    () => collectOrgSubtree(orgs, SCHOOL_COLLEGE_PARENT_ORG_ID),
    [orgs],
  )

  const treeData = useMemo(
    () => buildOrgTreeData(orgsInTree, orgSearch, SCHOOL_COLLEGE_PARENT_ORG_ID),
    [orgsInTree, orgSearch],
  )

  /** 当前选中的组织；null 表示尚未选择（进入页面不默认填充业务数据，需用户先选择） */
  const activeOrgId = selectedId

  // 默认不展开任何节点（仅展示折叠的「学院党委」根节点）；之后沿用用户手动调整过的展开态（跨路由保留）
  const expandedKeys = useMemo<React.Key[]>(
    () => storedExpandedKeys ?? [],
    [storedExpandedKeys],
  )

  const activeOrg = useMemo(
    () => (activeOrgId === null ? null : orgsInTree.find((org) => org.id === activeOrgId) ?? null),
    [orgsInTree, activeOrgId],
  )

  /**
   * 每次进入本页（「总览」排名定位跳转除外）清空上一次的选中组织与树展开态：
   * 组织概览须先由用户选择组织，再查询该组织的下级组织信息，避免进入页面就展开全部组织并自动查询。
   */
  useEffect(() => {
    if (focusOrgId !== null) return
    setSelectedId(uiKey, null)
    setOrgTreeExpanded(uiKey, [])
  }, [focusOrgId, setOrgTreeExpanded, setSelectedId, uiKey])

  /** 从「总览」排名跳转过来时，把左侧组织树滚动到选中的党委节点（与组织成员管理的搜索定位一致） */
  useEffect(() => {
    if (treeCollapsed || focusOrgId === null || focusOrgId !== activeOrgId) return
    // 等组织树完成展开动画并渲染出选中节点后再滚动，避免定位到尚未挂载的节点
    const timer = window.setTimeout(() => {
      document
        .querySelector('.org-tree-card .ant-tree-treenode-selected')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [treeCollapsed, focusOrgId, activeOrgId, treeData])

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

  /** 「学院党委」根容器不可删除，其余组织均可维护 */
  const canDeleteOrg = activeOrg !== null && activeOrg.id !== SCHOOL_COLLEGE_PARENT_ORG_ID

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
    if (!activeOrg || activeOrg.id === SCHOOL_COLLEGE_PARENT_ORG_ID) return
    setOrgDeleting(true)
    try {
      await deleteOrganization(activeOrg.id)
      message.success(t('adminOrg.deleteSuccess'))
      if (selectedId === activeOrg.id) {
        setSelectedId(uiKey, activeOrg.parent_id ?? SCHOOL_COLLEGE_PARENT_ORG_ID)
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
    // 手动刷新：丢弃页面内统计缓存（刷新代数同时变化，正常情况下也会重新请求）
    if (force) statsCacheRef.current.clear()
    let cancelled = false

    /**
     * 取某个下级组织的统计：命中页面内缓存直接复用，未命中才请求并写入。
     * 失败不缓存，下一次切换组织 / 重跑 effect 时可重试。
     * @param childId 下级组织 ID（必填）
     * @returns Promise<OrgChildStats> 该组织（含下级组织）的统计项
     */
    function getChildStats(childId: number): Promise<OrgChildStats> {
      const cacheKey = `${childId}:${refreshTick}`
      const cached = statsCacheRef.current.get(cacheKey)
      if (cached) return cached
      const pending = loadChildStats(childId, orgsInTree, reserveCodes, force)
      statsCacheRef.current.set(cacheKey, pending)
      pending.catch(() => {
        if (statsCacheRef.current.get(cacheKey) === pending) {
          statsCacheRef.current.delete(cacheKey)
        }
      })
      return pending
    }

    void (async () => {
      const next = new Map<number, OrgChildStats>()
      let firstError: unknown = null
      for (let start = 0; start < childIds.length; start += ORG_OVERVIEW_STATS_CONCURRENCY) {
        const chunk = childIds.slice(start, start + ORG_OVERVIEW_STATS_CONCURRENCY)
        const batch = await Promise.all(
          chunk.map(async (childId) => {
            try {
              return [childId, await getChildStats(childId)] as const
            } catch (err) {
              firstError ??= err
              return [
                childId,
                { memberCount: null, reserveMemberCount: null, averageScore: null },
              ] as const
            }
          }),
        )
        for (const [childId, item] of batch) next.set(childId, item)
      }
      if (cancelled) return
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
    orgsInTree,
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
      setSelectedId(SCHOOL_ORG_ADMIN_MODULE_KEY, orgId)
      // 组织成员管理首次加载会沿用记忆页码，这里先重置为第 1 页，确保能直接看到成员
      setMemberPage(SCHOOL_ORG_ADMIN_MODULE_KEY, 1)
      navigate(`/portal/${portalKey ?? 'school'}/${SCHOOL_ORG_ADMIN_MODULE_KEY}`)
    },
    [navigate, portalKey, setMemberPage, setSelectedId],
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
   * @param keys antd Tree 选中的节点 key（点击已选中节点会被清空，此时保持原选中组织）
   */
  const onSelectTree: TreeProps['onSelect'] = (keys: React.Key[]) => {
    setPage(1)
    const nextId = keys.length ? Number(keys[0]) : activeOrgId
    setSelectedId(uiKey, nextId)
    if (nextId === null) return
    const current = expandedKeys.map((key) => Number(key))
    if (!current.includes(nextId)) setOrgTreeExpanded(uiKey, [...current, nextId])
  }

  /** 点击表格行与「查看详细」行为一致：跳转到组织成员管理查看该组织成员（代码要求 14） */
  const onRow = useCallback(
    (record: OrgChildRow) => ({
      onClick: (e: React.MouseEvent) => {
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
        // 悬停说明预备党员人数的统计口径（按职位名称统计，代码要求 10）
        title: (
          <Tooltip title={t('schoolOrgOverview.reserveHint')}>
            <span>{t('schoolOrgOverview.colReserveMembers')}</span>
          </Tooltip>
        ),
        key: 'reserveMemberCount',
        width: 130,
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
        render: (_, record) =>
          statsLoading ? (
            <span className="cell-sub">{t('common.loading')}</span>
          ) : (
            (record.memberCount ?? '—')
          ),
      },
      {
        title: t('schoolOrgOverview.colAverageScore'),
        key: 'averageScore',
        width: 140,
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

  return (
    <div className={`admin-org-view${treeCollapsed ? ' is-tree-collapsed' : ''}`}>
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
            {/* 左侧组织树收起/展开 */}
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
            <h3 className="panel-card-title">
              {activeOrg
                ? `${activeOrg.name}（${activeOrg.code}）`
                : t('schoolOrgOverview.selectOrgTitle')}
            </h3>
          </div>
          <div className="approval-toolbar">
            {/* 说明统计口径：人数与平均分均含下级组织（代码要求 10：悬停提示） */}
            <Tooltip title={t('schoolOrgOverview.countHint')}>
              <span className="cell-sub">{t('schoolOrgOverview.listTitle')}</span>
            </Tooltip>
            {/* 组织维护：与「组织成员管理」一致，操作对象为左侧当前选中的组织 */}
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
              pagination={{
                current: page,
                pageSize: MEMBER_TABLE_PAGE_SIZE,
                total: rows.length,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
                onChange: (p: number) => setPage(p),
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
