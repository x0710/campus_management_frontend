import { cachedGet } from './cache'
import { http } from './http'

/** POST /api/credentials/login 请求体 */
export interface LoginRequest {
  username: string
  password: string
}

/** POST /api/credentials/login 响应体 */
export interface LoginResponse {
  /** JWT Token */
  token: string
  /** 用户名 */
  user: string
  /** 上次登录时间（RFC3339），首次登录为 null */
  last_login_at: string | null
}

/** 账户状态（后端枚举序列化为 snake_case） */
export type AccountStatus = 'enabled' | 'disabled'

/** GET /api/credentials/me 响应体 用来获取当前登录用户信息 */
export interface UserInfo {
  uid: number
  username: string
  status: AccountStatus
  last_login_at: string | null
}

/** 用户名密码登录，成功后返回 JWT 与用户信息（POST /api/login） */
export function login(data: LoginRequest) {
  return http.post<LoginResponse>('/login', data).then((res) => res.data)
}

/** POST /api/auth/register 请求体（api.json: RegisterRequest） */
export interface RegisterRequest {
  username: string
  password: string
  /** 邀请码（可选，不提供则返回 403） */
  invite_code?: string | null
}

/** POST /api/auth/register 响应体（api.json: RegisterResponse） */
export interface RegisterResponse {
  id: number
  username: string
}

/**
 * 自助注册账户（POST /api/auth/register）。
 * 邀请码由部署环境配置，不提供或无效时后端返回 403；用户名已存在返回 409。
 */
export function register(data: RegisterRequest) {
  return http
    .post<RegisterResponse>('/auth/register', data)
    .then((res) => res.data)
}

/** 拉取当前登录用户信息（会话内缓存一次） */
export function getCurrentUser() {
  return cachedGet<UserInfo>('/credentials/me')
}
