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

/** 数据权限范围（对应后端 DataScope，按 snake_case 序列化） */
export type DataScope = 'all' | 'self_only' | 'org' | 'org_and_child' | 'custom'

/** 角色单条数据范围配置（GET /api/rbac/roles/{role_id}/data-scopes 返回元素） */
export interface RoleDataScopeInfo {
  /** 资源标识，通常取权限编码的最前列，如权限 student.read 对应资源 student */
  resource: string
  /** 数据权限范围 */
  scope: DataScope
  /** 仅 scope='custom' 时有值：逗号分隔的组织 ID 白名单，如 "1,2,3"；其余情况为 null */
  scope_value: string | null
}

/** 角色数据范围配置项（PUT /api/rbac/roles/{role_id}/data-scopes 请求体数组元素） */
export interface RoleDataScopeRequest {
  /** 资源标识（必填，不能为空） */
  resource: string
  /** 数据权限范围（必填） */
  scope: DataScope
  /** 仅 scope='custom' 时生效：逗号分隔的组织 ID 白名单；其余情况提交 null */
  scope_value?: string | null
}