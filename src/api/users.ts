import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse, PageQuery } from './common'

export type UserStatus = 'active' | 'disabled'
export type Gender = 'male' | 'female'

/** GET /api/users 列表项（后端仅返回 uid/name） */
export interface UserInfo {
  uid: number
  name: string | null
}

/** GET /api/users/{id} 用户详情 */
export interface UserDetail {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  /** YYYY-MM-DD */
  birthday: string | null
  gender: string | null
  avatar: string | null
  created_at: string
  updated_at: string
}

export interface UserQuery extends PageQuery {
  keyword?: string
  status?: UserStatus
}

/** POST /api/users 请求元素（body 为数组，支持批量创建） */
export interface UserCreateRequest {
  username: string
  /** 不填后端自动生成随机密码 */
  password?: string
  name?: string
  gender?: Gender
  /** 任职组织（与 pos/workplaces 按下标并行） */
  org?: number[]
  pos?: string[]
  workplaces?: string[]
}

/** PATCH /api/users/{id} 可更新字段 */
export interface UserUpdateRequest {
  name?: string
  email?: string
  phone?: string
  /** YYYY-MM-DD */
  birthday?: string | null
  gender?: Gender
  avatar?: string
}

/**
 * GET /api/users 分页查询（权限 user.read，会话内缓存）。
 * force=true 可绕过缓存（手动刷新按钮）；创建/更新/删除会自动失效列表缓存。
 */
export async function queryUsers(
  params: UserQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<UserInfo>> {
  return cachedGet<PaginatedResponse<UserInfo>>(
    '/users',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/users/{id} 用户详情（会话内缓存） */
export async function getUser(id: number): Promise<UserDetail> {
  return cachedGet<UserDetail>(`/users/${id}`)
}

/** POST /api/users 批量创建用户 */
export async function createUsers(body: UserCreateRequest[]): Promise<number> {
  const res = await http.post<number>('/users', body)
  invalidate('GET /users')
  return res.data
}

/** PATCH /api/users/{id} 更新用户资料 */
export async function updateUser(id: number, body: UserUpdateRequest): Promise<void> {
  await http.patch(`/users/${id}`, body)
  invalidate('GET /users')
  invalidate(`GET /users/${id}`)
}

/** DELETE /api/users/{id} 删除用户（不能删除自己） */
export async function deleteUser(id: number): Promise<void> {
  await http.delete(`/users/${id}`)
  invalidate(`GET /users/${id}`)
  invalidate('GET /users')
}

/** PUT /api/users/{id}/reset_password 重置密码 */
export async function resetUserPassword(
  id: number,
): Promise<{ user_id: number; new_password: string }> {
  const res = await http.put<{ user_id: number; new_password: string }>(
    `/users/${id}/reset_password`,
  )
  // 重置密码不改变用户资料字段，但可能影响 last_login_at 等字段，保险起见失效
  invalidate(`GET /users/${id}`)
  return res.data
}
