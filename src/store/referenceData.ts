/** 参考数据共享资源：我的角色、职务名称等，随缓存失效自动刷新。 */

import { getMyRoles } from '../api/auth'
import { subscribeCacheInvalidation } from '../api/cache'
import { listAllPositions } from '../api/positions'
import type { UserRoleInfo } from '../api/types/rbac'
import { createSharedResource } from '../utils/sharedResource'
import { useAuthStore } from './auth'

export const positionNamesResource = createSharedResource(async (force) => {
  if (!useAuthStore.getState().token) return new Map<string, string>()
  const positions = await listAllPositions(force)
  return new Map(positions.map((position) => [position.code, position.name]))
}, new Map<string, string>(), 300_000)

export const myRolesResource = createSharedResource(
  (force) => useAuthStore.getState().token ? getMyRoles(force) : Promise.resolve([]),
  [] as UserRoleInfo[], 30_000,
)

subscribeCacheInvalidation((prefix) => {
  if (!prefix || prefix.startsWith('GET /positions') || 'GET /positions'.startsWith(prefix)) {
    positionNamesResource.invalidate(!prefix)
  }
  if (!prefix || ['GET /rbac', 'GET /credentials'].some((path) =>
    prefix.startsWith(path) || path.startsWith(prefix))) myRolesResource.invalidate(!prefix)
})
