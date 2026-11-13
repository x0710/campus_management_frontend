import type { LoginResponse } from '../api/types/auth'
import { useAuthStore } from '../store/auth'

/** 验证响应后再写入登录态，避免代理返回 HTML 或异常 JSON 时污染已有会话。 */
export function readLoginResponse(data: unknown): LoginResponse {
  if (data && typeof data === 'object') {
    const value = data as Partial<LoginResponse>
    if (typeof value.token === 'string' && value.token.trim() &&
      typeof value.user === 'string' && value.user.trim() &&
      (value.last_login_at === null || (typeof value.last_login_at === 'string' && Number.isFinite(Date.parse(value.last_login_at))))) {
      return value as LoginResponse
    }
  }
  throw new Error('Invalid login response')
}

export function saveLoginSession(data: unknown, method: 'password' | 'cas' = 'password', password?: string): LoginResponse {
  const response = readLoginResponse(data)
  useAuthStore.getState().setAuth({
    token: response.token,
    username: response.user,
    lastLoginAt: response.last_login_at,
  }, method, password)
  return response
}
