/**
 * 视图层会话状态（非持久化）：用于在路由切换时保留某些页面的 UI 状态，
 * 例如「组织架构」页面选中的组织 ID。仅存在于内存，刷新后重置。
 * 与 settings/auth 不同，这些状态不需要跨刷新保留，只需跨路由切换保留。
 */
import { create } from 'zustand'
import type { MemberSearchHit } from '../composables/useMemberSearch'

/**
 * 组织成员搜索的可恢复状态（按模块 key 保存，仅存内存，刷新后重置）。
 * 用于「搜索成员 → 进入成员详情 → 返回组织架构」后继续查看上一次的模糊匹配结果与当前定位。
 */
export interface MemberSearchState {
  /** 搜索框内容 */
  query: string
  /** 姓名模糊搜索关键词（懒加载后续候选页时复用） */
  keyword: string
  /** 后端匹配总数 */
  resultTotal: number
  /** 已解析的命中项 */
  matches: MemberSearchHit[]
  /** 当前定位到的命中项下标（从 0 开始） */
  matchIndex: number
  /** 已加载的候选页 / 候选总页数 */
  candidatePage: number
  candidatePages: number
  /** 当前高亮的成员 UID（null 表示无命中） */
  hitUid: number | null
  /** 命中后需要展开的组织树节点 */
  focusKeys: number[] | null
  /** 是否处于「单独查看匹配人员」模式 */
  matchOnly: boolean
}

interface UiState {
  /** 各组织视图当前选中的组织 ID，按模块 key 记忆（如 admin_m3 / leader_m3 / teacher_m3），null 表示未选中 */
  selectedOrgIds: Partial<Record<string, number | null>>
  setSelectedOrgId: (moduleKey: string, id: number | null) => void
  /** 各组织视图左侧组织树的收起状态，按模块 key 记忆（true 表示已收起，仅看成员表） */
  collapsedOrgTrees: Partial<Record<string, boolean>>
  setOrgTreeCollapsed: (moduleKey: string, collapsed: boolean) => void
  /**
   * 各组织视图左侧组织树已展开的节点 ID，按模块 key 记忆（跨路由切换保留，刷新后重置）。
   * 缺省（undefined）表示用户未手动调整过，此时按默认「仅展开根节点」渲染。
   */
  expandedOrgTreeKeys: Partial<Record<string, number[]>>
  setOrgTreeExpanded: (moduleKey: string, keys: number[]) => void
  /** 各组织视图成员表当前页码，按模块 key 记忆（返回列表后仍停留在原页） */
  memberPages: Partial<Record<string, number>>
  setMemberPage: (moduleKey: string, page: number) => void
  /** 各组织视图的成员搜索状态，按模块 key 记忆（跨路由返回后继续查看上次匹配结果） */
  memberSearchStates: Partial<Record<string, MemberSearchState>>
  setMemberSearchState: (moduleKey: string, state: MemberSearchState | null) => void
}

export const useUiStateStore = create<UiState>()((set) => ({
  selectedOrgIds: {},
  setSelectedOrgId: (moduleKey, id) =>
    set((s) => ({ selectedOrgIds: { ...s.selectedOrgIds, [moduleKey]: id } })),
  collapsedOrgTrees: {},
  setOrgTreeCollapsed: (moduleKey, collapsed) =>
    set((s) => ({ collapsedOrgTrees: { ...s.collapsedOrgTrees, [moduleKey]: collapsed } })),
  expandedOrgTreeKeys: {},
  setOrgTreeExpanded: (moduleKey, keys) =>
    set((s) => ({ expandedOrgTreeKeys: { ...s.expandedOrgTreeKeys, [moduleKey]: keys } })),
  memberPages: {},
  setMemberPage: (moduleKey, page) =>
    set((s) => ({ memberPages: { ...s.memberPages, [moduleKey]: page } })),
  memberSearchStates: {},
  setMemberSearchState: (moduleKey, state) =>
    set((s) => {
      const next = { ...s.memberSearchStates }
      if (state) next[moduleKey] = state
      else delete next[moduleKey]
      return { memberSearchStates: next }
    }),
}))
