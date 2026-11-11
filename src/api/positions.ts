/** 职位模块, 提供职位查询与增删改 API */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import { listAllOrganizations } from './organizations'
import { collectOrgSubtree } from '../utils/orgTree'
import type { CreatedDateQuery, PaginatedResponse } from './types/common'
import type {
  PositionCreateRequest,
  PositionDetail,
  PositionQuery,
  PositionUpdateRequest,
  UserPosition,
} from './types/positions'

/**
 * GET /api/positions 分页查询职位（会话内缓存；force=true 手动刷新绕过缓存）
 * @param params 类型：PositionQuery；默认值：{}；是否必填：可选
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<PaginatedResponse<PositionDetail>>
 */
export async function queryPositions(
  params: PositionQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<PositionDetail>> {
  return cachedGet<PaginatedResponse<PositionDetail>>(
    '/positions',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * 拉取全部职位（分页接口循环取完），供「职位编码 → 职位名称」映射使用；
 * force=true 整体绕过缓存。返回值为职位详情数组（可能为空）。
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @param params 类型：PositionQuery；默认值：{}；是否必填：可选
 * @returns 类型：Promise<PositionDetail[]>
 */
export async function listAllPositions(force?: boolean, params: PositionQuery = {}): Promise<PositionDetail[]> {
  const pageSize = 100
  const all: PositionDetail[] = []
  for (let page = 1; ; page += 1) {
    const res = await queryPositions({ ...params, page, page_size: pageSize }, force)
    all.push(...res.data)
    if (page * pageSize >= res.total || res.data.length === 0) break
  }
  return all
}

/**
 * 前端按组织子树限定职位列表：聚合全部匹配职位后过滤、分页，避免只过滤当前页而漏项。
 * 仅用于指定组织根的门户，普通管理员列表仍走后端分页接口。
 */
export async function queryPositionsInOrganizationSubtree(
  rootOrgId: number,
  params: PositionQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<PositionDetail>> {
  const { page = 1, page_size: pageSize = 100, ...filters } = params
  const [organizations, positions] = await Promise.all([
    listAllOrganizations(force),
    listAllPositions(force, filters),
  ])
  const organizationIds = new Set(collectOrgSubtree(organizations, rootOrgId).map((org) => org.id))
  const scoped = positions.filter((position) => organizationIds.has(position.organization_id))
  const totalPages = Math.ceil(scoped.length / pageSize)
  const currentPage = Math.max(1, Math.min(page, totalPages || 1))
  return {
    data: scoped.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    total: scoped.length,
    page: currentPage,
    page_size: pageSize,
    total_pages: totalPages,
  }
}

/**
 * GET /api/positions/{code} 查询职位详情（会话内缓存）。
 * @param code 职位编码（必填）
 * @param force 是否绕过会话缓存强制重新请求（默认 false；职位变更后刷新展示时传 true）
 * @returns Promise<PositionDetail> 职位详情
 */
export function getPosition(code: string, force?: boolean): Promise<PositionDetail> {
  return cachedGet<PositionDetail>(`/positions/${code}`, undefined, { force })
}

/**
 * POST /api/positions 创建职位，返回新职位 code（后端响应体为纯字符串）
 * @param body 类型：PositionCreateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<string>
 */
export async function createPosition(body: PositionCreateRequest): Promise<string> {
  const res = await http.post<string>('/positions', body)
  invalidate('GET /positions')
  invalidate('GET /user-positions')
  return res.data
}

/**
 * PATCH /api/positions/{code} 更新职位（code 不可改；description 省略表示保留原值，传空字符串表示清空）
 * @param code 类型：string；默认值：无；是否必填：必填
 * @param body 类型：PositionUpdateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updatePosition(code: string, body: PositionUpdateRequest): Promise<void> {
  await http.patch(`/positions/${code}`, body)
  invalidate('GET /positions')
  invalidate('GET /user-positions')
}

/**
 * DELETE /api/positions/{code} 删除职位
 * @param code 类型：string；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function deletePosition(code: string): Promise<void> {
  await http.delete(`/positions/${code}`)
  invalidate('GET /positions')
  invalidate('GET /user-positions')
}

/**
 * GET /api/user-positions?uids=1,2,3 查询用户职位（会话内缓存）。
 * 只查询本人无需额外权限；包含他人时要求 user.position.read。
 * @param uids 用户 ID 数组（必填；为空时直接返回空数组，不发请求）
 * @param force 是否绕过会话缓存（手动刷新）
 * @returns 类型：Promise<UserPosition[]>
 */
export function queryUserPositions(
  uids: number[],
  force?: boolean,
  dates: CreatedDateQuery = {},
): Promise<UserPosition[]> {
  if (uids.length === 0) return Promise.resolve([])
  return cachedGet<UserPosition[]>(
    '/user-positions',
    { uids: uids.join(','), ...dates },
    { force },
  )
}
