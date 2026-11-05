import type { DataScope, RoleDataScopeInfo, RoleDataScopeRequest } from '../api/types/rbac'

export interface ScopeConfig {
  scope: DataScope
  scopeValue: string
}

/** GET 返回原始配置；保留历史默认键，并将历史 self 规范化。 */
export function parseRoleDataScopes(items: RoleDataScopeInfo[]): Record<string, ScopeConfig> {
  return Object.fromEntries(items.map((item) => [item.resource, {
    scope: item.scope === 'self' ? 'self_only' : item.scope,
    scopeValue: item.scope_value ?? '',
  }]))
}

/** PUT 完整替换，必须包含所有保留项，不能按勾选权限或搜索结果过滤。 */
export function serializeRoleDataScopes(map: Record<string, ScopeConfig>): RoleDataScopeRequest[] {
  return Object.entries(map).map(([resource, config]) => ({
    resource,
    scope: config.scope,
    scope_value: config.scope === 'custom' ? config.scopeValue.trim() : null,
  }))
}
