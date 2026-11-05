/** 角色数据范围配置的解析、规范化与序列化工具。 */

import type { DataScope, RoleDataScopeInfo, RoleDataScopeRequest } from '../api/types/rbac'

export interface ScopeConfig {
  scope: DataScope
  scopeValue: string
}

/**
 * GET 返回原始配置；保留历史默认键，并将历史 self 规范化。
 * @param items 类型：RoleDataScopeInfo[]；默认值：无；是否必填：必填
 * @returns 类型：Record<string, ScopeConfig>
 */
export function parseRoleDataScopes(items: RoleDataScopeInfo[]): Record<string, ScopeConfig> {
  return Object.fromEntries(items.map((item) => [item.resource, {
    scope: item.scope === 'self' ? 'self_only' : item.scope,
    scopeValue: item.scope_value ?? '',
  }]))
}

/**
 * PUT 完整替换，必须包含所有保留项，不能按勾选权限或搜索结果过滤。
 * @param map 类型：Record<string, ScopeConfig>；默认值：无；是否必填：必填
 * @returns 类型：RoleDataScopeRequest[]
 */
export function serializeRoleDataScopes(map: Record<string, ScopeConfig>): RoleDataScopeRequest[] {
  return Object.entries(map).map(([resource, config]) => ({
    resource,
    scope: config.scope,
    scope_value: config.scope === 'custom' ? config.scopeValue.trim() : null,
  }))
}
