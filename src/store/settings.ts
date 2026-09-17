import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Locale = 'zh' | 'en'
export type ThemeMode = 'light' | 'dark'

interface SettingsState {
  locale: Locale
  theme: ThemeMode
  /** 左侧菜单是否收起（持久化到 localStorage，跨门户与刷新保持） */
  sidebarCollapsed: boolean
  setLocale: (locale: Locale) => void
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

/** 界面偏好（语言 / 明暗主题 / 侧栏收起），持久化到 localStorage */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: 'zh',
      theme: 'light',
      sidebarCollapsed: false,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    { name: 'campus-settings' },
  ),
)
