/**
 * 视图层会话状态（非持久化）：用于在路由切换时保留某些页面的 UI 状态，
 * 例如「组织架构」页面选中的组织 ID。仅存在于内存，刷新后重置。
 * 与 settings/auth 不同，这些状态不需要跨刷新保留，只需跨路由切换保留。
 */
import { create } from 'zustand'

interface UiState {
  /** 组织架构页面当前选中的组织 ID，null 表示未选中 */
  selectedOrgId: number | null
  setSelectedOrgId: (id: number | null) => void
}

export const useUiStateStore = create<UiState>()((set) => ({
  selectedOrgId: null,
  setSelectedOrgId: (id) => set({ selectedOrgId: id }),
}))
