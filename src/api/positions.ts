/** 职位模块, 提供职位查询与增删改 API */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  PositionCreateRequest,
  PositionDetail,
  PositionQuery,
  PositionUpdateRequest,
  UserPosition,
} from './types/positions'

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

/**
 * 拉取全部职位（分页接口循环取完），供「职位编码 → 职位名称」映射使用；
 * force=true 整体绕过缓存。返回值为职位详情数组（可能为空）。
 */
export async function listAllPositions(force?: boolean): Promise<PositionDetail[]> {
  const pageSize = 100
  const all: PositionDetail[] = []
  for (let page = 1; ; page += 1) {
    const res = await queryPositions({ page, page_size: pageSize }, force)
    all.push(...res.data)
    if (page >= res.total_pages) break
  }
  return all
}

/** GET /api/positions/{code} 查询职位详情（会话内缓存） */
export async function getPosition(code: string): Promise<PositionDetail> {
  return cachedGet<PositionDetail>(`/positions/${code}`)
}

/** POST /api/positions 创建职位，返回新职位 code（后端响应体为纯字符串） */
export async function createPosition(body: PositionCreateRequest): Promise<string> {
  const res = await http.post<string>('/positions', body)
  invalidate('GET /positions')
  invalidate('GET /user-positions')
  return res.data
}

/** PATCH /api/positions/{code} 更新职位（code 不可改；description 省略表示保留原值） */
export async function updatePosition(code: string, body: PositionUpdateRequest): Promise<void> {
  await http.patch(`/positions/${code}`, body)
  invalidate('GET /positions')
  invalidate('GET /user-positions')
}

/** DELETE /api/positions/{code} 删除职位 */
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
 */
export function queryUserPositions(
  uids: number[],
  force?: boolean,
): Promise<UserPosition[]> {
  if (uids.length === 0) return Promise.resolve([])
  return cachedGet<UserPosition[]>(
    '/user-positions',
    { uids: uids.join(',') },
    { force },
  )
}
