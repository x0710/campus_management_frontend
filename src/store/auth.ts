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
  /**
   * 是否必须先修改密码才能进入系统：
   * 登录响应 last_login_at 为 null 表示首次登录（见 api/types/auth.ts），此时置为 true。
   * 同样持久化，刷新页面后仍保持强制改密弹窗。
   */
  mustChangePassword: boolean
  setAuth: (snapshot: AuthSnapshot) => void
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
      token: null,
      username: null,
      lastLoginAt: null,
      mustChangePassword: false,
      setAuth: ({ token, username, lastLoginAt }) =>
        set((state) => ({
          token,
          username,
          lastLoginAt,
          // 首次登录（last_login_at 为空）必须改密；同一账号上次未改完（刷新/重开浏览器）继续保持强制，
          // 换账号登录则重新判定，避免把上一个账号的拦截状态带给新用户
          mustChangePassword:
            lastLoginAt === null ||
            (state.mustChangePassword && state.username === username),
        })),
      finishPasswordChange: () => set({ mustChangePassword: false }),
      clearAuth: () =>
        set({
          token: null,
          username: null,
          lastLoginAt: null,
          mustChangePassword: false,
        }),
    }),
    { name: 'campus-auth' },
  ),
)
