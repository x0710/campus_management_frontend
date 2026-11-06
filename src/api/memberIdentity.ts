/** 成员详情的只读身份查询：直接读取用户角色和用户职位，不查询管理用的关联表或全量字典。 */
import { listUserOrganizations } from './organizations'
import { queryUserPositions } from './positions'
import { queryUserRoles } from './rbac'
import type { UserOrganization } from './types/organizations'
import type { UserPosition } from './types/positions'
import type { UserRoleInfo } from './types/rbac'

export interface MemberOrganization extends UserOrganization {
  positionDetail?: UserPosition
}

export async function queryMemberIdentity(
  uid: number,
  { includeRoles = true, force = false }: { includeRoles?: boolean; force?: boolean } = {},
): Promise<{
  roles: UserRoleInfo[]
  organizations: MemberOrganization[]
  errors: { roles?: unknown; organizations?: unknown; positions?: unknown }
}> {
  const [roles, organizations, positions] = await Promise.allSettled([
    includeRoles ? queryUserRoles([uid], force) : Promise.resolve([] as UserRoleInfo[]),
    listUserOrganizations(uid, force),
    queryUserPositions([uid], force),
  ])
  const details = new Map<string, UserPosition>()
  if (positions.status === 'fulfilled') {
    for (const position of positions.value) {
      if (position.uid === uid) details.set(`${position.member_organization_id}:${position.code}`, position)
    }
  }
  return {
    roles: roles.status === 'fulfilled' ? roles.value.filter((role) => role.uid === uid) : [],
    organizations: organizations.status === 'fulfilled'
      ? organizations.value.filter((organization) => organization.user_id === uid).map((organization) => ({
        ...organization,
        positionDetail: details.get(`${organization.organization_id}:${organization.position}`),
      })) : [],
    errors: {
      ...(roles.status === 'rejected' ? { roles: roles.reason } : {}),
      ...(organizations.status === 'rejected' ? { organizations: organizations.reason } : {}),
      ...(positions.status === 'rejected' ? { positions: positions.reason } : {}),
    },
  }
}
