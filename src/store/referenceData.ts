import { getMyRoles, getMyPortalPositions } from '../api/auth'
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

export const myPortalPositionsResource = createSharedResource(
  (force) => useAuthStore.getState().token ? getMyPortalPositions(force) : Promise.resolve([]),
  [] as { code: string }[], 30_000,
)

subscribeCacheInvalidation((prefix) => {
  if (!prefix || ['GET /organization-members', 'GET /organizations', 'GET /positions', 'GET /credentials'].some((path) =>
    prefix.startsWith(path) || path.startsWith(prefix))) myPortalPositionsResource.invalidate(!prefix)
  if (!prefix || prefix.startsWith('GET /positions') || 'GET /positions'.startsWith(prefix)) {
    positionNamesResource.invalidate(!prefix)
  }
  if (!prefix || ['GET /rbac', 'GET /credentials'].some((path) =>
    prefix.startsWith(path) || path.startsWith(prefix))) myRolesResource.invalidate(!prefix)
})
