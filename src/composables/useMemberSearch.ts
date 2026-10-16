/**
 * 组织成员「按 ID 搜索」通用逻辑（代码要求 1：各门户的组织成员页面复用同一套实现）。
 *
 * 流程：
 *   1. GET /api/organization-members?uids={uid} 取该用户全部任职组织；
 *   2. 取第一个落在当前展示组织范围内的组织作为目标组织（有组织树 / 单组织两种模式通用）；
 *   3. 展开组织树到目标组织的祖先链并选中该组织（由宿主的 onSelectOrg / onClearFilter 回调落库）；
 *   4. 目标不在第 1 页时按页扫描出其所在页并跳转（走会话缓存，扫描上限 MEMBER_SEARCH_MAX_PAGES）；
 *   5. 通过 hitUid 让宿主把该成员所在行高亮（夜间配色见 index.css 的 .org-member-row-hit）；
 *   6. 目标行渲染出来后自动滚动到可视区中部（宿主传入 memberRows，避免用户再手动翻找）。
 *
 * 宿主在「切换组织」的 effect 中应调用 consumePendingPage() 取待跳转页（缺省为 1），
 * 使「搜索命中 → 切换组织 → 按目标页加载」不会与「切换组织回到第 1 页」抢着发请求。
 */
import { App as AntdApp } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useRef, useState, type Key } from 'react'
import { extractErrorReason } from '../api/common'
import { listUserOrganizations, queryOrgMembers } from '../api/organizations'
import { MEMBER_SEARCH_MAX_PAGES } from '../config/organization'
import { useT } from '../i18n'

/** 搜索所需的组织最小信息（OrganizationInfo / OrgNode / 任职组织均可直接传入） */
export interface MemberSearchOrg {
  /** 组织 ID（必填） */
  id: number
  /** 上级组织 ID（可选，缺省视为根节点） */
  parent_id?: number | null
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
  /** 是否正在搜索 */
  searching: boolean
  /** 命中的成员 UID（宿主用于行高亮；无命中为 null） */
  hitUid: number | null
  /** 命中后需要展开的组织树节点（null 表示默认全展开） */
  focusKeys: Key[] | null
  setFocusKeys: (keys: Key[]) => void
  /** 触发搜索（回车 / 点击搜索） */
  run: () => void
  /** 读取并清空「命中后待跳转页」（缺省 1） */
  consumePendingPage: () => number
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
 * 组织成员「按 ID 搜索」控制器。
 *
 * @param options 宿主上下文（必填，见 UseMemberSearchOptions）
 * @returns 搜索状态与操作（query / run / hitUid / focusKeys / consumePendingPage 等）
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

  const [query, setQuery] = useState('')
  const [hitUid, setHitUid] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [focusKeys, setFocusKeys] = useState<Key[] | null>(null)
  /** 命中后待跳转的目标页，由宿主的组织切换 effect 消费一次 */
  const pendingPageRef = useRef<number | null>(null)

  const run = useCallback(async () => {
    const uid = Number(query.trim())
    if (!Number.isInteger(uid) || uid <= 0) {
      message.warning(t('orgExplorer.searchMemberInvalidId'))
      return
    }
    setSearching(true)
    try {
      // 该用户的全部任职组织（GET /api/organization-members?uids=）
      const owned = await listUserOrganizations(uid)
      // 取第一个落在当前展示组织范围内的组织（组织树 / 单组织两种模式通用）
      const targetOrg = owned.find((o) => orgs.some((x) => x.id === o.organization_id))
      if (!targetOrg) {
        setHitUid(null)
        message.warning(t('orgExplorer.searchMemberNotFound', { uid: String(uid) }))
        return
      }
      const targetId = targetOrg.organization_id
      // 目标不在第 1 页时，先扫描出其所在页
      const page = (await findMemberPage(targetId, uid, memberPageSize)) ?? 1
      setHitUid(uid)
      message.success(
        t('orgExplorer.searchMemberHit', {
          uid: String(uid),
          org: targetOrg.organization_name,
        }),
      )
      if (targetId === activeOrgId) {
        // 组织未变化（含单组织模式）：直接按目标页加载
        onLoadPage(targetId, page)
      } else {
        // 组织变化：清掉组织名称过滤、展开并选中目标组织，由切换 effect 按目标页加载
        onClearFilter?.()
        setFocusKeys(orgAncestorKeys(orgs, targetId))
        pendingPageRef.current = page
        onSelectOrg(targetId)
      }
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        message.error(extractErrorReason(err, t))
      }
    } finally {
      setSearching(false)
    }
  }, [
    query,
    message,
    t,
    orgs,
    memberPageSize,
    activeOrgId,
    onSelectOrg,
    onLoadPage,
    onClearFilter,
  ])

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

  return { query, setQuery, searching, hitUid, focusKeys, setFocusKeys, run, consumePendingPage }
}
