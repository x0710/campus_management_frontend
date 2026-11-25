/** 界面设置 store：语言、主题与侧栏状态持久化。 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Locale } from '../types/locale'
export type { Locale } from '../types/locale'
/** 主题偏好：system 跟随操作系统，light / dark 为手动指定 */
export type ThemeMode = 'system' | 'light' | 'dark'

interface SettingsState {
  locale: Locale
  theme: ThemeMode
  /** 左侧菜单是否收起（持久化到 localStorage，跨门户与刷新保持） */
  sidebarCollapsed: boolean
  setLocale: (locale: Locale) => void
  setTheme: (theme: ThemeMode) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

/** 界面偏好（语言 / 明暗主题 / 侧栏收起），持久化到 localStorage */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: 'zh',
      // 默认跟随系统深浅色；用户手动选择后按选择持久化
      theme: 'system',
      sidebarCollapsed: false,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'campus-settings',
      // 旧版本默认写死 light；升级后统一改为跟随系统，再由用户按需切换
      version: 1,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<SettingsState>
        return version < 1 ? { ...state, theme: 'system' } : state
      },
    },
  ),
)
