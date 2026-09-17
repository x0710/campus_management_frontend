import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthSnapshot {
  token: string
  username: string
  lastLoginAt: string | null
}

interface AuthState {
  /** JWT，null 表示未登录 */
  token: string | null
  username: string | null
  lastLoginAt: string | null
  setAuth: (snapshot: AuthSnapshot) => void
  clearAuth: () => void
}

/**
 * 登录态全局存储，持久化到 localStorage（key: campus-auth），
 * 刷新页面后保持登录，axios 拦截器据此附带 Token。
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      lastLoginAt: null,
      setAuth: ({ token, username, lastLoginAt }) =>
        set({ token, username, lastLoginAt }),
      clearAuth: () => set({ token: null, username: null, lastLoginAt: null }),
    }),
    { name: 'campus-auth' },
  ),
)
