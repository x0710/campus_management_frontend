/** RBAC 模块, 提供角色、权限、用户角色关联与角色权限分配 API */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  Permission,
  PermissionCreateRequest,
  PermissionQuery,
  PermissionUpdateRequest,
  RoleCreateRequest,
  RoleInfo,
  RoleQuery,
  RoleUpdateRequest,
  UserRoleInfo,
  UserRoleRelation,
} from './types/rbac'

// ==================== 角色 ====================

/** GET /api/rbac/roles 分页查询角色（admin，会话内缓存；force=true 手动刷新绕过缓存） */
export async function queryRoles(
  params: RoleQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<RoleInfo>> {
  return cachedGet<PaginatedResponse<RoleInfo>>(
    '/rbac/roles',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/rbac/roles/{id} 查询单个角色详情（会话内缓存） */
export async function getRole(id: number): Promise<RoleInfo> {
  return cachedGet<RoleInfo>(`/rbac/roles/${id}`)
}

/** POST /api/rbac/roles 创建角色，返回新角色 ID */
export async function createRole(body: RoleCreateRequest): Promise<number> {
  const res = await http.post<{ id: number }>('/rbac/roles', body)
  invalidate('GET /rbac/roles')
  return res.data.id
}

/** PATCH /api/rbac/roles/{id} 更新角色（部分字段） */
export async function updateRole(id: number, body: RoleUpdateRequest): Promise<void> {
  await http.patch(`/rbac/roles/${id}`, body)
  invalidate('GET /rbac/roles')
}

/** DELETE /api/rbac/roles/{id} 删除角色（级联清除用户/权限关联） */
export async function deleteRole(id: number): Promise<void> {
  await http.delete(`/rbac/roles/${id}`)
  invalidate('GET /rbac/roles')
  invalidate(`GET /rbac/roles/${id}/permissions`)
}

// ==================== 权限 ====================

/** GET /api/rbac/permissions 分页查询权限（会话内缓存；force=true 手动刷新绕过缓存） */
export async function queryPermissions(
  params: PermissionQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<Permission>> {
  return cachedGet<PaginatedResponse<Permission>>(
    '/rbac/permissions',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/rbac/permissions/{id} 查询单个权限详情（会话内缓存） */
export async function getPermission(id: number): Promise<Permission> {
  return cachedGet<Permission>(`/rbac/permissions/${id}`)
}

/** POST /api/rbac/permissions 创建权限，返回新权限 ID */
export async function createPermission(body: PermissionCreateRequest): Promise<number> {
  const res = await http.post<{ id: number }>('/rbac/permissions', body)
  invalidate('GET /rbac/permissions')
  return res.data.id
}

/** PATCH /api/rbac/permissions/{id} 更新权限（部分字段） */
export async function updatePermission(
  id: number,
  body: PermissionUpdateRequest,
): Promise<void> {
  await http.patch(`/rbac/permissions/${id}`, body)
  invalidate('GET /rbac/permissions')
}

/** DELETE /api/rbac/permissions/{id} 删除权限 */
export async function deletePermission(id: number): Promise<void> {
  await http.delete(`/rbac/permissions/${id}`)
  invalidate('GET /rbac/permissions')
}

// ==================== 角色-权限关联 ====================

/** GET /api/rbac/roles/{role_id}/permissions 查询角色已被分配的全部权限（会话内缓存） */
export async function getRolePermissions(roleId: number): Promise<Permission[]> {
  return cachedGet<Permission[]>(`/rbac/roles/${roleId}/permissions`)
}

/** PUT /api/rbac/roles/{role_id}/permissions 覆盖式分配权限（会先清除旧关联再批量插入） */
export async function assignRolePermissions(
  roleId: number,
  permissionIds: number[],
): Promise<void> {
  await http.put(`/rbac/roles/${roleId}/permissions`, {
    role_id: roleId,
    permission_ids: permissionIds,
  })
  invalidate(`GET /rbac/roles/${roleId}/permissions`)
}

/** DELETE /api/rbac/roles/{role_id}/permissions/{permission_id} 移除角色单个权限 */
export async function removeRolePermission(
  roleId: number,
  permissionId: number,
): Promise<void> {
  await http.delete(`/rbac/roles/${roleId}/permissions/${permissionId}`)
  invalidate(`GET /rbac/roles/${roleId}/permissions`)
}

// ==================== 用户-角色关联 ====================

/** GET /api/rbac/users/roles?uids=1,2,3 查询用户角色（会话内缓存） */
export async function queryUserRoles(uids: number[]): Promise<UserRoleInfo[]> {
  return cachedGet<UserRoleInfo[]>('/rbac/users/roles', { uids: uids.join(',') })
}

/** GET /api/rbac/users/{uid}/role-relations 查询用户角色关联列表（会话内缓存） */
export async function queryUserRoleRelations(uid: number): Promise<UserRoleRelation[]> {
  return cachedGet<UserRoleRelation[]>(`/rbac/users/${uid}/role-relations`)
}

/** POST /api/rbac/users/{uid} 覆盖式分配角色（role_ids 不能为空） */
export async function assignUserRoles(uid: number, roleIds: number[]): Promise<void> {
  await http.post(`/rbac/users/${uid}`, { role_ids: roleIds })
  // 失效该用户相关的全部 rbac 缓存：批量角色查询 + 角色关联列表
  invalidate('GET /rbac/users/roles')
  invalidate('GET /rbac/users/')
}
