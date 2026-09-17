import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse, PageQuery } from './common'

/** 组织信息（api.json: OrganizationInfoDto） */
export interface OrganizationInfo {
  id: number
  code: string
  name: string
  parent_id: number | null
  created_at: string
  updated_at: string
}

/** 组织成员（POST/DELETE body；position 为字符串编码） */
export interface OrganizationMember {
  user_id: number
  position: string
  workplace: string | null
}

/** 用户-组织任职详情（GET /organizations/users/{uid}） */
export interface UserOrganization extends OrganizationMember {
  id: number
  organization_id: number
  organization_name: string
  created_at: string
}

export interface OrganizationQuery {
  page?: number
  page_size?: number
  keyword?: string
  parent_id?: number
}

export interface OrganizationMemberQuery extends PageQuery {
  position?: string
  user_id?: number
}

/** GET /api/organizations 分页查询组织（会话内缓存；force=true 手动刷新绕过缓存） */
export async function queryOrganizations(
  params: OrganizationQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<OrganizationInfo>> {
  return cachedGet<PaginatedResponse<OrganizationInfo>>(
    '/organizations',
    params as Record<string, unknown>,
    { force },
  )
}

/** 拉取全部组织（分页接口循环取完），供组织树使用；force=true 整体绕过缓存 */
export async function listAllOrganizations(force?: boolean): Promise<OrganizationInfo[]> {
  const pageSize = 100
  const all: OrganizationInfo[] = []
  for (let page = 1; ; page += 1) {
    const res = await queryOrganizations({ page, page_size: pageSize }, force)
    all.push(...res.data)
    if (page >= res.total_pages) break
  }
  return all
}

/** POST /api/organizations 新建组织 */
export async function createOrganization(body: {
  code: string
  name: string
  parent_id?: number | null
}): Promise<number> {
  const res = await http.post<number>('/organizations', body)
  invalidate('GET /organizations')
  return res.data
}

/** PATCH /api/organizations/{id} 更新组织 */
export async function updateOrganization(
  id: number,
  body: { code?: string; name?: string; parent_id?: number | null },
): Promise<void> {
  await http.patch(`/organizations/${id}`, body)
  invalidate('GET /organizations')
  invalidate(`GET /organizations/${id}/subsidiaries`)
}

/** DELETE /api/organizations/{id} 删除组织 */
export async function deleteOrganization(id: number): Promise<void> {
  await http.delete(`/organizations/${id}`)
  invalidate('GET /organizations')
  invalidate(`GET /organizations/${id}/subsidiaries`)
}

/**
 * GET /api/organizations/{id}/members 分页查询成员（权限 organization.member.read，会话内缓存）。
 * force=true 可绕过缓存（手动刷新）；添加/移除成员时该组织的成员缓存会自动失效。
 */
export async function queryOrgMembers(
  orgId: number,
  params: OrganizationMemberQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<OrganizationMember>> {
  return cachedGet<PaginatedResponse<OrganizationMember>>(
    `/organizations/${orgId}/members`,
    params as Record<string, unknown>,
    { force },
  )
}

/** POST /api/organizations/{id}/members 添加成员 */
export async function addOrgMember(orgId: number, member: OrganizationMember): Promise<void> {
  await http.post(`/organizations/${orgId}/members`, member)
  invalidate(`GET /organizations/${orgId}/members`)
  invalidate(`GET /organizations/users/`)
}

/** DELETE /api/organizations/{id}/members 移除成员（参数在 body） */
export async function removeOrgMember(orgId: number, member: OrganizationMember): Promise<void> {
  await http.delete(`/organizations/${orgId}/members`, { data: member })
  invalidate(`GET /organizations/${orgId}/members`)
  invalidate(`GET /organizations/users/`)
}

/** GET /api/organizations/{id}/subsidiaries 直接下级组织（会话内缓存） */
export async function listSubsidiaries(orgId: number): Promise<OrganizationInfo[]> {
  return cachedGet<OrganizationInfo[]>(`/organizations/${orgId}/subsidiaries`)
}

/** GET /api/organizations/users/{uid} 查询用户的全部组织任职（会话内缓存） */
export async function listUserOrganizations(uid: number): Promise<UserOrganization[]> {
  return cachedGet<UserOrganization[]>(`/organizations/users/${uid}`)
}

