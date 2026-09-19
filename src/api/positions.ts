import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse, PageQuery } from './common'

/** 职位（api.json: PositionDetailDto，code 为主键） */
export interface PositionDetail {
  code: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface PositionQuery extends PageQuery {
  keyword?: string
}

/** 职位创建请求体（code 由前端指定，创建后不可修改） */
export interface PositionCreateRequest {
  code: string
  name: string
  description?: string
}

/**
 * 职位更新请求体（code 为主键不可改）。
 * 注意：后端将 description: None 视为「保留原值」，因此清空描述无法通过本接口实现，
 * 空值时应省略该字段（见 updatePosition 调用方）。
 */
export interface PositionUpdateRequest {
  name?: string
  description?: string
}

/** GET /api/positions 分页查询职位（会话内缓存；force=true 手动刷新绕过缓存） */
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

/** GET /api/positions/management/{code} 查询职位详情（会话内缓存） */
export async function getPosition(code: string): Promise<PositionDetail> {
  return cachedGet<PositionDetail>(`/positions/management/${code}`)
}

/** POST /api/positions 创建职位，返回新职位 code（后端响应体为纯字符串） */
export async function createPosition(body: PositionCreateRequest): Promise<string> {
  const res = await http.post<string>('/positions', body)
  invalidate('GET /positions')
  return res.data
}

/** PATCH /api/positions/management/{code} 更新职位（code 不可改；description 省略表示保留原值） */
export async function updatePosition(code: string, body: PositionUpdateRequest): Promise<void> {
  await http.patch(`/positions/management/${code}`, body)
  invalidate('GET /positions')
}

/** DELETE /api/positions/management/{code} 删除职位 */
export async function deletePosition(code: string): Promise<void> {
  await http.delete(`/positions/management/${code}`)
  invalidate('GET /positions')
}
