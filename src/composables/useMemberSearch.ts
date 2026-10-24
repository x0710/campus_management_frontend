/**
 * 组织成员「按学号 / 姓名搜索」通用逻辑（代码要求 1：各门户的组织成员页面复用同一套实现）。
 *
 * 学号 / 姓名解析：
 *   - 纯数字 → 视为学号（用户 ID），直接取该用户任职组织；
 *   - 其他 → 视为姓名，GET /api/users?keyword= 分页查候选用户，
 *     再筛出「任职组织落在当前展示组织范围内」的命中项；匹配总数取后端 total
 *     （不受单页 page_size 限制），后续候选页在点击「下一个」时按需懒加载。
 *
 * 定位流程（命中项之间可切换，见 showPrev / showNext）：
 *   1. GET /api/organization-members?uids={uid} 取该用户全部任职组织；
 *   2. 取第一个落在当前展示组织范围内的组织作为目标组织（有组织树 / 单组织两种模式通用）；
 *   3. 展开组织树到目标组织的祖先链并选中该组织（由宿主的 onSelectOrg / onClearFilter 回调落库）；
 *   4. 目标不在第 1 页时按页扫描出其所在页并跳转（走会话缓存，扫描上限 MEMBER_SEARCH_MAX_PAGES）；
 *   5. 通过 hitUid 让宿主把该成员所在行高亮（夜间配色见 index.css 的 .org-member-row-hit）；
 *   6. 目标行渲染出来后自动滚动到可视区中部（宿主传入 memberRows，避免用户再手动翻找）。
 *
 * 姓名模糊匹配常命中多人（如搜「王」，后端 total 可能上百）：返回 resultTotal / matches /
 * matchIndex / hasPrev / hasNext，由宿主的搜索框旁结果条展示「共匹配 N 人 · 第 X 人」并提供
 * 上一个 / 下一个按钮——不使用弹窗，定位时仍能同时查看当前组织的其他成员。
 *
 * 宿主在「切换组织」的 effect 中应调用 consumePendingPage() 取待跳转页（缺省为 1），
 * 使「搜索命中 → 切换组织 → 按目标页加载」不会与「切换组织回到第 1 页」抢着发请求。
 */
import { App as AntdApp } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useRef, useState, type Key } from 'react'
import { listUserOrganizations, queryOrgMembers } from '../api/organizations'
import type { UserOrganization } from '../api/types/organizations'
import { queryUsers } from '../api/users'
import { MEMBER_NAME_SEARCH_LIMIT, MEMBER_SEARCH_MAX_PAGES } from '../config/organization'
import { useT } from '../i18n'
import { isUidTerm } from '../utils/personSearch'
import { useErrorFeedback } from './useErrorFeedback'

/** 搜索所需的组织最小信息（OrganizationInfo / OrgNode / 任职组织均可直接传入） */
export interface MemberSearchOrg {
  /** 组织 ID（必填） */
  id: number
  /** 上级组织 ID（可选，缺省视为根节点） */
  parent_id?: number | null
}

/** 姓名 / 学号搜索命中的单个成员（结果条与定位共用） */
export interface MemberSearchHit {
  /** 用户 ID */
  uid: number
  /** 用户姓名（学号搜索时无从得知，为 null） */
  name: string | null
  /** 目标组织 ID（该用户在当前展示范围内的第一个任职组织） */
  targetId: number
  /** 目标组织名称 */
  orgName: string
}

/** 姓名搜索单页解析结果 */
interface NamePageResult {
  /** 后端匹配总数（不受 page_size 限制，用于结果条展示） */
  total: number
  /** 后端总页数 */
  pages: number
  /** 本页中落在当前组织范围内的命中项 */
  hits: MemberSearchHit[]
}

interface UseMemberSearchOptions {
  /** 当前展示的组织列表（必填） */
  orgs: MemberSearchOrg[]
  /** 成员表每页条数（必填，与宿主成员表一致，用于计算目标页） */
  memberPageSize: number
  /** 当前激活组织 ID（必填；null 表示未选中任何组织） */
  activeOrgId: number | null
  /** 选中组织（必填；由宿主写入自己的选中态） */
  onSelectOrg: (orgId: number) => void
  /** 目标组织与当前组织相同时按目标页加载成员（必填） */
  onLoadPage: (orgId: number, page: number) => void
  /** 清空组织名称过滤（可选；命中后清空，避免目标组织被过滤掉） */
  onClearFilter?: () => void
  /** 当前成员表已渲染的行（可选；命中行渲染后自动滚动到可视区中部） */
  memberRows?: { user_id: number }[]
}

/** useMemberSearch 返回的搜索状态与操作 */
export interface MemberSearchController {
  /** 搜索框内容 */
  query: string
  setQuery: (value: string) => void
  /** 是否正在搜索 / 定位 / 加载更多候选页 */
  searching: boolean
  /** 命中的成员 UID（宿主用于行高亮；无命中为 null） */
  hitUid: number | null
  /** 命中后需要展开的组织树节点（null 表示默认全展开） */
  focusKeys: Key[] | null
  setFocusKeys: (keys: Key[]) => void
  /** 触发搜索（回车 / 点击搜索；可传入输入框当前值，缺省取 query） */
  run: (value?: string) => void
  /** 读取并清空「命中后待跳转页」（缺省 1） */
  consumePendingPage: () => number
  /** 姓名搜索的匹配总数（后端 total；学号搜索或无搜索结果为 0） */
  resultTotal: number
  /** 目前已解析出的命中项（姓名搜索按候选页顺序懒加载追加） */
  matches: MemberSearchHit[]
  /** 当前定位到的命中项下标（从 0 开始） */
  matchIndex: number
  /** 是否展示结果条（姓名搜索且至少命中一人、总数大于 1） */
  resultVisible: boolean
  /** 是否可以定位到上一个命中项 */
  hasPrev: boolean
  /** 是否可以继续向后定位（含懒加载后续候选页） */
  hasNext: boolean
  /** 定位到上一个命中项 */
  showPrev: () => void
  /** 定位到下一个命中项（当前页已到末尾时自动加载下一页候选） */
  showNext: () => void
}

/**
 * 目标组织在组织树上的祖先链（含自身），用于命中后展开到该节点。
 *
 * @param orgs 当前展示的组织列表（必填；含 parent_id）
 * @param targetId 目标组织 ID（必填）
 * @returns 从目标组织到根的 ID 数组；目标不在列表中时返回空数组
 */
function orgAncestorKeys(orgs: MemberSearchOrg[], targetId: number): number[] {
  const keys: number[] = []
  let cur = orgs.find((o) => o.id === targetId)
  while (cur) {
    keys.push(cur.id)
    const parentId = cur.parent_id
    cur = parentId != null ? orgs.find((x) => x.id === parentId) : undefined
  }
  return keys
}

/**
 * 定位某用户在指定组织成员中所在的页码（按页向后扫描，走会话缓存）。
 *
 * @param orgId 组织 ID（必填）
 * @param uid 目标用户 ID（必填）
 * @param pageSize 每页条数（必填）
 * @returns 命中页码（从 1 开始）；未命中或超出 MEMBER_SEARCH_MAX_PAGES 时返回 null
 */
async function findMemberPage(
  orgId: number,
  uid: number,
  pageSize: number,
): Promise<number | null> {
  for (let page = 1; page <= MEMBER_SEARCH_MAX_PAGES; page += 1) {
    const res = await queryOrgMembers(orgId, { page, page_size: pageSize })
    if (res.data.some((m) => m.user_id === uid)) return page
    // 不足一页说明已到末页，无需继续扫描
    if (res.data.length < pageSize) return null
  }
  return null
}

/**
 * 取某用户在当前展示组织范围内的第一个任职组织。
 * @param uid 用户 ID（必填）
 * @param orgs 当前展示的组织列表（必填）
 * @returns 所属组织；不在范围内时返回 undefined
 */
async function inScopeOrgOf(
  uid: number,
  orgs: MemberSearchOrg[],
): Promise<UserOrganization | undefined> {
  const owned = await listUserOrganizations(uid)
  return owned.find((o) => orgs.some((x) => x.id === o.organization_id))
}

/**
 * 解析姓名搜索的某一页：筛出当前组织范围内的命中项，并带回后端匹配总数。
 *
 * @param keyword 姓名关键词（必填）
 * @param page 候选页（必填，从 1 开始）
 * @param orgs 当前展示的组织列表（必填）
 * @returns 匹配总数 / 总页数 / 本页命中项
 */
async function resolveNamePage(
  keyword: string,
  page: number,
  orgs: MemberSearchOrg[],
): Promise<NamePageResult> {
  const res = await queryUsers({
    keyword,
    page,
    page_size: MEMBER_NAME_SEARCH_LIMIT,
  })
  const hits: MemberSearchHit[] = []
  for (const user of res.data) {
    const targetOrg = await inScopeOrgOf(user.uid, orgs)
    if (targetOrg) {
      hits.push({
        uid: user.uid,
        name: user.name,
        targetId: targetOrg.organization_id,
        orgName: targetOrg.organization_name,
      })
    }
  }
  return {
    total: res.total,
    pages: Math.max(1, res.total_pages),
    hits,
  }
}

/**
 * 组织成员「按学号 / 姓名搜索」控制器。
 *
 * @param options 宿主上下文（必填，见 UseMemberSearchOptions）
 * @returns 搜索状态与操作（query / run / hitUid / focusKeys / resultTotal / showPrev / showNext 等）
 */
export function useMemberSearch({
  orgs,
  memberPageSize,
  activeOrgId,
  onSelectOrg,
  onLoadPage,
  onClearFilter,
  memberRows,
}: UseMemberSearchOptions): MemberSearchController {
  const t = useT()
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()

  const [query, setQuery] = useState('')
  const [hitUid, setHitUid] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [focusKeys, setFocusKeys] = useState<Key[] | null>(null)
  /** 命中后待跳转的目标页，由宿主的组织切换 effect 消费一次 */
  const pendingPageRef = useRef<number | null>(null)

  /** 姓名搜索：后端匹配总数、已解析命中项、当前下标与候选页游标 */
  const [resultTotal, setResultTotal] = useState(0)
  const [matches, setMatches] = useState<MemberSearchHit[]>([])
  const [matchIndex, setMatchIndex] = useState(0)
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidatePages, setCandidatePages] = useState(1)
  /** 当前姓名搜索关键词（懒加载后续候选页时复用） */
  const keywordRef = useRef('')

  /**
   * 定位单个命中项：扫描页码 → 高亮 → 组织相同则直接按目标页加载，
   * 组织不同则清空组织过滤、展开祖先链并选中目标组织（由切换 effect 按待跳转页加载）。
   */
  const locate = useCallback(
    async (hit: MemberSearchHit) => {
      // 目标不在第 1 页时，先扫描出其所在页
      const page = (await findMemberPage(hit.targetId, hit.uid, memberPageSize)) ?? 1
      setHitUid(hit.uid)
      if (hit.targetId === activeOrgId) {
        // 组织未变化（含单组织模式）：直接按目标页加载
        onLoadPage(hit.targetId, page)
      } else {
        // 组织变化：清掉组织名称过滤、展开并选中目标组织，由切换 effect 按目标页加载
        onClearFilter?.()
        setFocusKeys(orgAncestorKeys(orgs, hit.targetId))
        pendingPageRef.current = page
        onSelectOrg(hit.targetId)
      }
    },
    [activeOrgId, memberPageSize, onLoadPage, onClearFilter, orgs, onSelectOrg],
  )

  /** 清空姓名搜索结果条与候选页游标（空搜索 / 学号搜索 / 无命中时复用） */
  const resetNameResult = useCallback(() => {
    keywordRef.current = ''
    setResultTotal(0)
    setMatches([])
    setMatchIndex(0)
    setCandidatePage(1)
    setCandidatePages(1)
  }, [])

  const run = useCallback(
    async (value?: string) => {
      const raw = (value ?? query).trim()
      if (!raw) {
        message.warning(t('orgExplorer.searchMemberEmpty'))
        resetNameResult()
        return
      }
      setSearching(true)
      try {
        // 纯数字视为学号（用户 ID），否则按姓名查询（判定逻辑与用户与账户页共用，见 utils/personSearch）
        if (isUidTerm(raw)) {
          const uid = Number(raw)
          const targetOrg = await inScopeOrgOf(uid, orgs)
          if (!targetOrg) {
            setHitUid(null)
            resetNameResult()
            message.warning(t('orgExplorer.searchMemberNotFound', { uid: String(uid) }))
            return
          }
          const hit: MemberSearchHit = {
            uid,
            name: null,
            targetId: targetOrg.organization_id,
            orgName: targetOrg.organization_name,
          }
          resetNameResult()
          await locate(hit)
          message.success(
            t('orgExplorer.searchMemberHit', {
              uid: String(uid),
              org: targetOrg.organization_name,
            }),
          )
          return
        }

        // 姓名搜索：第一页立即解析；匹配总数取后端 total（不是单页 page_size）
        const first = await resolveNamePage(raw, 1, orgs)
        keywordRef.current = raw
        setResultTotal(first.total)
        setMatches(first.hits)
        setMatchIndex(0)
        setCandidatePage(1)
        setCandidatePages(first.pages)
        if (first.hits.length === 0) {
          setHitUid(null)
          message.warning(t('orgExplorer.searchMemberNameNotFound', { name: raw }))
          return
        }
        await locate(first.hits[0])
        // 仅一人时结果条无意义，沿用 toast 提示；多人时由搜索框旁的结果条展示总数与切换按钮
        if (first.total <= 1) {
          message.success(
            t('orgExplorer.searchMemberHitByName', {
              name: first.hits[0].name ?? raw,
              uid: String(first.hits[0].uid),
              org: first.hits[0].orgName,
            }),
          )
        }
      } catch (err) {
        // 401 由 http 拦截器统一处理登录态，此处不重复提示
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          reportError(err)
        }
      } finally {
        setSearching(false)
      }
    },
    [query, message, t, reportError, orgs, locate, resetNameResult],
  )

  /** 定位到指定下标的命中项（上一个 / 下一个共用） */
  const showAt = useCallback(
    async (index: number) => {
      const target = matches[index]
      if (!target) return
      setMatchIndex(index)
      setSearching(true)
      try {
        await locate(target)
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          reportError(err)
        }
      } finally {
        setSearching(false)
      }
    },
    [matches, locate, reportError],
  )

  /** 当前已解析命中项已到末尾时，按需加载下一页候选（不一次性拉取全部 200+ 人） */
  const loadNextPage = useCallback(async () => {
    const raw = keywordRef.current
    if (!raw || candidatePage >= candidatePages) return
    setSearching(true)
    try {
      const nextPage = candidatePage + 1
      const result = await resolveNamePage(raw, nextPage, orgs)
      setCandidatePage(nextPage)
      // 该页没有落在当前组织范围内的人：只推进候选页游标，继续点「下一个」会翻后续页
      if (result.hits.length === 0) return
      const merged = [...matches, ...result.hits]
      const nextIndex = matches.length
      setMatches(merged)
      setMatchIndex(nextIndex)
      await locate(merged[nextIndex])
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        reportError(err)
      }
    } finally {
      setSearching(false)
    }
  }, [candidatePage, candidatePages, matches, orgs, locate, reportError])

  const showPrev = useCallback(() => {
    if (matchIndex > 0) void showAt(matchIndex - 1)
  }, [matchIndex, showAt])

  const showNext = useCallback(() => {
    if (matchIndex < matches.length - 1) {
      void showAt(matchIndex + 1)
      return
    }
    void loadNextPage()
  }, [matchIndex, matches.length, showAt, loadNextPage])

  const consumePendingPage = useCallback((): number => {
    const page = pendingPageRef.current ?? 1
    pendingPageRef.current = null
    return page
  }, [])

  // 命中行渲染出来后自动滚动到可视区中部：目标成员可能位于长列表底部，
  // 逐行手动滚动成本高，这里等表格行（.org-member-row-hit）真正挂载后再滚。
  useEffect(() => {
    if (hitUid === null) return
    if (!memberRows?.some((row) => row.user_id === hitUid)) return
    const raf = requestAnimationFrame(() => {
      document
        .querySelector('.org-member-row-hit')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [hitUid, memberRows])

  return {
    query,
    setQuery,
    searching,
    hitUid,
    focusKeys,
    setFocusKeys,
    run,
    consumePendingPage,
    resultTotal,
    matches,
    matchIndex,
    resultVisible: matches.length > 0 && resultTotal > 1,
    hasPrev: matchIndex > 0,
    hasNext: matchIndex < matches.length - 1 || candidatePage < candidatePages,
    showPrev,
    showNext,
  }
}
