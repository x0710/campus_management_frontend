import {
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
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
import UsablePositionSelect from '../../components/UsablePositionSelect'
import { getPartyScoreOrganizationAverage, getPartyScoreTotals } from '../../api/partyScores'
import { resetUserPassword } from '../../api/users'
import { extractErrorReason } from '../../api/common'
import ErrorState from '../../components/ErrorState'
import MatchedMembersTable from '../../components/MatchedMembersTable'
import MemberSearchModeToggle from '../../components/MemberSearchModeToggle'
import MemberSearchNav from '../../components/MemberSearchNav'
import MultiSelectHeaderFilter from '../../components/MultiSelectHeaderFilter'
import PersonSearchBox from '../../components/PersonSearchBox'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { findMemberPage, useMemberSearch } from '../../composables/useMemberSearch'
import { usePositionNames } from '../../composables/usePositionNames'
import { useUserNames } from '../../composables/useUserNames'
import { useUserOrganizations } from '../../composables/useUserOrganizations'
import { useT } from '../../i18n'
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
}

/**
 * 管理端：组织架构（组织树 + 组织 CRUD + 成员任职管理，成员详情跳转共用领导端成员详情页）。
 * 搜索成员后组织树自动滚动到命中组织；搜索状态按 uiKey 记忆，进入成员详情再返回后
 * 仍可继续查看上一次的模糊匹配结果与当前定位；表头提供「结束匹配」按钮恢复普通浏览。
 * 党委学校端复用本页时开启 partyScoreColumns（先锋等级列）与 showResetPassword（重置密码操作）。
 * 成员列表按 user_id 合并：同一成员在同一组织有多个职位时只展示一行（职位栏并列展示全部职位），
 * 「所属组织」标签按组织去重；移除成员时会一并删除该成员在该组织的全部职位记录。
 */
export default function OrgAdminView({
  uiKey = 'admin_m3',
  rootOrgId,
  partyScoreColumns = false,
  showResetPassword = false,
}: OrgAdminViewProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
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
      setMembersLoading(true)
      try {
        if (partyScoreColumns) {
          // 党委学校端：职位筛选与分数排序需要覆盖全量成员，循环取完该组织全部分页
          const all: OrganizationMember[] = []
          for (let current = 1; ; current += 1) {
            const res = await queryOrgMembers(
              orgId,
              { page: current, page_size: MEMBER_PAGE_SIZE },
              force,
            )
            all.push(...res.data)
            if (current >= res.total_pages || res.data.length < MEMBER_PAGE_SIZE) break
          }
          setMembers(all)
          setMemberTotal(all.length)
          return
        }
        const res = await queryOrgMembers(
          orgId,
          { page, page_size: MEMBER_PAGE_SIZE },
          force,
        )
        setMembers(res.data)
        setMemberTotal(res.total)
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) reportError(err)
      } finally {
        setMembersLoading(false)
      }
    },
    [partyScoreColumns, reportError],
  )

  // 成员表展示行：同一成员在当前组织有多个职位时合并为一行（避免出现两个一样的人）
  const memberRows = useMemo(() => groupOrganizationMembers(members), [members])
  // 全量成员用户 ID（按展示行去重）→ 先锋等级（排序需覆盖全部成员）
  const allMemberIds = useMemo(() => memberRows.map((m) => m.user_id), [memberRows])
  // 职位编码 → 职位名称（成员接口只返回编码，展示时映射为名称，未命中回退编码）
  const positionNames = usePositionNames()

  /** 党委学校端职位筛选可选项：当前组织全量成员中实际出现的职位 */
  const memberPositionOptions = useMemo(() => {
    const codes = new Set<string>()
    for (const member of members) {
      const code = member.position?.trim()
      if (code) codes.add(code)
    }
    return [...codes]
      .map((code) => ({ value: code, label: positionNames.get(code) ?? code }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
  }, [members, positionNames])

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

  // 表格分页总数：党委学校端取筛选后的行数，其余模式沿用接口总数
  const displayTotal = partyScoreColumns ? filteredRows.length : memberTotal

  // 当前页展示行：党委学校端由前端切片；其余模式接口已按页返回
  const visibleRows = useMemo(() => {
    if (!partyScoreColumns) return memberRows
    const start = (memberPage - 1) * MEMBER_PAGE_SIZE
    return filteredRows.slice(start, start + MEMBER_PAGE_SIZE)
  }, [partyScoreColumns, memberRows, filteredRows, memberPage])

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
    getPartyScoreOrganizationAverage({ organization_id: selectedId, recursive: true })
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
  }, [partyScoreColumns, selectedId])

  // 筛选后总页数变少时把页码收敛到末页（加载中不收敛，避免覆盖搜索目标页）
  useEffect(() => {
    if (!partyScoreColumns || membersLoading) return
    const maxPage = Math.max(1, Math.ceil(displayTotal / MEMBER_PAGE_SIZE))
    if (memberPage > maxPage) setMemberPage(uiKey, maxPage)
  }, [
    partyScoreColumns,
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
    resolveMemberPage: partyScoreColumns ? resolveMemberPage : undefined,
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
      setMembers([])
      setMemberTotal(0)
    }
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

  // 当前成员页内的用户 ID → 姓名 / 任职组织（均走会话缓存，相同 ID 不重复请求）
  const memberNames = useUserNames(visibleMemberIds)
  const memberOrgs = useUserOrganizations(visibleMemberIds)

  // 成员列表「先锋等级」列：批量查询全量成员党建加分总计（排序需覆盖全部成员）
  useEffect(() => {
    if (!partyScoreColumns || allMemberIds.length === 0) {
      setPartyScores(new Map())
      setPartyScoresLoading(false)
      return
    }
    let cancelled = false
    setPartyScoresLoading(true)
    getPartyScoreTotals(allMemberIds)
      .then((items) => {
        if (cancelled) return
        const next = new Map<number, string>(allMemberIds.map((uid) => [uid, '0']))
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
  }, [allMemberIds, partyScoreColumns])

  const onSelectTree: TreeProps['onSelect'] = (keys: React.Key[]) => {
    // 在「单独查看匹配人员」模式下点击组织树，视为想浏览该组织：自动切回组织内查看
    // （false：不要按当前命中人员重新定位，否则会覆盖用户刚选中的组织）
    if (search.matchOnly) search.toggleMatchOnly(false)
    setNewMember((s) => ({ ...s, position: '' }))
    setSelectedId(uiKey, keys.length ? Number(keys[0]) : null)
  }

  // 点击成员行 / 「查看详细」跳转到成员详情页（与领导端「组织概览」共用同一页面，
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
      setAddModalOpen(false)
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
        // 通过 GET /api/users/{id} 解析出的真实姓名
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
                  {o.organization_name}
                </Tag>
              ))}
            </span>
          )
        },
      },
      {
        // 党委学校端：点击「职位」表头弹出当前组织的全部职位，可多选筛选
        title: partyScoreColumns ? (
          <MultiSelectHeaderFilter
            title={t('adminOrg.colPosition')}
            allLabel={t('common.all')}
            options={memberPositionOptions}
            value={positionFilter}
            onChange={(next) => {
              setPositionFilter(next)
              setMemberPage(uiKey, 1)
            }}
          />
        ) : (
          t('adminOrg.colPosition')
        ),
        key: 'position',
        width: 200,
        // 同一组织多个职位：职位栏并列展示全部职位（映射失败时回退编码），悬停展示原始编码
        render: (_, record) =>
          record.positions.length === 0 ? (
            '—'
          ) : (
            <Space wrap size={[8, 4]}>
              {record.positions.map((code) => (
                <Tooltip key={code} title={code}>
                  <Tag color="blue">{positionNames.get(code) ?? code}</Tag>
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
        width: showResetPassword ? 210 : 140,
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
              // 重置密码属高风险操作：先弹二次确认（与「移除成员」一致），确认后再打开密码弹窗
              <Popconfirm
                title={t('adminOrg.memberResetConfirm', {
                  name: memberNames.has(record.user_id)
                    ? `${memberNames.get(record.user_id)}（${record.user_id}）`
                    : `#${record.user_id}`,
                })}
                okText={t('adminUsers.resetPassword')}
                cancelText={t('approval.cancel')}
                onConfirm={() => openResetPassword(record.user_id)}
              >
                <Button type="link" size="small">
                  {t('adminUsers.resetPassword')}
                </Button>
              </Popconfirm>
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
      positionNames,
      selectedId,
      partyScoreColumns,
      openMemberDetail,
      workplaceOrScoreColumn,
      showResetPassword,
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
          <div className="approval-toolbar">
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => openCreate()}
            >
              {t('adminOrg.newOrg')}
            </Button>
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
                  onClick={() => void loadMembers(selectedOrg.id, memberPage, true)}
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
          {/* 成员 ID 搜索（固定在表头内，随卡片表头始终可见，不随表格滚动） */}
          <div className="org-member-actions">
            <PersonSearchBox
              width={320}
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
                  onClick: (e: React.MouseEvent) => {
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
                      setScoreSort(order)
                      setMemberPage(uiKey, 1)
                      return
                    }
                    // 仅翻页：前端已加载全量数据，直接切换页码
                    if (nextPage !== memberPage) setMemberPage(uiKey, nextPage)
                    return
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
                  showTotal: (n: number) =>
                    `${t('common.total')} ${n} ${t('common.items')}`,
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
        title={`${t('adminOrg.addMember')}${selectedOrg ? ` · ${selectedOrg.name}` : ''}`}
        okText={t('adminOrg.addMember')}
        cancelText={t('approval.cancel')}
        confirmLoading={addingMember}
        okButtonProps={{
          disabled: newMember.user_id === null || !newMember.position.trim(),
        }}
        onCancel={() => setAddModalOpen(false)}
        onOk={() => void addMember()}
        forceRender
        destroyOnHidden
      >
        <Form layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label={t('adminOrg.colUserId')}>
            <InputNumber
              style={{ width: '100%' }}
              placeholder={t('adminOrg.userIdPlaceholder')}
              min={1}
              precision={0}
              value={newMember.user_id}
              onChange={(v: number | null) =>
                setNewMember((s) => ({ ...s, user_id: v === null ? null : Number(v) }))
              }
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
    </div>
  )
}
