/**
 * 违规记录接口（后端 campus-violation）：
 * - GET    /api/violations        分页查询违规记录（权限 violation.read）
 * - GET    /api/violations/{id}   获取违规记录详情（权限 violation.read）
 * - POST   /api/violations        创建违规记录（权限 violation.create，返回 { id }）
 * - PATCH  /api/violations/{id}   部分更新违规记录（权限 violation.update，成功 204 无 body）
 * - DELETE /api/violations/{id}   删除违规记录（权限 violation.delete，成功 204 无 body）
 *
 * 查询统一走会话缓存 cachedGet：相同查询条件只请求一次，手动刷新传 force=true 绕过缓存。
 * 注意：severity 后端以 camelCase 序列化，JSON 中为小写字符串 low|medium|high|critical。
 * 更新请求中未提供的字段保持原值（Option 语义），occurred_at 为 RFC3339 字符串。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  ViolationCreateRequest,
  ViolationCreatedResponse,
  ViolationDto,
  ViolationQuery,
  ViolationUpdateRequest,
} from './types/violations'

/**
 * GET /api/violations 分页查询违规记录（force=true 绕过会话缓存）
 * @param params 类型：ViolationQuery；默认值：{}；是否必填：可选
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<PaginatedResponse<ViolationDto>>
 */
export function queryViolations(params: ViolationQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<ViolationDto>>(
    '/violations',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * GET /api/violations/{id} 获取违规记录详情（force=true 绕过会话缓存）
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<ViolationDto>
 */
export function getViolation(id: number, force?: boolean) {
  return cachedGet<ViolationDto>(`/violations/${id}`, undefined, { force })
}

/**
 * POST /api/violations 创建违规记录，成功后失效列表缓存。
 * @param body 违规记录创建请求（必填）
 * @returns Promise<number> 新记录 ID
 */
export async function createViolation(body: ViolationCreateRequest): Promise<number> {
  const res = await http.post<ViolationCreatedResponse>('/violations', body)
  invalidate('GET /violations')
  return res.data.id
}

/**
 * PATCH /api/violations/{id} 部分更新违规记录，成功后失效列表缓存
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param body 类型：ViolationUpdateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updateViolation(id: number, body: ViolationUpdateRequest): Promise<void> {
  await http.patch(`/violations/${id}`, body)
  invalidate('GET /violations')
}

/**
 * DELETE /api/violations/{id} 删除违规记录，成功后失效列表与详情缓存。
 * @param id 违规记录 ID（必填）
 * @returns Promise<void>
 */
export async function deleteViolation(id: number): Promise<void> {
  await http.delete(`/violations/${id}`)
  invalidate('GET /violations')
}
