/** 登录态 store：token、用户信息与代登录 / 登出清理。 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthSnapshot {
  token: string
  username: string
  lastLoginAt: string | null
}

interface AuthState {
  originalAuth: (AuthSnapshot & { mustChangePassword: boolean; returnTo?: string }) | null
  impersonate: (snapshot: AuthSnapshot, returnTo?: string) => void
  restoreAuth: () => void
  /** JWT，null 表示未登录 */
  token: string | null
  username: string | null
  lastLoginAt: string | null
  /**
   * 是否必须先修改密码才能进入系统：
   * 密码登录响应 last_login_at 为 null 表示首次登录，此时置为 true；CAS 登录不要求修改本地密码。
   * 同样持久化，刷新页面后仍保持强制改密弹窗。
   */
  mustChangePassword: boolean
  /** 本次登录密码，仅在强制改密期间保留于内存。 */
  pendingPassword: string | null
  setAuth: (snapshot: AuthSnapshot, method?: 'password' | 'cas', password?: string) => void
  /** 强制改密成功后调用，解除拦截 */
  finishPasswordChange: () => void
  clearAuth: () => void
}

/**
 * 登录态全局存储，持久化到 localStorage（key: campus-auth），
 * 刷新页面后保持登录，axios 拦截器据此附带 Token。
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      originalAuth: null,
      impersonate: (snapshot, returnTo) => set((state) => ({
        originalAuth: state.originalAuth ?? (state.token && state.username ? {
          token: state.token,
          username: state.username,
          lastLoginAt: state.lastLoginAt,
          mustChangePassword: state.mustChangePassword,
          returnTo: returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : undefined,
        } : null),
        ...snapshot,
        pendingPassword: null,
        // 代登录不应触发目标用户首次登录改密。
        mustChangePassword: false,
      })),
      restoreAuth: () => set((state) => state.originalAuth ? {
        token: state.originalAuth.token,
        username: state.originalAuth.username,
        lastLoginAt: state.originalAuth.lastLoginAt,
        mustChangePassword: state.originalAuth.mustChangePassword,
        originalAuth: null,
        pendingPassword: null,
      } : {}),
      token: null,
      username: null,
      lastLoginAt: null,
      mustChangePassword: false,
      pendingPassword: null,
      setAuth: ({ token, username, lastLoginAt }, method = 'password', password) =>
        set((state) => ({
          originalAuth: null,
          token,
          username,
          lastLoginAt,
          pendingPassword: method === 'password' && (lastLoginAt === null ||
            (state.mustChangePassword && state.username === username)) ? password ?? null : null,
          // 首次登录（last_login_at 为空）必须改密；同一账号上次未改完（刷新/重开浏览器）继续保持强制，
          // 换账号登录则重新判定，避免把上一个账号的拦截状态带给新用户
          mustChangePassword:
            method === 'password' && (lastLoginAt === null ||
            (state.mustChangePassword && state.username === username)),
        })),
      finishPasswordChange: () => set({ mustChangePassword: false, pendingPassword: null }),
      clearAuth: () =>
        set({
          originalAuth: null,
          pendingPassword: null,
          token: null,
          username: null,
          lastLoginAt: null,
          mustChangePassword: false,
        }),
    }),
    {
      name: 'campus-auth',
      partialize: ({ pendingPassword: _pendingPassword, ...state }) => state,
    },
  ),
)
