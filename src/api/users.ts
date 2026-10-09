/** 用户模块, 提供用户查询、创建、更新、删除与密码重置 API */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  UserCreateRequest,
  UserDetail,
  UserInfo,
  UserQuery,
  UserUpdateRequest,
} from './types/users'

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

/**
 * GET /api/users/me 获取当前登录用户的详细资料（含真实姓名 name）。
 * 与 /users/{id} 不同，该接口仅需登录认证、不要求 user.read 权限，
 * 因此顶栏等全局位置可用它把账户名换成真实姓名；走会话缓存，
 * 退出登录时由 invalidate() 统一清空，避免下一个用户读到上一位用户的资料（代码要求 17）。
 */
export function getMyProfile(): Promise<UserDetail> {
  return cachedGet<UserDetail>('/users/me')
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

/**
 * PUT /api/users/{id}/reset_password 重置指定用户密码。
 * 请求体为 JSON 字符串或 `null`（后端签名为 `Json<Option<String>>`，OpenAPI 中 required=true）：
 * - 传新密码字符串 → 重置为指定密码
 * - 传 `null` → 由后端生成随机密码
 * @param id 目标用户 ID（必填）
 * @param newPassword 指定的新密码（可选；不传则重置为后端随机密码）
 * @returns 本次实际写入的明文密码（与传入的 newPassword 一致，或后端生成的随机密码）
 */
export async function resetUserPassword(
  id: number,
  newPassword?: string,
): Promise<{ user_id: number; new_password: string }> {
  const res = await http.put<{ user_id: number; new_password: string }>(
    `/users/${id}/reset_password`,
    newPassword === undefined ? 'null' : JSON.stringify(newPassword),
    { headers: { 'Content-Type': 'application/json' } },
  )
  // 重置密码不改变用户资料字段，但可能影响 last_login_at 等字段，保险起见失效
  invalidate(`GET /users/${id}`)
  return res.data
}
