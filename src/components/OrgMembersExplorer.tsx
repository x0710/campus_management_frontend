import { isEntryActionTarget } from '../utils/entryInteraction'
import { useRequestSequence } from '../composables/useRequestSequence'
import { firstMatchingInBatches } from '../utils/firstMatchingInBatches'
/**
 * 组织成员浏览器（可复用组件，代码要求 1）：
 * 左侧「组织树（可搜索）」+ 右侧「成员表（支持翻页/跳页/总数）」，
 * 双击成员行或「详情」按钮跳转到成员详情页（成绩/请假/违规信息，代码要求 14）。
 *
 * 由领导端「组织概览」抽出，老师端「班级管理」复用同一套界面：
 * - 领导端传入全部组织（listAllOrganizations）；
 * - 老师端传入本人所在组织（listUserOrganizations），接口与数据范围都不变；
 * - 党委学院端「学院支部管理」传入本学院子树并保留组织树；
 * - 党委支部端「支部管理」传 showOrgTree=false（支部为最底层组织，无需树），仅展示成员表。
 *
 * 成员 ID 搜索（各门户通用，逻辑见 composables/useMemberSearch）：输入用户 ID 后经
 * GET /api/organization-members?uids= 定位其所属组织 → 展开组织树到该组织并选中
 * （无组织树时固定选中唯一组织）→ 高亮该成员所在行；目标不在第 1 页时自动跳到其所在页。
 *
 * 搜索定位与状态记忆：
 * - 命中组织节点在组织树中自动滚动到可视区中部（等展开动画结束后定位，树很长也能直接看到）；
 * - 搜索状态按模块 key 保存在会话 store，双击成员进入详情再返回后继续展示上一次的模糊匹配结果、
 *   当前定位下标与命中页；
 * - 表头提供「结束匹配」按钮，可清空搜索词 / 高亮 / 匹配结果与树定位展开，恢复普通组织浏览。
 *
 * 组织数据由父组件加载后传入（不同门户数据范围不同），本组件只负责组织树渲染、
 * 成员分页查询与跳转；成员查询走会话缓存，刷新传 force=true 绕过缓存（代码要求 5）。
 *
 * 成员表按 user_id 合并（groupOrganizationMembers）：同一成员在当前组织有多个职位时
 * 只展示一行，职位 / 工作地点并列展示全部取值，避免列表出现两个仅职位不同的相同人员。
 *
 * 支部管理（partyScoreColumns=true）额外支持：
 * - 职位筛选：点击「职位」表头弹出当前组织全量成员中出现的全部职位，可多选筛选；
 * - 分数排序：点击「先锋等级」表头切换正序 / 倒序（0 分按 0 参与排序）。
 * 为支持跨页筛选与排序，支部管理一次加载当前组织全部分页成员，在前端完成筛选、排序与分页。
 */
import {
  CloseOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Alert, Button, Input, Space, Spin, Table, Tag, Tooltip, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { TreeProps } from 'antd/es/tree'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { extractErrorReason } from '../api/common'
import { queryOrgMembers } from '../api/organizations'
import {
  getPartyScoreOrganizationAverage,
  getPartyScoreTotals,
} from '../api/partyScores'
import type { OrganizationMember } from '../api/types/organizations'
import { findMemberPage, useMemberSearch } from '../composables/useMemberSearch'
import { usePositionLabel } from '../composables/usePositionLabel'
import { useUserNames } from '../composables/useUserNames'
import { LEADER_ORG_MEMBER_PAGE_SIZE } from '../config/leaderOrg'
import { useT } from '../i18n'
import { useAuthStore } from '../store/auth'
import { useUiStateStore } from '../store/uiState'
import { formatPartyScoreTotal, formatPartyScoreTotalDecimal } from '../utils/partyScore'
import { groupOrganizationMembers, type UserMemberRow } from '../utils/userOrganization'
import ErrorState from './ErrorState'
import MatchedMembersTable from './MatchedMembersTable'
import MemberSearchModeToggle from './MemberSearchModeToggle'
import MemberSearchNav from './MemberSearchNav'
import MultiSelectHeaderFilter from './MultiSelectHeaderFilter'
import PersonSearchBox from './PersonSearchBox'

/** 组织树节点所需的最小组织信息（领导端传 OrganizationInfo，老师端传本人任职组织） */
export interface OrgNode {
  /** 组织 ID（必填） */
  id: number
  /** 组织名称（必填） */
  name: string
  /** 组织编码（可选，展示用；为空或与名称相同时不重复展示） */
  code?: string
  /** 上级组织 ID（可选，缺省视为根节点） */
  parent_id?: number | null
}

interface OrgMembersExplorerProps {
  /** 待展示的组织列表（必填，由父组件按各自数据范围加载） */
  orgs: OrgNode[]
  /** 组织是否加载中（必填） */
  orgsLoading: boolean
  /** 组织加载失败文案（必填，null 表示无错误；文案已含状态码与中文原因） */
  orgsError: string | null
  /** 重新加载组织（必填；force=true 绕过会话缓存） */
  onReloadOrgs: (force?: boolean) => void
  /** 侧栏高亮与详情页返回目标使用的模块 key（必填，如 'leader_m3'、'teacher_m3'） */
  fromModuleKey: string
  /** 成员表每页条数（可选，默认 LEADER_ORG_MEMBER_PAGE_SIZE = 100） */
  memberPageSize?: number
  /** 组织加载完成后是否自动选中第一个组织（可选，默认 false） */
  autoSelectFirst?: boolean
  /**
   * 自动选中时是否跳过没有直属成员的组织（可选，默认 false）。
   * 开启后按组织树顺序探测成员总数，选中第一个有成员的组织；
   * 学院根节点通常只有少量直属成员，避免进入页面后成员表近乎为空。
   * 仅当 autoSelectFirst 为 true 时生效。
   */
  autoSelectFirstWithMembers?: boolean
  /**
   * 是否展示左侧组织树（可选，默认 true）。
   * 置为 false 时隐藏组织树与组织切换，仅展示唯一组织（orgs[0]）的成员表，
   * 适用于「支部」等最底层组织（无下级组织，无需树形切换）。
   */
  showOrgTree?: boolean
  /**
   * 支部端「支部管理」成员列模式。
   * 开启后移除「工作地点」，新增「先锋等级」列（保留「职位」列）
   * （支部端「支部管理」、学院端「学院支部管理」均开启）
   * （通过 GET /api/party/scores 批量查询成员党建加分）。
   */
  partyScoreColumns?: boolean
  /**
   * 跨页跳转定位的目标组织 ID（可选，默认 null）。
   * 从工作台点击组织成绩排名后跳转本页时传入：组织树挂载后滚动到该节点
   * （与成员搜索命中的滚动定位一致）；用户再点选其他组织后不再滚动。
   */
  focusOrgId?: number | null
}

export default function OrgMembersExplorer({
  orgs,
  orgsLoading,
  orgsError,
  onReloadOrgs,
  fromModuleKey,
  memberPageSize = LEADER_ORG_MEMBER_PAGE_SIZE,
  autoSelectFirst = false,
  autoSelectFirstWithMembers = false,
  showOrgTree = true,
  partyScoreColumns = false,
  focusOrgId = null,
}: OrgMembersExplorerProps) {
  const t = useT()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()

  const [orgSearch, setOrgSearch] = useState('')
  const selectedId = useUiStateStore((s) => s.selectedOrgIds[fromModuleKey] ?? null)
  const setSelectedId = useUiStateStore((s) => s.setSelectedOrgId)
  // 左侧组织树的收起状态（按模块 key 记忆，跨路由返回仍保持）
  const treeCollapsed = useUiStateStore((s) => s.collapsedOrgTrees[fromModuleKey] ?? false)
  const setTreeCollapsed = useUiStateStore((s) => s.setOrgTreeCollapsed)
  // 已展开的树节点（按模块 key 记忆，切走再回来仍保持刚刚查看的展开状态）
  const storedExpandedKeys = useUiStateStore((s) => s.expandedOrgTreeKeys[fromModuleKey])
  const setOrgTreeExpanded = useUiStateStore((s) => s.setOrgTreeExpanded)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  // 成员表页码按模块 key 记忆：进入成员详情再返回时仍停留在搜索命中的那一页
  const memberPage = useUiStateStore((s) => s.memberPages[fromModuleKey] ?? 1)
  const setMemberPage = useUiStateStore((s) => s.setMemberPage)
  // 首次加载组织时沿用上次页码（返回后恢复命中页）；之后切换组织默认回到第 1 页
  const initialMemberPageRef = useRef(memberPage)
  const firstOrgLoadRef = useRef(true)
  const [memberTotal, setMemberTotal] = useState(0)
  /** 支部管理「先锋等级」列：uid → 党建加分总计（无记录按 0 分处理） */
  const [partyScores, setPartyScores] = useState<Map<number, string>>(new Map())
  const [partyScoresLoading, setPartyScoresLoading] = useState(false)
  /** 支部管理：职位筛选选中的职位编码（空数组表示不过滤） */
  const [positionFilter, setPositionFilter] = useState<string[]>([])
  /** 支部管理：先锋指数排序方向（null 表示不排序） */
  const [scoreSort, setScoreSort] = useState<'ascend' | 'descend' | null>(null)
  /** 当前组织平均成绩（后端 DecimalText；仅支部管理模式展示） */
  const [orgAverageScore, setOrgAverageScore] = useState<string | null>(null)
  const [orgAverageLoading, setOrgAverageLoading] = useState(false)

  /** 加载指定组织的成员（force=true 绕过会话缓存） */
  const memberRequests = useRequestSequence()
  const loadMembers = useCallback(
    async (orgId: number, page: number, force?: boolean) => {
      const isCurrent = memberRequests.begin()
      setMembersLoading(true)
      setMembersError(null)
      try {
        if (partyScoreColumns) {
          // 支部管理：职位筛选与分数排序需要覆盖全量成员，故一次性取完该组织全部分页
          const all: OrganizationMember[] = []
          for (let current = 1; ; current += 1) {
            const res = await queryOrgMembers(
              orgId,
              { page: current, page_size: memberPageSize },
              force,
            )
            if (!isCurrent()) return
            all.push(...res.data)
            // 已到末页（total_pages 不含 0）或不足一页时结束
            if (current >= res.total_pages || res.data.length < memberPageSize) break
          }
          setMembers(all)
          setMemberTotal(all.length)
          return
        }
        const res = await queryOrgMembers(orgId, { page, page_size: memberPageSize }, force)
        if (!isCurrent()) return
        setMembers(res.data)
        setMemberTotal(res.total)
      } catch (err) {
        // 401 由 http 拦截器统一处理登录态，此处不重复提示
        if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
          setMembersError(extractErrorReason(err, t))
        }
      } finally {
        if (isCurrent()) setMembersLoading(false)
      }
    },
    [memberPageSize, partyScoreColumns, t, memberRequests],
  )

  // 实际查询成员的组织：
  // 展示组织树时取用户在树中选中的组织；不展示组织树时固定为唯一组织（orgs[0]）
  const activeOrgId = showOrgTree ? selectedId : (orgs[0]?.id ?? null)

  // 保留组织列表顺序，最多同时探测 4 个组织；找到成员后停止后续批次。
  // 使用成员读取接口，兼容树中部分组织仅可见但没有成员读取权限的情况。
  useEffect(() => {
    if (!showOrgTree) return
    if (!autoSelectFirst || selectedId !== null || orgs.length === 0) return
    if (!autoSelectFirstWithMembers) {
      setSelectedId(fromModuleKey, orgs[0].id)
      return
    }

    let cancelled = false
    const token = useAuthStore.getState().token
    const isCancelled = () => cancelled || token !== useAuthStore.getState().token
    void (async () => {
      const first = await firstMatchingInBatches(orgs, async (org) => {
        try {
          const res = await queryOrgMembers(org.id, { page: 1, page_size: memberPageSize })
          return res.total > 0
        } catch {
          return false
        }
      }, 4, isCancelled)
      if (!isCancelled()) setSelectedId(fromModuleKey, first?.id ?? orgs[0].id)
    })()

    return () => {
      cancelled = true
    }
  }, [
    showOrgTree,
    autoSelectFirst,
    autoSelectFirstWithMembers,
    orgs,
    selectedId,
    fromModuleKey,
    memberPageSize,
    setSelectedId,
  ])

  // 成员表展示行：同一成员在当前组织有多个职位时合并为一行（避免出现两个一样的人）
  const memberRows = useMemo(() => groupOrganizationMembers(members), [members])
  const allMemberIds = useMemo(() => memberRows.map((m) => m.user_id), [memberRows])
  // 职位编码 → 职位名称（成员接口只返回编码，展示时映射为名称，管理员附带编号）
  const positionLabel = usePositionLabel()

  /** 职位筛选可选项：当前组织全量成员中实际出现的职位（支持多选） */
  const positionOptions = useMemo(() => {
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
   * 职位筛选 + 分数排序后的全量成员行。
   * 支部管理一次加载全量成员，在前端完成筛选 / 排序，再按分页切片展示。
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

  // 表格分页总数：支部管理取筛选后的行数，其余模式沿用接口总数
  const displayTotal = partyScoreColumns ? filteredRows.length : memberTotal

  // 当前页展示行：支部管理由前端切片；其余模式接口已按页返回
  const visibleRows = useMemo(() => {
    if (!partyScoreColumns) return memberRows
    const start = (memberPage - 1) * memberPageSize
    return filteredRows.slice(start, start + memberPageSize)
  }, [partyScoreColumns, memberRows, filteredRows, memberPage, memberPageSize])

  // 当前页用户 ID：姓名仅需解析当前展示页，避免全量成员超过接口单页上限时部分姓名无法解析
  const visibleMemberIds = useMemo(
    () => visibleRows.map((m) => m.user_id),
    [visibleRows],
  )

  /** 前端分页下定位成员所在页（供搜索命中后跳转到目标页） */
  const resolveMemberPage = useCallback(
    async (orgId: number, uid: number) => {
      // 目标组织与当前组织不同：前端列表尚不包含该组织成员，退回服务端分页扫描
      if (orgId !== activeOrgId) return findMemberPage(orgId, uid, memberPageSize)
      const index = memberRows.findIndex((row) => row.user_id === uid)
      return index === -1 ? null : Math.floor(index / memberPageSize) + 1
    },
    [activeOrgId, memberRows, memberPageSize],
  )

  // 切换组织时清空职位筛选与排序：不同组织的职位集合不同
  useEffect(() => {
    setPositionFilter([])
    setScoreSort(null)
  }, [activeOrgId])

  // 当前组织平均成绩：随组织切换重新查询（仅支部管理 / 学院支部管理模式展示）
  useEffect(() => {
    if (!partyScoreColumns || activeOrgId === null) {
      setOrgAverageScore(null)
      setOrgAverageLoading(false)
      return
    }
    let cancelled = false
    setOrgAverageLoading(true)
    getPartyScoreOrganizationAverage({ organization_id: activeOrgId, recursive: true })
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
  }, [activeOrgId, partyScoreColumns])

  // 筛选后总页数变少时把页码收敛到末页，避免停留在空白页（加载中不收敛，避免覆盖搜索目标页）
  useEffect(() => {
    if (!partyScoreColumns || membersLoading) return
    const maxPage = Math.max(1, Math.ceil(displayTotal / memberPageSize))
    if (memberPage > maxPage) setMemberPage(fromModuleKey, maxPage)
  }, [
    partyScoreColumns,
    membersLoading,
    displayTotal,
    memberPage,
    memberPageSize,
    fromModuleKey,
    setMemberPage,
  ])

  // 成员 ID 搜索：定位所属组织 → 展开并选中该组织 → 高亮命中成员行（逻辑见 useMemberSearch）
  const search = useMemberSearch({
    orgs,
    memberPageSize,
    activeOrgId,
    onSelectOrg: (orgId: number) => setSelectedId(fromModuleKey, orgId),
    onClearFilter: () => setOrgSearch(''),
    onLoadPage: (orgId: number, page: number) => {
      setMemberPage(fromModuleKey, page)
      void loadMembers(orgId, page)
    },
    memberRows: visibleRows,
    // 支部管理在前端过滤 / 排序 / 分页，搜索命中后按当前行序计算目标页
    resolveMemberPage: partyScoreColumns ? resolveMemberPage : undefined,
    // 搜索状态按模块 key 记忆：进入成员详情再返回后继续展示上一次的模糊匹配结果
    persistKey: fromModuleKey,
  })

  // 组织树默认只展开根节点（进入页面不全量展开，避免树过长铺满；深层分支点击再展开）
  const rootKeys = useMemo<React.Key[]>(
    () => orgs.filter((o) => (o.parent_id ?? null) === null).map((o) => o.id),
    [orgs],
  )
  // 展开节点：搜索命中时展开到目标组织链；否则用上次手动展开的节点（跨路由保留）；再否则只展开根节点
  const expandedKeys = useMemo<React.Key[]>(
    () => search.focusKeys ?? storedExpandedKeys ?? rootKeys,
    [search.focusKeys, storedExpandedKeys, rootKeys],
  )
  // 解构出稳定引用（useCallback），避免把每次渲染都新建的 search 对象放进 effect 依赖
  const { consumePendingPage } = search

  // 切换组织后加载成员：默认回到第 1 页；搜索命中按目标页；首次进入沿用上次页码（跨路由返回恢复）
  useEffect(() => {
    if (activeOrgId === null) {
      memberRequests.invalidate()
      setMembersLoading(false)
      setMembers([])
      setMemberTotal(0)
      return
    }
    const pending = consumePendingPage()
    const targetPage = pending ?? (firstOrgLoadRef.current ? initialMemberPageRef.current : 1)
    firstOrgLoadRef.current = false
    setMemberPage(fromModuleKey, targetPage)
    void loadMembers(activeOrgId, targetPage)
    return () => memberRequests.invalidate()
  }, [
    activeOrgId,
    memberRequests,
    loadMembers,
    consumePendingPage,
    fromModuleKey,
    setMemberPage,
  ])

  // parent_id -> children 建树；搜索关键词仅前端过滤名称/编码，并保留匹配节点的祖先链
  const treeData = useMemo<TreeProps['treeData']>(() => {
    const kw = orgSearch.trim().toLowerCase()
    const filtered = kw
      ? orgs.filter(
          (o) =>
            o.name.toLowerCase().includes(kw) ||
            (o.code ?? '').toLowerCase().includes(kw),
        )
      : orgs
    const visible = new Set<number>()
    for (const o of filtered) {
      let cur: OrgNode | undefined = o
      while (cur) {
        visible.add(cur.id)
        cur = cur.parent_id != null ? orgs.find((x) => x.id === cur!.parent_id) : undefined
      }
    }
    const byParent = new Map<number | null, OrgNode[]>()
    for (const o of orgs) {
      if (kw && !visible.has(o.id)) continue
      const key = o.parent_id ?? null
      const arr = byParent.get(key)
      if (arr) arr.push(o)
      else byParent.set(key, [o])
    }
    const build = (list?: OrgNode[]): NonNullable<TreeProps['treeData']> =>
      (list ?? []).map((o) => ({
        key: o.id,
        // 名称与编码相同时不重复展示编码，避免「XX（XX）」的冗余
        title: o.code && o.code !== o.name ? `${o.name}（${o.code}）` : o.name,
        children: build(byParent.get(o.id)),
      }))
    return build(byParent.get(null))
  }, [orgs, orgSearch])

  // 搜索定位到成员 / 从工作台跳转定位到组织后，组织树自动滚动到该组织节点（树很长时也能直接看到定位结果）
  useEffect(() => {
    if (!showOrgTree || treeCollapsed || search.matchOnly || selectedId === null) return
    const fromSearch = search.hitUid !== null
    const fromJump = focusOrgId !== null && focusOrgId === selectedId
    if (!fromSearch && !fromJump) return
    // 等组织树完成展开动画并渲染出选中节点后再滚动，避免定位到尚未挂载的节点
    const timer = window.setTimeout(() => {
      document
        .querySelector('.org-tree-card .ant-tree-treenode-selected')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [
    showOrgTree,
    treeCollapsed,
    search.matchOnly,
    search.hitUid,
    search.locateTick,
    focusOrgId,
    selectedId,
    treeData,
  ])

  const selectedOrg = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) ?? null,
    [orgs, activeOrgId],
  )

  // 姓名（真实姓名，GET /users/{id}）解析
  const memberNames = useUserNames(visibleMemberIds)

  // 支部端「支部管理」批量查询成员党建加分，展示先锋等级（需覆盖全量成员以支持分数排序）
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

  /** 双击成员行 → 进入成员详情页（?from 用于侧栏高亮来源模块） */
  const openMember = useCallback(
    (uid: number) => {
      navigate(`/portal/${portalKey}/organization-members/${uid}?from=${fromModuleKey}`)
    },
    [navigate, portalKey, fromModuleKey],
  )

  const memberColumns = useMemo<ColumnsType<UserMemberRow>>(() => {
    if (partyScoreColumns) {
      return [
        { title: t('memberDetail.fieldUid'), dataIndex: 'user_id', key: 'user_id', width: 90 },
        {
          title: t('profile.name'),
          key: 'user_name',
          width: 160,
          render: (_, record) =>
            memberNames.has(record.user_id)
              ? (memberNames.get(record.user_id) ?? '—')
              : t('common.loading'),
        },
        {
          // 点击「职位」表头弹出当前组织的全部职位，可多选筛选
          title: (
            <MultiSelectHeaderFilter
              title={t('branch.colPosition')}
              allLabel={t('common.all')}
              options={positionOptions}
              value={positionFilter}
              onChange={(next) => {
                setPositionFilter(next)
                setMemberPage(fromModuleKey, 1)
              }}
            />
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
        {
          title: t('branch.colPioneerLevel'),
          key: 'pioneer_level',
          width: 140,
          // 点击表头切换正序 / 倒序（实际排序在前端完成，见 filteredRows）
          sorter: true,
          sortOrder: scoreSort,
          render: (_, record) => {
            if (partyScoresLoading) return t('common.loading')
            const score = partyScores.get(record.user_id) ?? '0'
            return <Tag color="green">{formatPartyScoreTotal(score)}</Tag>
          },
        },
        {
          title: t('approval.colAction'),
          key: 'action',
          width: 120,
          render: (_, record) => (
            <Tooltip title={t('memberDetail.viewDetailHint')}>
              <Button type="link" size="small" onClick={() => openMember(record.user_id)}>
                {t('memberDetail.detail')}
              </Button>
            </Tooltip>
          ),
        },
      ]
    }

    return [
      { title: t('memberDetail.fieldUid'), dataIndex: 'user_id', key: 'user_id', width: 90 },
      {
        title: t('profile.name'),
        key: 'user_name',
        width: 160,
        render: (_, record) =>
          memberNames.has(record.user_id)
            ? (memberNames.get(record.user_id) ?? '—')
            : t('common.loading'),
      },
      {
        title: t('adminOrg.colPosition'),
        key: 'position',
        width: 200,
        // 同一组织多个职位：职位栏并列展示全部职位（名称缺失时显示未知）
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
      {
        title: t('adminOrg.colWorkplace'),
        key: 'workplace',
        render: (_, record) =>
          record.workplaces.length > 0 ? record.workplaces.join('、') : '—',
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 120,
        render: (_, record) => (
          <Tooltip title={t('memberDetail.viewDetailHint')}>
            <Button type="link" size="small" onClick={() => openMember(record.user_id)}>
              {t('memberDetail.detail')}
            </Button>
          </Tooltip>
        ),
      },
    ]
  }, [
    t,
    memberNames,
    positionLabel,
    openMember,
    partyScoreColumns,
    partyScores,
    partyScoresLoading,
    positionOptions,
    positionFilter,
    scoreSort,
    fromModuleKey,
    setMemberPage,
  ])

  return (
    <div className={`admin-org-view${showOrgTree && treeCollapsed ? ' is-tree-collapsed' : ''}`}>
      {showOrgTree && (
      <section className="panel-card org-tree-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('memberDetail.orgTreeTitle')}</h3>
          <Tooltip title={t('memberDetail.refreshOrgsHint')}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => onReloadOrgs(true)}
            />
          </Tooltip>
        </header>
        <div className="panel-card-body">
          {orgsError ? (
            <ErrorState message={orgsError} onRetry={() => onReloadOrgs(true)} />
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
                {!orgsLoading && orgs.length === 0 ? (
                  <Alert type="info" showIcon title={t('orgExplorer.emptyOrgs')} />
                ) : (
                  <Tree
                    key={(treeData?.length ?? 0) > 0 ? 'tree-loaded' : 'tree-empty'}
                    treeData={treeData}
                    expandedKeys={expandedKeys}
                    onExpand={(keys: React.Key[]) => {
                      search.setFocusKeys(keys)
                      setOrgTreeExpanded(fromModuleKey, keys.map((k) => Number(k)))
                    }}
                    selectedKeys={selectedId !== null ? [selectedId] : []}
                    onSelect={(keys: React.Key[]) => {
                      // 在「单独查看匹配人员」模式下点击组织树，视为想浏览该组织：自动切回组织内查看
                      // （false：不要按当前命中人员重新定位，否则会覆盖用户刚选中的组织）
                      if (search.matchOnly) search.toggleMatchOnly(false)
                      setSelectedId(fromModuleKey, keys.length ? Number(keys[0]) : null)
                    }}
                    showLine
                    blockNode
                  />
                )}
              </Spin>
            </>
          )}
        </div>
      </section>
      )}

      <section className="panel-card org-members-card">
        <header className="panel-card-header">
          <div className="org-members-title">
            {/* 左侧组织树收起/展开（无组织树时不展示） */}
            {showOrgTree && (
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
                  onClick={() => setTreeCollapsed(fromModuleKey, !treeCollapsed)}
                />
              </Tooltip>
            )}
            <h3 className="panel-card-title">
              {search.matchOnly
                ? t('orgExplorer.matchOnlyTitle')
                : selectedOrg
                  ? selectedOrg.code && selectedOrg.code !== selectedOrg.name
                    ? `${selectedOrg.name}（${selectedOrg.code}）`
                    : selectedOrg.name
                  : t('memberDetail.memberListTitle')}
            </h3>
            {/* 当前组织的平均成绩（含下级组织） */}
            {partyScoreColumns && activeOrgId !== null && !search.matchOnly && (
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
          <div className="org-members-actions">
            <PersonSearchBox
              width={300}
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
                <Button
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={search.clear}
                >
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
            {selectedOrg && !search.matchOnly && (
              <Tooltip title={t('memberDetail.refreshMembersHint')}>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => void loadMembers(selectedOrg.id, memberPage, true)}
                />
              </Tooltip>
            )}
          </div>
        </header>
        <div className="panel-card-body">
          {/* 单独查看匹配人员：只展示匹配出来的用户，不再依赖当前组织 */}
          {search.matchOnly ? (
            <MatchedMembersTable
              rows={search.matches}
              hitUid={search.hitUid}
              loading={search.searching || search.matchesLoading}
              onOpenMember={openMember}
            />
          ) : /* 组织树隐藏（showOrgTree=false）或已收起（treeCollapsed）时，组织加载错误不会在
                左侧树卡片中展示，需在成员卡片体兜底提示，避免报错被静默吞掉（代码要求 3） */
          orgsError && (!showOrgTree || treeCollapsed) ? (
            <ErrorState message={orgsError} onRetry={() => onReloadOrgs(true)} />
          ) : !orgsLoading && orgs.length === 0 ? (
            <Alert type="info" showIcon title={t('orgExplorer.emptyOrgs')} />
          ) : !selectedOrg ? (
            <Alert type="info" showIcon title={t('adminOrg.selectHint')} />
          ) : membersError ? (
            <ErrorState
              message={membersError}
              onRetry={() => void loadMembers(selectedOrg.id, memberPage, true)}
            />
          ) : (
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
              scroll={{ x: 860 }}
              onRow={(record: UserMemberRow) => ({
                onDoubleClick: (e: React.MouseEvent) => {
                  if (isEntryActionTarget(e.target)) return
                  // 点击按钮/链接时不触发行点击
                  const target = e.target as HTMLElement
                  if (target.closest('button')) return
                  openMember(record.user_id)
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
                    setMemberPage(fromModuleKey, 1)
                    return
                  }
                  // 仅翻页：前端已加载全量数据，直接切换页码
                  if (nextPage !== memberPage) setMemberPage(fromModuleKey, nextPage)
                  return
                }
                // 服务端分页模式：翻页时重新请求该页
                if (nextPage !== memberPage) {
                  setMemberPage(fromModuleKey, nextPage)
                  void loadMembers(selectedOrg.id, nextPage)
                }
              }}
              pagination={{
                current: memberPage,
                pageSize: memberPageSize,
                total: displayTotal,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
              }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
