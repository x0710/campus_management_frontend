/**
 * RBAC 模块类型定义：角色、权限、用户角色关联、角色-权限关联及各自的查询/创建/更新参数。
 * 供 api/rbac.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 角色（api.json: RoleInfo） */
export interface RoleInfo {
  id: number
  code: string
  name: string
  description: string  // 角色描述
  created_at: string  // 创建时间
  updated_at: string  // 更新时间
}

/** GET /api/rbac/users/roles?uids= 返回元素（带 uid） */
export interface UserRoleInfo extends RoleInfo {
  uid: number
}

/** 权限（api.json: Permission） */
export interface Permission {
  id: number
  code: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

/** 角色-权限关联记录（仅含 id） */
export interface RolePermissionItem {
  role_id: number
  permission_id: number
}

/** 角色分页查询参数 */
export interface RoleQuery extends PageQuery {
  keyword?: string
}

/** 权限分页查询参数 */
export interface PermissionQuery extends PageQuery {
  keyword?: string
}

/** 角色创建请求体 */
export interface RoleCreateRequest {
  code: string
  name: string
  description?: string
}

/** 角色更新请求体（所有字段可选） */
export interface RoleUpdateRequest {
  code?: string
  name?: string
  description?: string
}

/** 权限创建请求体 */
export interface PermissionCreateRequest {
  code: string
  name: string
  description?: string
}

/** 权限更新请求体（所有字段可选） */
export interface PermissionUpdateRequest {
  code?: string
  name?: string
  description?: string
}

/** 用户-角色关联记录（仅含 id，需配合 getRole 获取详情） */
export interface UserRoleRelation {
  user_id: number
  role_id: number
}