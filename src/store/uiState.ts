/**
 * 视图层会话状态（非持久化）：用于在路由切换时保留某些页面的 UI 状态，
 * 例如「组织架构」页面选中的组织 ID。仅存在于内存，刷新后重置。
 * 与 settings/auth 不同，这些状态不需要跨刷新保留，只需跨路由切换保留。
 */
import { create } from 'zustand'

interface UiState {
  /** 各组织视图当前选中的组织 ID，按模块 key 记忆（如 admin_m3 / leader_m3 / teacher_m3），null 表示未选中 */
  selectedOrgIds: Partial<Record<string, number | null>>
  setSelectedOrgId: (moduleKey: string, id: number | null) => void
  /** 各组织视图左侧组织树的收起状态，按模块 key 记忆（true 表示已收起，仅看成员表） */
  collapsedOrgTrees: Partial<Record<string, boolean>>
  setOrgTreeCollapsed: (moduleKey: string, collapsed: boolean) => void
}

export const useUiStateStore = create<UiState>()((set) => ({
  selectedOrgIds: {},
  setSelectedOrgId: (moduleKey, id) =>
    set((s) => ({ selectedOrgIds: { ...s.selectedOrgIds, [moduleKey]: id } })),
  collapsedOrgTrees: {},
  setOrgTreeCollapsed: (moduleKey, collapsed) =>
    set((s) => ({ collapsedOrgTrees: { ...s.collapsedOrgTrees, [moduleKey]: collapsed } })),
}))
