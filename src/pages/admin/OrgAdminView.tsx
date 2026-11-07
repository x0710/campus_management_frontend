/** 管理员端 - 组织管理：组织树维护与成员增删改查。 */

import { isEntryActionTarget } from '../../utils/entryInteraction'
import {
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
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
import { useNavigate, useParams } from 'react-router'
import {
  addOrgMember,
  createOrganization,
  deleteOrganization,
  listAllOrganizations,
  queryOrgMembers,
  removeOrgMember,
  updateOrganization,
} from '../../api/organizations'
import type {
  OrganizationInfo,
  OrganizationMember,
} from '../../api/types/organizations'
import type { UserInfo } from '../../api/types/users'
import UsablePositionSelect from '../../components/UsablePositionSelect'
import { getPartyScoreOrganizationAverage, getPartyScoreTotals } from '../../api/partyScores'
import { invalidate } from '../../api/cache'
import { queryUsers, resetUserPassword } from '../../api/users'
import { extractErrorReason } from '../../api/common'
import {
  exportMemberInfoXlsx,
  fetchMemberInfoExportRows,
} from '../../utils/memberInfoExport'
import ExportScopeModal from '../../components/ExportScopeModal'
import { listOrgDescendantIds } from '../../utils/orgTree'
import ErrorState from '../../components/ErrorState'
import MatchedMembersTable from '../../components/MatchedMembersTable'
import OrganizationName from '../../components/OrganizationName'
import MemberSearchModeToggle from '../../components/MemberSearchModeToggle'
import MemberSearchNav from '../../components/MemberSearchNav'
import MultiSelectHeaderFilter from '../../components/MultiSelectHeaderFilter'
import PersonSearchBox from '../../components/PersonSearchBox'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { findMemberPage, useMemberSearch } from '../../composables/useMemberSearch'
import { usePositionLabel } from '../../composables/usePositionLabel'
import { useUserNames } from '../../composables/useUserNames'
import { useUserOrganizations } from '../../composables/useUserOrganizations'
import { useT } from '../../i18n'
import { formatPaginationTotal } from '../../utils/pagination'
import { ORG_SEARCH_DEBOUNCE_MS } from '../../config/organization'
import { BULK_ADD_MEMBERS_ROUTE } from '../../config/bulkMembers'
import { useAuthStore } from '../../store/auth'
import { useUiStateStore } from '../../store/uiState'
import { buildOrgTreeData, collectOrgSubtree } from '../../utils/orgTree'
import { formatPartyScoreTotal, formatPartyScoreTotalDecimal } from '../../utils/partyScore'
import {
  groupOrganizationMembers,
  uniqueUserOrganizations,
  type UserMemberRow,
} from '../../utils/userOrganization'

/** 组织成员表每页条数（代码要求 12：表格每页最多 100 行） */
const MEMBER_PAGE_SIZE = 100

/** 添加成员弹窗：停止输入后延迟 1 秒再搜索，避免每敲一个字符就发一次请求 */
const MEMBER_SEARCH_DEBOUNCE_MS = 1000

/** 添加成员弹窗一次搜索最多取 20 人：下拉首屏展示 5 条，其余可通过滚动查看 */
const MEMBER_SEARCH_PAGE_SIZE = 20

/** 搜索下拉高度：约展示 5 条（每条 32px），超出后下拉内部滚动 */
const MEMBER_SEARCH_LIST_HEIGHT = 5 * 32

interface OrgFormValues {
  code: string
  name: string
  parent_id: number | null
}

interface OrgAdminViewProps {
  /**
   * 组织选中态的会话缓存 key。
   * 管理端与党委学校端复用同一页面时各用一个 key，避免两端的选择状态互相串用。
   */
  uiKey?: string
  /**
   * 左侧组织树的固定根节点 ID。
   * 未传时按顶级组织（parent_id=null）建树；党委学校端传入 2，只展示「学院党委」及其下级。
   */
  rootOrgId?: number
  /**
   * 成员列表以「先锋等级」（党建活动加分总分）代替「工作地点」列。
   * 党委学校端「组织管理」开启，口径与支部端「支部管理」成员列表一致；
   * 管理端「组织架构」保持原「工作地点」列。
   */
  partyScoreColumns?: boolean
  /**
   * 成员列表操作列提供「重置密码」（复用管理端「用户与账户」的重置逻辑）。
   * 仅党委学校端「组织管理」开启。
   */
  showResetPassword?: boolean
  /**
   * 是否显示「导出表格」按钮（可选，默认 false）。
   * 导出当前组织全部成员的「党员信息」与「成绩信息」两个工作表；仅党委学校端开启。
   */
  exportMemberInfo?: boolean
  /**
   * 左侧组织树「新建组织」旁展示「批量添加新成员」按钮，点击进入填报辅助页
   * （组织 / 身份 / 系统角色对照表 + 样表说明）。仅党委学校端开启。
   */
  showBulkAdd?: boolean
}

/**
 * 左侧组织树搜索框（代码要求 26）。
 *
 * 输入草稿保留在本组件内部，停顿 ORG_SEARCH_DEBOUNCE_MS 后才把关键词提交给宿主；
 * 打字过程只重渲染这个输入框，不重建组织树、不重渲染成员表。
 * @param value 已生效的搜索关键词（必填；外部清空 / 恢复时同步到输入框）
 * @param onChange 关键词生效回调（必填；防抖结束或回车时调用）
 * @returns 组织树搜索输入框
 */
function OrgTreeSearchBox({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(value)

  // 外部重置关键词（如搜索定位后清空过滤）时同步输入框；用户输入过程中不覆盖草稿
  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    const timer = window.setTimeout(() => onChange(draft), ORG_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, onChange])

  return (
    <Input.Search
      allowClear
      size="small"
      style={{ marginBottom: 8 }}
      prefix={<SearchOutlined />}
      placeholder={t('adminOrg.searchPlaceholder')}
      value={draft}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
      onSearch={(v: string) => onChange(v)}
    />
  )
}

/**
 * 成员搜索框（代码要求 26）。
 *
 * 输入草稿保留在本组件内部，仅在回车 / 点击搜索 / 清空时提交给宿主；
 * 打字过程不会更新页面状态，避免每敲一个字符就重渲染整张成员表。
 * @param value 已提交的搜索词（必填；外部结束匹配 / 恢复状态时同步到输入框）
 * @param onChange 搜索词变更回调（必填；清空或确认搜索时调用）
 * @param onSearch 触发查询回调（必填；回车 / 点击搜索按钮时调用）
 * @param loading 是否正在搜索（必填，用于展示加载态）
 * @returns 成员搜索输入框
 */
function MemberSearchInput({
  value,
  onChange,
  onSearch,
  loading,
}: {
  value: string
  onChange: (value: string) => void
  onSearch: (value: string) => void
  loading: boolean
}) {
  const [draft, setDraft] = useState(value)

  // 外部清空 / 恢复搜索词时同步输入框
  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <PersonSearchBox
      width={320}
      value={draft}
      onChange={(next: string) => {
        setDraft(next)
        // 清空立即同步受控值，使「结束匹配」等依赖搜索词的状态及时收回
        if (next === '') onChange('')
      }}
      onSearch={(v: string) => {
        onChange(v)
        onSearch(v)
      }}
      loading={loading}
    />
  )
}

/**
 * 管理端：组织架构（组织树 + 组织 CRUD + 成员任职管理，成员详情跳转共用领导端成员详情页）。
 * 搜索成员后组织树自动滚动到命中组织；搜索状态按 uiKey 记忆，进入成员详情再返回后
 * 仍可继续查看上一次的模糊匹配结果与当前定位；表头提供「结束匹配」按钮恢复普通浏览。
 * 党委学校端复用本页时开启 partyScoreColumns（先锋等级列）与 showResetPassword（重置密码操作）。
 * 成员列表按 user_id 合并：同一成员在同一组织有多个职位时只展示一行（职位栏并列展示全部职位），
 * 「所属组织」标签按组织去重；移除成员时会一并删除该成员在该组织的全部职位记录。
 * @param { uiKey = 'admin_m3', rootOrgId, partyScoreColumns = false, showResetPassword = false, showBulkAdd = false, exportMemberInfo = false, } 类型：OrgAdminViewProps；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function OrgAdminView({
  uiKey = 'admin_m3',
  rootOrgId,
  partyScoreColumns = false,
  showResetPassword = false,
  showBulkAdd = false,
  exportMemberInfo = false,
}: OrgAdminViewProps) {
  const t = useT()
  const { message, modal } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()

  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  // 选中组织 ID 存入 Zustand 会话状态，切换路由回来后仍保留
  const selectedId = useUiStateStore((s) => s.selectedOrgIds[uiKey] ?? null)
  const setSelectedId = useUiStateStore((s) => s.setSelectedOrgId)
  // 左侧组织树的收起状态（按模块 key 记忆，跨路由返回仍保持）
  const treeCollapsed = useUiStateStore((s) => s.collapsedOrgTrees[uiKey] ?? false)
  const setTreeCollapsed = useUiStateStore((s) => s.setOrgTreeCollapsed)
  // 已展开的树节点（按模块 key 记忆，切走再回来仍保持刚刚查看的展开状态）
  const storedExpandedKeys = useUiStateStore((s) => s.expandedOrgTreeKeys[uiKey])
  const setOrgTreeExpanded = useUiStateStore((s) => s.setOrgTreeExpanded)

  // 组织搜索关键词（仅前端过滤树节点）
  const [orgSearch, setOrgSearch] = useState('')

  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  // 导出党员信息 + 成绩信息时的按钮加载态（导出期间禁用避免重复点击）
  const [exportingMembers, setExportingMembers] = useState(false)
  // 导出范围弹窗（选择是否包含下级组织）
  const [exportScopeOpen, setExportScopeOpen] = useState(false)
  const memberRequestRef = useRef(0)
  const [membersOrgId, setMembersOrgId] = useState<number | null>(null)
  // 成员表页码按模块 key 记忆：进入成员详情再返回时仍停留在搜索命中的那一页
  const memberPage = useUiStateStore((s) => s.memberPages[uiKey] ?? 1)
  const setMemberPage = useUiStateStore((s) => s.setMemberPage)
  // 首次加载组织时沿用上次页码（返回后恢复命中页）；之后切换组织默认回到第 1 页
  const initialMemberPageRef = useRef(memberPage)
  const firstOrgLoadRef = useRef(true)
  const [memberTotal, setMemberTotal] = useState(0)
  const [actingKey, setActingKey] = useState<string | null>(null)
  /** 成员「先锋等级」列：当前页成员 uid → 党建加分总计（无记录按 0 分处理） */
  const [partyScores, setPartyScores] = useState<Map<number, string>>(new Map())
  const [partyScoresLoading, setPartyScoresLoading] = useState(false)
  /** 党委学校端：职位筛选选中的职位编码（空数组表示不过滤） */
  const [positionFilter, setPositionFilter] = useState<string[]>([])
  /** 党委学校端：先锋等级排序方向（null 表示不排序） */
  const [scoreSort, setScoreSort] = useState<'ascend' | 'descend' | null>(null)
  const [positionFilterOpened, setPositionFilterOpened] = useState(false)
  const [filterOrgId, setFilterOrgId] = useState<number | null>(null)
  const needsAllMembers = partyScoreColumns && filterOrgId === selectedId && (positionFilterOpened || positionFilter.length > 0 || scoreSort !== null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  /** 当前组织平均成绩（后端 DecimalText；仅党委学校端展示） */
  const [orgAverageScore, setOrgAverageScore] = useState<string | null>(null)
  const [orgAverageLoading, setOrgAverageLoading] = useState(false)

  const [orgModal, setOrgModal] = useState<
    { mode: 'create' | 'edit'; org?: OrganizationInfo } | null
  >(null)
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgForm] = Form.useForm<OrgFormValues>()

  const [newMember, setNewMember] = useState<{
    user_id: number | null
    position: string
    workplace: string
  }>({ user_id: null, position: '', workplace: '' })
  const [addingMember, setAddingMember] = useState(false)
  /** 新增成员弹窗开关（成员操作收进弹窗，避免与表头上方的搜索框混在一起） */
  const [addModalOpen, setAddModalOpen] = useState(false)
  /** 添加成员弹窗中按学号/工号或姓名搜索到的人员（最多 MEMBER_SEARCH_PAGE_SIZE 条） */
  const [memberOptions, setMemberOptions] = useState<UserInfo[]>([])
  /** 人员搜索请求是否在途（用于下拉加载态） */
  const [memberSearching, setMemberSearching] = useState(false)
  /** 最近一次搜索关键词：异步结果返回时用于丢弃过期请求，避免慢请求覆盖新结果 */
  const memberSearchKeywordRef = useRef('')
  /** 人员搜索防抖计时器：停止输入 MEMBER_SEARCH_DEBOUNCE_MS 后才真正请求 */
  const memberSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 重置密码弹窗：可指定新密码（留空则由后端生成随机密码） */
  const [resetUid, setResetUid] = useState<number | null>(null)
  const [resetRunning, setResetRunning] = useState(false)
  /** 重置成功后返回的明文密码；非空时展示结果弹窗，关闭后不可再次查看 */
  const [resetResult, setResetResult] = useState<string | null>(null)
  const [resetPwdForm] = Form.useForm<{ password?: string }>()

  const reportError = useErrorFeedback()

  /** 左侧组织树实际展示的组织范围；传入 rootOrgId 时只保留该节点及其全部下级（见 utils/orgTree） */
  const orgsInTree = useMemo(
    () => collectOrgSubtree(orgs, rootOrgId),
    [orgs, rootOrgId],
  )

  const loadOrgs = useCallback(async (force?: boolean) => {
    setOrgsLoading(true)
    setOrgsError(null)
    try {
      const list = await listAllOrganizations(force)
      setOrgs(list)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setOrgsError(extractErrorReason(err, t))
      }
    } finally {
      setOrgsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadOrgs()
  }, [loadOrgs])

  const loadMembers = useCallback(
    async (orgId: number, page: number, force?: boolean) => {
      const requestId = ++memberRequestRef.current
      const token = useAuthStore.getState().token
      const isCurrent = () => requestId === memberRequestRef.current && token === useAuthStore.getState().token
      setMembersLoading(true)
      try {
        if (needsAllMembers) {
          // 仅启用跨页筛选或排序时才读取全部成员
          const all: OrganizationMember[] = []
          for (let current = 1; ; current += 1) {
            if (!isCurrent()) return
            const res = await queryOrgMembers(
              orgId,
              { page: current, page_size: MEMBER_PAGE_SIZE },
              force,
            )
            if (!isCurrent()) return
            all.push(...res.data)
            if (current >= res.total_pages || res.data.length < MEMBER_PAGE_SIZE) break
          }
          if (!isCurrent()) return
          setMembersOrgId(orgId)
          setMembers(all)
          setMemberTotal(all.length)
          return
        }
        const res = await queryOrgMembers(
          orgId,
          { page, page_size: MEMBER_PAGE_SIZE },
          force,
        )
        if (!isCurrent()) return
        setMembersOrgId(orgId)
        setMembers(res.data)
        setMemberTotal(res.total)
      } catch (err) {
        if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) reportError(err)
      } finally {
        if (isCurrent()) setMembersLoading(false)
      }
    },
    [needsAllMembers, reportError],
  )

  // 成员表展示行：同一成员在当前组织有多个职位时合并为一行（避免出现两个一样的人）
  const memberRows = useMemo(() => groupOrganizationMembers(membersOrgId === selectedId ? members : []), [members, membersOrgId, selectedId])
  // 全量成员用户 ID（按展示行去重）→ 先锋等级（排序需覆盖全部成员）
  const allMemberIds = useMemo(() => memberRows.map((m) => m.user_id), [memberRows])
  // 职位编码 → 职位名称（成员接口只返回编码，展示时映射为名称，管理员附带编号）
  const positionLabel = usePositionLabel(memberRows.length > 0)

  /** 党委学校端职位筛选可选项：当前组织全量成员中实际出现的职位 */
  const memberPositionOptions = useMemo(() => {
    const codes = new Set<string>()
    for (const member of members) {
      const code = member.position?.trim()
      if (code) codes.add(code)
    }
    return [...codes]
      .map((code) => ({ value: code, label: positionLabel(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
  }, [members, positionLabel])

  /**
   * 党委学校端：职位筛选 + 分数排序后的全量成员行；
   * 其余门户保持服务端分页的当前页数据。
   */
  const filteredRows = useMemo(() => {
    if (!partyScoreColumns) return memberRows
    let rows = memberRows
    if (positionFilter.length > 0) {
      rows = rows.filter((row) =>
        row.positions.some((code) => positionFilter.includes(code)),
      )
    }
    if (scoreSort === null) return rows
    const scoreOf = (uid: number) => {
      const value = Number(partyScores.get(uid) ?? 0)
      return Number.isFinite(value) ? value : 0
    }
    return [...rows].sort((a, b) => {
      const diff = scoreOf(a.user_id) - scoreOf(b.user_id)
      return scoreSort === 'ascend' ? diff : -diff
    })
  }, [partyScoreColumns, memberRows, positionFilter, scoreSort, partyScores])

  // 跨页筛选或排序时使用合并后的行数，普通浏览使用接口总数
  const displayTotal = needsAllMembers ? filteredRows.length : memberTotal

  // 全量数据仅在跨页操作时切片，普通浏览直接展示接口返回的当前页
  const visibleRows = useMemo(() => {
    if (!needsAllMembers) return memberRows
    const start = (memberPage - 1) * MEMBER_PAGE_SIZE
    return filteredRows.slice(start, start + MEMBER_PAGE_SIZE)
  }, [needsAllMembers, memberRows, filteredRows, memberPage])

  // 当前页用户 ID：姓名 / 任职组织仅需解析当前展示页
  const visibleMemberIds = useMemo(
    () => visibleRows.map((m) => m.user_id),
    [visibleRows],
  )

  /** 前端分页下定位成员所在页（供搜索命中后跳转到目标页） */
  const resolveMemberPage = useCallback(
    async (orgId: number, uid: number) => {
      if (orgId !== selectedId) return findMemberPage(orgId, uid, MEMBER_PAGE_SIZE)
      const index = memberRows.findIndex((row) => row.user_id === uid)
      return index === -1 ? null : Math.floor(index / MEMBER_PAGE_SIZE) + 1
    },
    [memberRows, selectedId],
  )

  // 切换组织时清空职位筛选与排序：不同组织的职位集合不同
  useEffect(() => {
    setPositionFilterOpened(false)
    setPositionFilter([])
    setScoreSort(null)
  }, [selectedId])

  // 当前组织平均成绩：随选中组织切换重新查询（仅党委学校端展示）
  useEffect(() => {
    if (!partyScoreColumns || selectedId === null) {
      setOrgAverageScore(null)
      setOrgAverageLoading(false)
      return
    }
    let cancelled = false
    setOrgAverageLoading(true)
    // 手动刷新（或成员增删后）必须绕过会话缓存，否则平均分会一直沿用旧的 null
    getPartyScoreOrganizationAverage(
      { organization_id: selectedId, recursive: true },
      refreshVersion > 0,
    )
      .then((res) => {
        if (!cancelled) setOrgAverageScore(res.average_score)
      })
      .catch(() => {
        if (!cancelled) setOrgAverageScore(null)
      })
      .finally(() => {
        if (!cancelled) setOrgAverageLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [partyScoreColumns, selectedId, refreshVersion])

  // 筛选后总页数变少时把页码收敛到末页（加载中不收敛，避免覆盖搜索目标页）
  useEffect(() => {
    if (!needsAllMembers || membersLoading) return
    const maxPage = Math.max(1, Math.ceil(displayTotal / MEMBER_PAGE_SIZE))
    if (memberPage > maxPage) setMemberPage(uiKey, maxPage)
  }, [
    needsAllMembers,
    membersLoading,
    displayTotal,
    memberPage,
    uiKey,
    setMemberPage,
  ])

  // 成员 ID 搜索：定位所属组织 → 展开并选中该组织 → 高亮命中成员行（逻辑见 useMemberSearch）
  const search = useMemberSearch({
    orgs: orgsInTree,
    memberPageSize: MEMBER_PAGE_SIZE,
    activeOrgId: selectedId,
    onSelectOrg: (orgId: number) => { setNewMember((s) => ({ ...s, position: '' })); setSelectedId(uiKey, orgId) },
    onClearFilter: () => setOrgSearch(''),
    onLoadPage: (orgId: number, page: number) => {
      setMemberPage(uiKey, page)
      void loadMembers(orgId, page)
    },
    memberRows: visibleRows,
    // 党委学校端在前端过滤 / 排序 / 分页，搜索命中后按当前行序计算目标页
    resolveMemberPage: needsAllMembers ? resolveMemberPage : undefined,
    // 搜索状态按模块 key 记忆：进入成员详情再返回后继续展示上一次的模糊匹配结果
    persistKey: uiKey,
  })
  const { consumePendingPage } = search

  // 组织树默认只展开根节点（进入页面不全量展开，避免树过长铺满；深层分支点击再展开）
  const rootKeys = useMemo<React.Key[]>(() => {
    if (rootOrgId !== undefined) return [rootOrgId]
    return orgsInTree.filter((o) => o.parent_id === null).map((o) => o.id)
  }, [orgsInTree, rootOrgId])
  // 展开节点：搜索命中时展开到目标组织链；否则用上次手动展开的节点（跨路由保留）；再否则只展开根节点
  const expandedKeys = useMemo<React.Key[]>(
    () => search.focusKeys ?? storedExpandedKeys ?? rootKeys,
    [search.focusKeys, storedExpandedKeys, rootKeys],
  )

  // 切换组织后加载成员：默认回到第 1 页；搜索命中按目标页；首次进入沿用上次页码（跨路由返回恢复）
  useEffect(() => {
    if (selectedId !== null) {
      const pending = consumePendingPage()
      const targetPage = pending ?? (firstOrgLoadRef.current ? initialMemberPageRef.current : 1)
      firstOrgLoadRef.current = false
      setMemberPage(uiKey, targetPage)
      void loadMembers(selectedId, targetPage)
    } else {
      memberRequestRef.current += 1
      setMembersLoading(false)
      setMembersOrgId(null)
      setMembers([])
      setMemberTotal(0)
    }
    return () => { memberRequestRef.current += 1 }
  }, [selectedId, loadMembers, consumePendingPage, uiKey, setMemberPage])

  // parent_id -> children 组树：搜索关键词仅前端过滤名称/编码（见 utils/orgTree）
  const treeData = useMemo(
    () => buildOrgTreeData(orgsInTree, orgSearch, rootOrgId),
    [orgsInTree, orgSearch, rootOrgId],
  )

  // 搜索定位到成员后，组织树自动滚动到该组织节点（树很长时也能直接看到定位结果）
  useEffect(() => {
    if (treeCollapsed || search.matchOnly || search.hitUid === null || selectedId === null) return
    // 等组织树完成展开动画并渲染出选中节点后再滚动，避免定位到尚未挂载的节点
    const timer = window.setTimeout(() => {
      document
        .querySelector('.org-tree-card .ant-tree-treenode-selected')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [treeCollapsed, search.matchOnly, search.hitUid, search.locateTick, selectedId, treeData])

  const parentOptions = useMemo(
    () =>
      orgsInTree.map((o) => ({
        value: o.id,
        title: `${o.name}（${o.code}）`,
      })),
    [orgsInTree],
  )


  const selectedOrg = useMemo(
    () => orgsInTree.find((o) => o.id === selectedId) ?? null,
    [orgsInTree, selectedId],
  )

  /** 当前组织是否有下级组织：没有下级时导出范围弹窗禁用「包含下级组织」 */
  const hasChildOrgs = useMemo(
    () => (selectedOrg ? listOrgDescendantIds(orgsInTree, selectedOrg.id).length > 0 : false),
    [orgsInTree, selectedOrg],
  )

  /**
   * 学校党委端「组织成员管理」导出：当前组织（可选择是否含下级）全部成员的党员信息与成绩信息。
   * 导出时按组织范围重新拉取全部成员（不局限于当前页），与支部端导出同一份表格结构。
   * @param includeChildren 是否包含下级组织（必填）
   */
  const runExportMembers = useCallback(async (includeChildren: boolean) => {
    if (!selectedOrg || exportingMembers) return
    setExportingMembers(true)
    try {
      const rows = await fetchMemberInfoExportRows({
        orgs: orgsInTree,
        orgId: selectedOrg.id,
        includeChildren,
      })
      if (rows.length === 0) {
        message.warning(t('branchExport.empty'))
        setExportScopeOpen(false)
        return
      }
      await exportMemberInfoXlsx({
        orgName: selectedOrg.name,
        members: rows,
        positionLabel,
        t,
      })
      message.success(t('branchExport.success'))
      setExportScopeOpen(false)
    } catch (err) {
      message.error(t('branchExport.failed', { reason: extractErrorReason(err, t) }))
    } finally {
      setExportingMembers(false)
    }
  }, [selectedOrg, orgsInTree, exportingMembers, positionLabel, t, message])

  const displayedMemberIds = useMemo(() => search.matchOnly ? [] : visibleMemberIds, [search.matchOnly, visibleMemberIds])
  const scoreMemberIds = useMemo(() => search.matchOnly ? [] : scoreSort !== null ? allMemberIds : visibleMemberIds, [search.matchOnly, scoreSort, allMemberIds, visibleMemberIds])

  // 当前成员页内的用户 ID → 姓名 / 任职组织（均走会话缓存，相同 ID 不重复请求）
  const memberNames = useUserNames(displayedMemberIds, reportError, refreshVersion)
  const memberOrgs = useUserOrganizations(displayedMemberIds, refreshVersion)

  // 默认只查询可见成员积分；启用分数排序时才查询全部成员积分。
  useEffect(() => {
    if (!partyScoreColumns || scoreMemberIds.length === 0) {
      setPartyScores(new Map())
      setPartyScoresLoading(false)
      return
    }
    let cancelled = false
    setPartyScoresLoading(true)
    getPartyScoreTotals(scoreMemberIds)
      .then((items) => {
        if (cancelled) return
        const next = new Map<number, string>(scoreMemberIds.map((uid) => [uid, '0']))
        for (const [uid, score] of items) next.set(uid, score)
        setPartyScores(next)
      })
      .catch(() => {
        if (!cancelled) setPartyScores(new Map())
      })
      .finally(() => {
        if (!cancelled) setPartyScoresLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scoreMemberIds, partyScoreColumns, refreshVersion])

  const onSelectTree: TreeProps['onSelect'] = (keys: React.Key[]) => {
    // 在「单独查看匹配人员」模式下点击组织树，视为想浏览该组织：自动切回组织内查看
    // （false：不要按当前命中人员重新定位，否则会覆盖用户刚选中的组织）
    if (search.matchOnly) search.toggleMatchOnly(false)
    setNewMember((s) => ({ ...s, position: '' }))
    setSelectedId(uiKey, keys.length ? Number(keys[0]) : null)
  }

  // 双击成员行 / 「查看详细」跳转到成员详情页（与领导端「组织概览」共用同一页面，
  // from=uiKey 让侧栏仍高亮当前组织模块，返回时回到本页）
  const openMemberDetail = useCallback(
    (uid: number) => {
      navigate(`/portal/${portalKey}/organization-members/${uid}?from=${uiKey}`)
    },
    [navigate, portalKey, uiKey],
  )

  const openCreate = (parent?: OrganizationInfo) => {
    setOrgModal({ mode: 'create' })
    orgForm.setFieldsValue({
      code: '',
      name: '',
      parent_id: parent ? parent.id : selectedId,
    })
  }

  const openEdit = (org: OrganizationInfo) => {
    setOrgModal({ mode: 'edit', org })
    orgForm.setFieldsValue({ code: org.code, name: org.name, parent_id: org.parent_id })
  }

  const submitOrg = async () => {
    const values = await orgForm.validateFields()
    if (!orgModal) return
    setOrgSaving(true)
    try {
      if (orgModal.mode === 'create') {
        await createOrganization({
          code: values.code.trim(),
          name: values.name.trim(),
          parent_id: values.parent_id ?? null,
        })
        message.success(t('adminOrg.createSuccess'))
      } else {
        await updateOrganization(orgModal.org!.id, {
          code: values.code.trim(),
          name: values.name.trim(),
          parent_id: values.parent_id ?? null,
        })
        message.success(t('adminOrg.updateSuccess'))
      }
      setOrgModal(null)
      await loadOrgs()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setOrgSaving(false)
    }
  }

  const removeOrg = async (org: OrganizationInfo) => {
    setActingKey(`org-${org.id}`)
    try {
      await deleteOrganization(org.id)
      message.success(t('adminOrg.deleteSuccess'))
      if (selectedId === org.id) setSelectedId(uiKey, null)
      await loadOrgs()
    } catch (err) {
      reportError(err)
    } finally {
      setActingKey(null)
    }
  }

  /**
   * 添加成员弹窗的人员搜索请求：输入为纯数字时按学号/工号精确查（ids），
   * 否则按姓名模糊查（keyword）；返回结果过期的请求会被丢弃。
   * @param keyword 已去空格的搜索关键词
   */
  const searchMembers = useCallback(
    async (keyword: string) => {
      setMemberSearching(true)
      try {
        const numeric = /^\d+$/.test(keyword)
        const res = await queryUsers(
          {
            page: 1,
            page_size: MEMBER_SEARCH_PAGE_SIZE,
            ...(numeric ? { ids: keyword } : { keyword }),
          },
          true,
        )
        // 关键词已变化说明用户又输入了内容，丢弃这次结果
        if (memberSearchKeywordRef.current !== keyword) return
        setMemberOptions(res.data ?? [])
      } catch (err) {
        if (memberSearchKeywordRef.current !== keyword) return
        setMemberOptions([])
        reportError(err)
      } finally {
        if (memberSearchKeywordRef.current === keyword) setMemberSearching(false)
      }
    },
    [reportError],
  )

  /**
   * 添加成员弹窗的搜索输入：重置防抖计时器，停止输入 1 秒后才发请求。
   * @param value 输入框当前文本
   */
  const handleMemberSearch = useCallback(
    (value: string) => {
      const keyword = value.trim()
      memberSearchKeywordRef.current = keyword
      if (memberSearchTimerRef.current) clearTimeout(memberSearchTimerRef.current)
      if (!keyword) {
        setMemberOptions([])
        setMemberSearching(false)
        return
      }
      memberSearchTimerRef.current = setTimeout(() => {
        void searchMembers(keyword)
      }, MEMBER_SEARCH_DEBOUNCE_MS)
    },
    [searchMembers],
  )

  // 弹窗关闭或页面卸载时清掉尚未触发的防抖计时器，避免卸载后仍发请求
  useEffect(
    () => () => {
      if (memberSearchTimerRef.current) clearTimeout(memberSearchTimerRef.current)
    },
    [],
  )

  const addMember = async () => {
    if (selectedId === null || newMember.user_id === null || !newMember.position.trim()) return
    setAddingMember(true)
    try {
      await addOrgMember(selectedId, {
        user_id: newMember.user_id,
        position: newMember.position.trim(),
        workplace: newMember.workplace.trim() || null,
      })
      message.success(t('adminOrg.memberAddSuccess'))
      setNewMember({ user_id: null, position: '', workplace: '' })
      setMemberOptions([])
      memberSearchKeywordRef.current = ''
      setAddModalOpen(false)
      // 成员数变化会改变组织平均分，触发一次强制刷新
      setRefreshVersion((value) => value + 1)
      await loadMembers(selectedId, memberPage)
    } catch (err) {
      reportError(err)
    } finally {
      setAddingMember(false)
    }
  }

  /**
   * 移除成员：同一成员在当前组织可能有多条职位记录，逐条删除后再重新拉取列表（代码要求 25）。
   * 使用 useCallback 保持引用稳定，避免成员列表列定义每次渲染都重建。
   * @param member 待移除的成员行（必填，含该行全部成员记录 ID）
   */
  const removeMember = useCallback(
    async (member: UserMemberRow) => {
      if (selectedId === null) return
      setActingKey(`member-${member.user_id}`)
      try {
        for (const id of member.memberIds) {
          await removeOrgMember(selectedId, id)
        }
        message.success(t('adminOrg.memberRemoveSuccess'))
        // 成员数变化会改变组织平均分，触发一次强制刷新
        setRefreshVersion((value) => value + 1)
        await loadMembers(selectedId, memberPage)
      } catch (err) {
        reportError(err)
      } finally {
        setActingKey(null)
      }
    },
    [selectedId, memberPage, loadMembers, message, t, reportError],
  )

  /**
   * 打开重置密码弹窗（复用管理端「用户与账户」的重置逻辑）。
   * 调用前需在操作列先经 Popconfirm 二次确认，避免误触直接改掉成员密码。
   * @param uid 目标成员用户 ID（必填）
   */
  const openResetPassword = useCallback(
    (uid: number) => {
      resetPwdForm.resetFields()
      setResetUid(uid)
    },
    [resetPwdForm],
  )

  /**
   * 重置密码目标标识：优先展示「姓名（学号）」（如「李同学（123456789）」），
   * 姓名尚未解析到时回退为 #学号，便于确认操作对象。
   */
  const resetTargetLabel = useMemo(() => {
    if (resetUid === null) return ''
    return memberNames.has(resetUid)
      ? `${memberNames.get(resetUid)}（${resetUid}）`
      : `#${resetUid}`
  }, [resetUid, memberNames])

  /** 提交重置密码：填写了新密码则重置为指定值，留空则由后端生成随机密码并回显 */
  const doResetPassword = async () => {
    if (resetUid === null) return
    const raw = resetPwdForm.getFieldValue('password')
    const newPassword = typeof raw === 'string' ? raw.trim() : ''
    setResetRunning(true)
    try {
      const res = await resetUserPassword(resetUid, newPassword || undefined)
      setResetResult(res.new_password)
      setResetUid(null)
      resetPwdForm.resetFields()
    } catch (err) {
      reportError(err)
    } finally {
      setResetRunning(false)
    }
  }

  /**
   * 成员列表「工作地点 / 先锋等级」列。
   * 党委学校端开启 partyScoreColumns 时改为党建活动加分总分（与支部端「支部管理」一致），
   * 其余场景保持原「工作地点」列。
   */
  const workplaceOrScoreColumn = useMemo<ColumnsType<UserMemberRow>[number]>(
    () =>
      partyScoreColumns
        ? {
            title: t('branch.colPioneerLevel'),
            key: 'pioneer_level',
            width: 140,
            // 点击表头切换正序 / 倒序（实际排序在前端完成，见 filteredRows）
            sorter: true,
            sortOrder: scoreSort,
            render: (_, record) => {
              if (partyScoresLoading) {
                return <span className="cell-sub">{t('common.loading')}</span>
              }
              const score = partyScores.get(record.user_id) ?? '0'
              return <Tag color="green">{formatPartyScoreTotal(score)}</Tag>
            },
          }
        : {
            title: t('adminOrg.colWorkplace'),
            key: 'workplace',
            // 同一组织多个职位的工作地点去重后合并展示（如「A、B」）
            render: (_, record) =>
              record.workplaces.length > 0 ? record.workplaces.join('、') : '—',
          },
    [partyScoreColumns, t, partyScores, partyScoresLoading, scoreSort],
  )

  const memberColumns = useMemo<ColumnsType<UserMemberRow>>(
    () => [
      {
        title: 'UID',
        dataIndex: 'user_id',
        key: 'user_id',
        width: 80,
      },
      {
        // 批量解析姓名，缺失项保留占位符
        title: t('profile.name'),
        key: 'user_name',
        width: 130,
        render: (_, record) =>
          memberNames.has(record.user_id)
            ? (memberNames.get(record.user_id) ?? '—')
            : t('common.loading'),
      },
      {
        // 用户的全部任职组织（当前组织高亮），数据来自 GET /organization-members?uids=
        // 同一组织多条职位记录只展示一个标签（避免出现两个完全相同的组织）
        title: t('adminOrg.colUserOrg'),
        key: 'user_orgs',
        width: 220,
        render: (_, record) => {
          if (!memberOrgs.has(record.user_id)) {
            return <span className="cell-sub">{t('common.loading')}</span>
          }
          const list = uniqueUserOrganizations(memberOrgs.get(record.user_id) ?? [])
          if (list.length === 0) return <span className="cell-sub">—</span>
          return (
            <span className="org-member-tags">
              {list.map((o) => (
                <Tag
                  key={o.organization_id}
                  color={o.organization_id === selectedId ? 'blue' : 'default'}
                  title={o.organization_name}
                >
                  <OrganizationName id={o.organization_id} fallbackName={o.organization_name} code={orgs.find((org) => org.id === o.organization_id)?.code} />
                </Tag>
              ))}
            </span>
          )
        },
      },
      {
        // 党委学校端：点击「身份」表头弹出当前组织的全部职位，可多选筛选
        title: partyScoreColumns ? (
          <MultiSelectHeaderFilter
            onOpenChange={(open) => {
              if (open) {
                setFilterOrgId(selectedId)
                setPositionFilterOpened(true)
              }
            }}
            title={t('adminOrg.colIdentity')}
            allLabel={t('common.all')}
            options={memberPositionOptions}
            value={positionFilter}
            onChange={(next) => {
              setPositionFilter(next)
              setMemberPage(uiKey, 1)
            }}
          />
        ) : (
          t('adminOrg.colIdentity')
        ),
        key: 'position',
        width: 200,
        // 同一组织多个职位：职位栏并列展示全部职位（名称缺失时显示未知），管理员附带编号
        render: (_, record) =>
          record.positions.length === 0 ? (
            '—'
          ) : (
            <Space wrap size={[8, 4]}>
              {record.positions.map((code) => (
                <Tooltip key={code} title={positionLabel(code)}>
                  <Tag color="blue">{positionLabel(code)}</Tag>
                </Tooltip>
              ))}
            </Space>
          ),
      },
      // 「工作地点 / 先锋等级」列：党委学校端改为先锋等级（党建加分总分）
      workplaceOrScoreColumn,
      {
        title: t('approval.colAction'),
        key: 'action',
        width: showResetPassword ? 170 : 140,
        render: (_, record) => (
          <div className="approval-actions">
            <Tooltip title={t('adminOrg.viewUser')}>
              <Button
                type="link"
                size="small"
                onClick={() => openMemberDetail(record.user_id)}
              >
                {t('adminOrg.viewUser')}
              </Button>
            </Tooltip>
            {showResetPassword && (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [{ key: 'reset-password', label: t('adminUsers.resetPassword') }],
                  onClick: () => modal.confirm({
                    title: t('adminOrg.memberResetConfirm', {
                      name: memberNames.get(record.user_id)
                        ? `${memberNames.get(record.user_id)}（${record.user_id}）`
                        : `#${record.user_id}`,
                    }),
                    okText: t('adminUsers.resetPassword'),
                    cancelText: t('approval.cancel'),
                    onOk: () => openResetPassword(record.user_id),
                  }),
                }}
              >
                <Button type="text" size="small" icon={<MoreOutlined />} aria-label={t('adminUsers.moreActions')} />
              </Dropdown>
            )}
            <Popconfirm
              title={t('adminOrg.memberRemoveConfirm')}
              okText={t('adminOrg.remove')}
              cancelText={t('approval.cancel')}
              okButtonProps={{
                danger: true,
                loading: actingKey === `member-${record.user_id}`,
              }}
              onConfirm={() => void removeMember(record)}
            >
              <Button type="link" size="small" danger>
                {t('adminOrg.remove')}
              </Button>
            </Popconfirm>
          </div>
        ),
      },
    ],
    [
      t,
      actingKey,
      memberNames,
      memberOrgs,
      orgs,
      positionLabel,
      selectedId,
      partyScoreColumns,
      openMemberDetail,
      workplaceOrScoreColumn,
      showResetPassword,
      modal,
      openResetPassword,
      removeMember,
      memberPositionOptions,
      positionFilter,
      setMemberPage,
      uiKey,
    ],
  )

  return (
    <div className={`admin-org-view${treeCollapsed ? ' is-tree-collapsed' : ''}`}>
      <section className="panel-card org-tree-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('adminOrg.treeTitle')}</h3>
          <div className="approval-toolbar org-tree-toolbar">
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => openCreate()}
            >
              {t('adminOrg.newOrg')}
            </Button>
            {/* 批量添加新成员：进入填报辅助页（组织 / 身份 / 系统角色对照表 + 样表说明） */}
            {showBulkAdd && (
              <Tooltip title={t('adminOrg.bulkAddHint')}>
                <Button
                  size="small"
                  icon={<TeamOutlined />}
                  onClick={() =>
                    navigate(`/portal/${portalKey}/${BULK_ADD_MEMBERS_ROUTE}?from=${uiKey}`)
                  }
                >
                  {t('adminOrg.bulkAddMembers')}
                </Button>
              </Tooltip>
            )}
            <Tooltip title={t('common.refresh')}>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadOrgs(true)} />
            </Tooltip>
          </div>
        </header>
        <div className="panel-card-body">
          {orgsError ? (
            <ErrorState message={orgsError} />
          ) : (
            <>
              {/* 搜索草稿留在组件内部并防抖，避免每输入一个字符就重建组织树（代码要求 26） */}
              <OrgTreeSearchBox value={orgSearch} onChange={setOrgSearch} />
              <Spin spinning={orgsLoading}>
                {/* 以「数据是否就绪」作为 key：组织数据到达后强制重挂载 Tree。
                    rc-tree 在 treeData 为空（数据未加载）时挂载会忽略随后传入的受控
                    expandedKeys，导致切走再返回组织树时展开态丢失；重挂载后可正常生效。 */}
                <Tree
                  key={(treeData?.length ?? 0) > 0 ? 'tree-loaded' : 'tree-empty'}
                  treeData={treeData}
                  expandedKeys={expandedKeys}
                  onExpand={(keys: React.Key[]) => {
                    search.setFocusKeys(keys)
                    setOrgTreeExpanded(uiKey, keys.map((k) => Number(k)))
                  }}
                  selectedKeys={selectedId !== null ? [selectedId] : []}
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
        {/* 表头固定：标题 + 操作按钮在第一行，搜索框在第二行；
            表格在卡片体内独立滚动，下滑时标题与搜索框始终可见 */}
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
              {search.matchOnly
                ? t('orgExplorer.matchOnlyTitle')
                : selectedOrg
                  ? `${selectedOrg.name}（${selectedOrg.code}）`
                  : t('adminOrg.detailTitle')}
            </h3>
            {/* 当前组织的平均成绩（含下级组织） */}
            {partyScoreColumns && selectedId !== null && !search.matchOnly && (
              <span className="org-average-score">
                {t('orgExplorer.orgAverageScore')}
                <strong>
                  {orgAverageLoading
                    ? '—'
                    : formatPartyScoreTotalDecimal(orgAverageScore)}
                </strong>
                <em>{t('party.scoreUnit')}</em>
              </span>
            )}
          </div>
          {/* 「单独查看匹配人员」模式下表格不再属于某个组织，隐藏组织维度的操作按钮 */}
          {selectedOrg && !search.matchOnly && (
            <div className="approval-toolbar">
              {/* 添加成员与搜索框分处表头/表体，避免被误认成搜索按钮 */}
              <Button
                type="primary"
                size="small"
                icon={<UserAddOutlined />}
                onClick={() => setAddModalOpen(true)}
              >
                {t('adminOrg.addMember')}
              </Button>
              <Tooltip title={t('common.refresh')}>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    invalidate(`GET /organizations/${selectedOrg.id}/members`)
                    invalidate('GET /users')
                    invalidate('GET /organization-members')
                    invalidate('GET /party/scores')
                    setRefreshVersion((value) => value + 1)
                    void loadMembers(selectedOrg.id, memberPage)
                  }}
                />
              </Tooltip>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate(selectedOrg)}>
                {t('adminOrg.newSubOrg')}
              </Button>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(selectedOrg)}
              >
                {t('adminOrg.editOrg')}
              </Button>
              <Popconfirm
                title={t('adminOrg.orgDeleteConfirm')}
                okText={t('adminOrg.delete')}
                cancelText={t('approval.cancel')}
                okButtonProps={{
                  danger: true,
                  loading: actingKey === `org-${selectedOrg.id}`,
                }}
                onConfirm={() => void removeOrg(selectedOrg)}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  {t('adminOrg.delete')}
                </Button>
              </Popconfirm>
            </div>
          )}
          {/* 成员 ID 搜索（固定在表头内，随卡片表头始终可见，不随表格滚动）；
              输入草稿留在组件内，仅回车 / 搜索 / 清空时提交，避免逐字符重渲染成员表（代码要求 26） */}
          <div className="org-member-actions">
            <MemberSearchInput
              value={search.query}
              onChange={search.setQuery}
              onSearch={(value: string) => {
                // 搜索面向全组织成员：先清空职位筛选与排序，避免目标人员被过滤掉
                if (partyScoreColumns) {
                  setPositionFilter([])
                  setScoreSort(null)
                }
                search.run(value)
              }}
              loading={search.searching}
            />
            {/* 姓名模糊匹配到多人时：紧邻搜索框展示匹配总数 + 上一个 / 下一个，不遮挡成员表 */}
            <MemberSearchNav
              visible={search.resultVisible}
              total={search.resultTotal}
              index={search.matchIndex}
              loading={search.searching}
              canPrev={search.hasPrev}
              canNext={search.hasNext}
              onPrev={search.showPrev}
              onNext={search.showNext}
            />
            {/* 结束本次匹配：清除搜索词、匹配结果与高亮，恢复普通组织浏览（代码要求 10：悬停提示） */}
            {search.hasActive && (
              <Tooltip title={t('orgExplorer.endMatchHint')}>
                <Button size="small" icon={<CloseOutlined />} onClick={search.clear}>
                  {t('orgExplorer.endMatch')}
                </Button>
              </Tooltip>
            )}
            {/* 学校党委端：导出当前组织全部成员的党员信息与成绩信息（两个工作表） */}
            {exportMemberInfo && selectedOrg && !search.matchOnly && (
              <Tooltip title={t('branchExport.hint')}>
                <Button
                  icon={<DownloadOutlined />}
                  loading={exportingMembers}
                  disabled={membersLoading}
                  onClick={() => setExportScopeOpen(true)}
                >
                  {t('branchExport.button')}
                </Button>
              </Tooltip>
            )}
            {/* 右对齐：切换「单独查看匹配人员 / 在组织里面查看匹配人员」 */}
            <MemberSearchModeToggle
              matchOnly={search.matchOnly}
              visible={search.matches.length > 0}
              onToggle={search.toggleMatchOnly}
            />
          </div>
        </header>
        <div className="panel-card-body">
          {search.matchOnly ? (
            <MatchedMembersTable
              rows={search.matches}
              hitUid={search.hitUid}
              loading={search.searching || search.matchesLoading}
              onOpenMember={openMemberDetail}
            />
          ) : !selectedOrg ? (
            <Alert type="info" showIcon title={t('adminOrg.selectHint')} />
          ) : (
            <>
              <Table<UserMemberRow>
                rowKey={(r: UserMemberRow) => String(r.user_id)}
                loading={membersLoading}
                columns={memberColumns}
                dataSource={visibleRows}
                // 搜索命中的成员所在行高亮（夜间配色见 index.css 的 .org-member-row-hit）
                rowClassName={(record: UserMemberRow) =>
                  record.user_id === search.hitUid ? 'org-member-row-hit' : ''
                }
                locale={{ emptyText: t('common.noData') }}
                scroll={{ x: 960 }}
                onRow={(record: UserMemberRow) => ({
                  onDoubleClick: (e: React.MouseEvent) => {
                    if (isEntryActionTarget(e.target)) return
                    // 点击按钮/链接时不触发行点击
                    const target = e.target as HTMLElement
                    if (target.closest('button') || target.closest('.ant-popover')) return
                    openMemberDetail(record.user_id)
                  },
                  title: t('memberDetail.rowClickHint'),
                  style: { cursor: 'pointer' },
                })}
                onChange={(pagination, _filters, sorter) => {
                  const nextPage = pagination.current ?? 1
                  const order =
                    (Array.isArray(sorter) ? sorter[0]?.order : sorter.order) ?? null
                  if (partyScoreColumns) {
                    // 排序变化：重置到第 1 页，按前端重新排序后的数据切片
                    if (order !== scoreSort) {
                      setFilterOrgId(selectedId)
                      setScoreSort(order)
                      setMemberPage(uiKey, 1)
                      return
                    }
                    if (needsAllMembers) {
                      if (nextPage !== memberPage) setMemberPage(uiKey, nextPage)
                      return
                    }
                  }
                  // 服务端分页模式：翻页时重新请求该页
                  if (nextPage !== memberPage) {
                    setMemberPage(uiKey, nextPage)
                    void loadMembers(selectedOrg.id, nextPage)
                  }
                }}
                pagination={{
                  current: memberPage,
                  pageSize: MEMBER_PAGE_SIZE,
                  total: displayTotal,
                  showSizeChanger: false,
                  showQuickJumper: true,
                  showTotal: (n: number) => formatPaginationTotal(t, n, MEMBER_PAGE_SIZE),
                }}
              />
            </>
          )}
        </div>
      </section>

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
              onChange={(v: number | undefined) =>
                orgForm.setFieldValue('parent_id', v ?? null)
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加成员弹窗：UID + 职位 + 工作地点，成功提交后关闭并刷新成员列表 */}
      <Modal
        open={addModalOpen}
        title={`${t('adminOrg.addMember')}${selectedOrg ? ` · ${selectedOrg.name}（${selectedOrg.code}）` : ''}`}
        okText={t('adminOrg.addMember')}
        cancelText={t('approval.cancel')}
        confirmLoading={addingMember}
        okButtonProps={{
          disabled: newMember.user_id === null || !newMember.position.trim(),
        }}
        onCancel={() => {
          // 关闭弹窗时取消尚未触发的防抖搜索
          if (memberSearchTimerRef.current) clearTimeout(memberSearchTimerRef.current)
          setAddModalOpen(false)
        }}
        onOk={() => void addMember()}
        destroyOnHidden
      >
        <Form layout="vertical" style={{ marginTop: 12 }}>
          {/* 输入学号/工号或姓名，停止输入 1 秒后自动搜索；下拉首屏 5 条，可滚动查看更多 */}
          <Form.Item
            label={t('adminOrg.colUserId')}
            extra={t('adminOrg.userSearchHint')}
          >
            <Select
              showSearch
              allowClear
              style={{ width: '100%' }}
              placeholder={t('adminOrg.userSearchPlaceholder')}
              loading={memberSearching}
              value={newMember.user_id ?? undefined}
              filterOption={false}
              onSearch={handleMemberSearch}
              onChange={(v: number | undefined) =>
                setNewMember((s) => ({ ...s, user_id: v ?? null }))
              }
              notFoundContent={
                memberSearching ? <Spin size="small" /> : t('adminOrg.userSearchEmpty')
              }
              listHeight={MEMBER_SEARCH_LIST_HEIGHT}
              options={memberOptions.map((u) => ({
                value: u.uid,
                label: u.name ? `${u.name}（${u.uid}）` : String(u.uid),
              }))}
            />
          </Form.Item>
          <Form.Item label={t('adminOrg.colPosition')}>
            <UsablePositionSelect organizationId={selectedId} key={selectedId}
              style={{ width: '100%' }}
              placeholder={t('adminOrg.positionPlaceholder')}
              value={newMember.position}
              onChange={(v: string) => setNewMember((s) => ({ ...s, position: v ?? '' }))}
              allowClear
            />
          </Form.Item>
          <Form.Item label={t('adminOrg.colWorkplace')}>
            <Input
              placeholder={t('adminOrg.workplacePlaceholder')}
              value={newMember.workplace}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setNewMember((s) => ({ ...s, workplace: e.target.value }))
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗（复用管理端「用户与账户」的重置逻辑）：留空则由后端生成随机密码 */}
      {showResetPassword && (
        <>
          <Modal
            open={resetUid !== null}
            // 标题写明操作对象：如「重置密码：李同学（123456789）」，避免只显示学号
            title={resetUid !== null ? t('adminUsers.resetTarget', { target: resetTargetLabel }) : ''}
            width={420}
            okText={t('adminUsers.resetPassword')}
            cancelText={t('approval.cancel')}
            confirmLoading={resetRunning}
            onCancel={() => setResetUid(null)}
            onOk={() => void doResetPassword()}
            destroyOnHidden
          >
            <Form form={resetPwdForm} layout="vertical">
              <Form.Item
                name="password"
                label={t('adminUsers.newPassword')}
                extra={t('adminUsers.passwordHint')}
              >
                <Input.Password maxLength={64} placeholder={t('adminUsers.passwordHint')} />
              </Form.Item>
            </Form>
          </Modal>

          {/* 重置成功后的明文密码回显：关闭后不可再次查看，需提醒管理员及时告知成员 */}
          <Modal
            open={resetResult !== null}
            title={t('adminUsers.resetDoneTitle')}
            footer={null}
            onCancel={() => setResetResult(null)}
          >
            <Alert
              type="warning"
              showIcon
              title={t('adminUsers.resetDoneHint')}
              style={{ marginBottom: 12 }}
            />
            <Input.TextArea
              readOnly
              rows={2}
              value={resetResult ? `${t('adminUsers.newPassword')}: ${resetResult}` : ''}
            />
          </Modal>
        </>
      )}
      {/* 导出范围：仅当前组织 / 包含下级组织 */}
      {exportMemberInfo && (
        <ExportScopeModal
          open={exportScopeOpen}
          loading={exportingMembers}
          hasChildren={hasChildOrgs}
          onCancel={() => setExportScopeOpen(false)}
          onExport={(includeChildren) => void runExportMembers(includeChildren)}
        />
      )}
    </div>
  )
}
