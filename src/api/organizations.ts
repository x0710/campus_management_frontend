/** 组织模块, 提供组织、组织成员与用户任职相关 API */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import { BATCH_REQUEST_TIMEOUT_MS } from '../config/http'
import { ORGANIZATION_MEMBER_COUNT_BATCH_SIZE } from '../config/organization'
import type { PaginatedResponse } from './types/common'
import type {
  MemberBatchCreate,
  MemberBatchDelete,
  OrganizationInfo,
  OrganizationMember,
  OrganizationMemberCountInclude,
  OrganizationMemberCountItem,
  OrganizationMemberCountRequest,
  OrganizationMemberInput,
  OrganizationMemberQuery,
  OrganizationQuery,
  OrganizationTreeNode,
  UserOrganization,
  WorkplaceUpdateRequest,
} from './types/organizations'

/**
 * GET /api/organizations 分页查询组织（会话内缓存；force=true 手动刷新绕过缓存）
 * @param params 类型：OrganizationQuery；默认值：{}；是否必填：可选
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<PaginatedResponse<OrganizationInfo>>
 */
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

/**
 * GET /api/organizations/{id} 查询单个组织详情（会话内缓存）。
 * @param id 组织 ID（必填）
 * @param force 是否绕过缓存；默认 false
 * @returns Promise<OrganizationInfo>
 */
export function getOrganization(id: number, force?: boolean): Promise<OrganizationInfo> {
  return cachedGet<OrganizationInfo>(`/organizations/${id}`, undefined, { force })
}

/**
 * 拉取全部组织（分页接口循环取完），供组织树使用；force=true 整体绕过缓存
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<OrganizationInfo[]>
 */
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

/**
 * POST /api/organizations 新建组织
 * @param body 类型：{ code: string name: string parent_id?: number | null }；默认值：无；是否必填：必填
 * @returns 类型：Promise<number>
 */
export async function createOrganization(body: {
  code: string
  name: string
  parent_id?: number | null
}): Promise<number> {
  const res = await http.post<number>('/organizations', body)
  invalidate('GET /organizations')
  return res.data
}

/**
 * PATCH /api/organizations/{id} 更新组织
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param body 类型：{ code?: string; name?: string; parent_id?: number | null }；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updateOrganization(
  id: number,
  body: { code?: string; name?: string; parent_id?: number | null },
): Promise<void> {
  await http.patch(`/organizations/${id}`, body)
  invalidate('GET /organizations')
  invalidate(`GET /organizations/${id}/subsidiaries`)
}

/**
 * DELETE /api/organizations/{id} 删除组织
 * @param id 类型：number；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function deleteOrganization(id: number): Promise<void> {
  await http.delete(`/organizations/${id}`)
  invalidate('GET /organizations')
  invalidate(`GET /organizations/${id}/subsidiaries`)
}

/**
 * GET /api/organizations/{id}/members 分页查询成员（权限 organization.member.read，会话内缓存）。
 * force=true 可绕过缓存（手动刷新）；添加/移除成员时该组织的成员缓存会自动失效。
 * @param orgId 类型：number；默认值：无；是否必填：必填
 * @param params 类型：OrganizationMemberQuery；默认值：{}；是否必填：可选
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<PaginatedResponse<OrganizationMember>>
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

/**
 * POST /api/organizations/member-counts 批量统计组织成员人数（取代旧的
 * GET /api/organizations/{org_id}/member-counts，旧接口已下线）。
 *
 * 请求体为 1～100 项条件数组，每项必须包含 org_id；可选 position（职位编码，精确匹配，
 * 不可为空字符串）与 recursive（是否包含可访问的子组织，默认 false）。响应与请求逐项
 * 对应且顺序一致，member_count 按用户 ID 去重（跨组织任职也只计一次），不存在的组织 /
 * 职位或无匹配成员返回 0；任何一项超出数据范围时整批返回 403。
 * 人数需实时，故不走会话缓存；条件为空时直接返回空数组，不发请求。
 *
 * @param requests 统计条件数组（必填，超过单批上限时自动分批请求）
 * @param include 需要额外返回的信息（可选；ethnic / gender / organization_name / personnel，
 *   去重后按逗号拼接为查询参数，统一作用于本批所有条件）
 * @returns Promise<OrganizationMemberCountItem[]> 与 requests 顺序一致的统计结果
 */
export async function queryOrganizationMemberCounts(
  requests: OrganizationMemberCountRequest[],
  include?: readonly OrganizationMemberCountInclude[],
): Promise<OrganizationMemberCountItem[]> {
  const includeParam = include?.length ? [...new Set(include)].join(',') : undefined

  const results: OrganizationMemberCountItem[] = []
  for (let start = 0; start < requests.length; start += ORGANIZATION_MEMBER_COUNT_BATCH_SIZE) {
    const chunk = requests.slice(start, start + ORGANIZATION_MEMBER_COUNT_BATCH_SIZE)
    const res = await http.post<OrganizationMemberCountItem[]>(
      '/organizations/member-counts',
      chunk,
      includeParam === undefined ? undefined : { params: { include: includeParam } },
    )
    results.push(...(res.data ?? []))
  }
  return results
}

/**
 * 统计单个条件的人数：POST /api/organizations/member-counts 批量接口的单项调用。
 * @param request 统计条件（必填）
 * @param include 需要额外返回的信息（可选；仅返回人数时可省略）
 * @returns 按用户 ID 去重后的人数（无匹配成员时返回 0）
 */
export async function countOrganizationMembers(
  request: OrganizationMemberCountRequest,
  include?: readonly OrganizationMemberCountInclude[],
): Promise<number> {
  const [item] = await queryOrganizationMemberCounts([request], include)
  return item?.member_count ?? 0
}

/**
 * POST /api/organizations/{id}/members 添加成员，返回新成员记录
 * @param orgId 类型：number；默认值：无；是否必填：必填
 * @param member 类型：OrganizationMemberInput；默认值：无；是否必填：必填
 * @param signal 取消信号（可选）
 * @returns 类型：Promise<OrganizationMember>
 */
export async function addOrgMember(
  orgId: number,
  member: OrganizationMemberInput,
  signal?: AbortSignal,
): Promise<OrganizationMember> {
  const res = await http.post<OrganizationMember>(
    `/organizations/${orgId}/members`,
    member,
    { signal },
  )
  invalidate(`GET /organizations/${orgId}/members`)
  invalidate('GET /organization-members')
  return res.data
}

/**
 * POST /api/organization-members 批量添加任职（非空数组，整批事务）。
 * @param body 类型：MemberBatchCreate[]；默认值：无；是否必填：必填
 * @param signal 取消信号（可选）
 * @returns 类型：Promise<void>
 */
export async function addOrgMembers(
  body: MemberBatchCreate[],
  signal?: AbortSignal,
): Promise<void> {
  await http.post('/organization-members', body, {
    signal,
    timeout: BATCH_REQUEST_TIMEOUT_MS,
  })
  invalidate('GET /organization-members')
  invalidate('GET /organizations')
}

/**
 * DELETE /api/organizations/{id}/members/{member_id} 按成员记录 id 移除成员
 * @param orgId 类型：number；默认值：无；是否必填：必填
 * @param memberId 类型：number；默认值：无；是否必填：必填
 * @param signal 取消信号（可选）
 * @returns 类型：Promise<void>
 */
export async function removeOrgMember(
  orgId: number,
  memberId: number,
  signal?: AbortSignal,
): Promise<void> {
  await http.delete(`/organizations/${orgId}/members/${memberId}`, { signal })
  invalidate(`GET /organizations/${orgId}/members`)
  invalidate('GET /organization-members')
}

/**
 * DELETE /api/organization-members 批量删除任职（非空数组，任一记录不存在整批回滚）。
 * @param body 类型：MemberBatchDelete[]；默认值：无；是否必填：必填
 * @param signal 取消信号（可选）
 * @returns 类型：Promise<void>
 */
export async function removeOrgMembers(
  body: MemberBatchDelete[],
  signal?: AbortSignal,
): Promise<void> {
  await http.delete('/organization-members', {
    data: body,
    signal,
    timeout: BATCH_REQUEST_TIMEOUT_MS,
  })
  invalidate('GET /organization-members')
  invalidate('GET /organizations')
}

/**
 * GET /api/organizations/{id}/subsidiaries 直接下级组织（会话内缓存）
 * @param orgId 类型：number；默认值：无；是否必填：必填
 * @returns 类型：Promise<OrganizationInfo[]>
 */
export async function listSubsidiaries(orgId: number): Promise<OrganizationInfo[]> {
  return cachedGet<OrganizationInfo[]>(`/organizations/${orgId}/subsidiaries`)
}

/**
 * GET /api/organizations/{id}/tree 组织树链路（会话内缓存）。
 * 返回「根组织 → 该组织」的完整链路，链上最后一项的 level 为 0、越靠根越大，
 * 因此链路深度（上级组织数量）= 链条数 - 1 = 根节点的 level，用于判定该组织是否为支部。
 * @param orgId 类型：number；默认值：无；是否必填：必填
 * @returns 类型：Promise<OrganizationTreeNode[]>
 */
export async function getOrganizationTree(orgId: number): Promise<OrganizationTreeNode[]> {
  return cachedGet<OrganizationTreeNode[]>(`/organizations/${orgId}/tree`)
}

/**
 * GET /api/organization-members?uids=... 批量查询多个用户的全部组织任职（会话内缓存）。
 *
 * @param uids 用户 ID 数组（必填；为空时直接返回空数组，不发请求）
 * @param force 是否绕过会话缓存（可选，默认 false；手动刷新时传 true）
 * @returns 任职记录数组（可能为空；同一用户有多个任职会返回多条）
 */
export async function listUserOrganizationsBatch(
  uids: number[],
  force?: boolean,
): Promise<UserOrganization[]> {
  if (uids.length === 0) return []
  return cachedGet<UserOrganization[]>(
    '/organization-members',
    { uids: uids.join(',') },
    { force },
  )
}

/**
 * GET /api/organization-members?uids={uid} 查询单个用户的全部组织任职（会话内缓存）。
 * @param uid 用户 ID（必填）
 * @param force 是否绕过会话缓存强制重新请求（默认 false；任职变更后刷新展示时传 true）
 * @returns Promise<UserOrganization[]> 任职记录数组
 */
export function listUserOrganizations(uid: number, force?: boolean): Promise<UserOrganization[]> {
  return listUserOrganizationsBatch([uid], force)
}

/**
 * 修改任职工作地点；本人仅需登录，他人需 organization.member.update 及相应数据范围。
 * @param memberId 类型：number；默认值：无；是否必填：必填
 * @param workplace 类型：string | null；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updateMemberWorkplace(
  memberId: number,
  workplace: string | null,
): Promise<void> {
  const body: WorkplaceUpdateRequest = { workplace }
  await http.patch(`/organization-members/${memberId}/workplace`, body)
  invalidate('GET /organization-members')
  invalidate('GET /organizations')
  invalidate('GET /user-positions')
}

