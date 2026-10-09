/**
 * 认证模块类型定义：登录请求/响应、账户状态、当前用户信息、注册请求/响应。
 * 供 api/auth.ts 的请求函数与各视图复用。
 */

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

/** PATCH /api/credentials 请求体：本人或管理员修改账户信息（api.json: UpdateInfoRequest） */
export interface UpdateCredentialRequest {
  /** 目标用户 ID（本人改密码时传自己的 uid） */
  uid: number
  /** 旧密码（本人修改时必填，后端用于校验） */
  old_password: string
  /** 新密码（可选，不传表示仅修改用户名等其他字段） */
  new_password?: string
  /** 新用户名（可选） */
  username?: string
}