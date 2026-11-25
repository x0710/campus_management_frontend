import { useEffect, useState } from 'react'

import { useSettingsStore } from '../store/settings'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 读取当前操作系统的深浅色偏好，并在系统切换时实时更新 */
export function useSystemPrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches === true,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return prefersDark
}

/**
 * 实际生效的明暗模式：主题偏好为 system 时跟随操作系统，否则使用手动选择。
 * 所有需要判断明暗的地方（antd 算法、data-theme、图标）都应使用该返回值。
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettingsStore((state) => state.theme)
  const systemPrefersDark = useSystemPrefersDark()

  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light'
  return theme
}
