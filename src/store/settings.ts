/** 界面设置 store：语言、主题与侧栏状态持久化。 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Locale } from '../types/locale'
export type { Locale } from '../types/locale'
export type ThemeMode = 'light' | 'dark' | 'system'

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
      theme: 'system',
      sidebarCollapsed: false,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'campus-settings',
      version: 1,
      migrate: (persisted) => {
        const previous = persisted as Partial<SettingsState> | null
        return { ...previous, theme: previous?.theme === 'dark' ? 'dark' : 'system' } as SettingsState
      },
    },
  ),
)
