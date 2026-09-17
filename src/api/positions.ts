import { cachedGet } from './cache'
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

/** GET /api/positions 分页查询职位（会话内缓存） */
export async function queryPositions(
  params: PositionQuery = {},
): Promise<PaginatedResponse<PositionDetail>> {
  return cachedGet<PaginatedResponse<PositionDetail>>('/positions', params as Record<string, unknown>)
}

/** GET /api/positions/management{code} 查询职位详情（会话内缓存） */
export async function getPosition(code: string): Promise<PositionDetail> {
  return cachedGet<PositionDetail>(`/positions/management/${code}`)
}
