/**
 * 奖学金记录接口（后端 /api/rewardings）：
 * - GET   /api/rewardings        分页查询奖学金记录（权限 rewarding.read）
 * - GET   /api/rewardings/{id}   获取奖学金记录详情（权限 rewarding.read）
 * - POST  /api/rewardings        创建奖学金记录（权限 rewarding.create，成功 201 返回新记录 ID）
 * - PATCH /api/rewardings/{id}   部分更新奖学金记录（权限 rewarding.update，成功 204 无 body）
 * - DELETE /api/rewardings/{id}  删除奖学金记录（权限 rewarding.delete，成功 204 无 body）
 *
 * 查询统一走会话缓存 cachedGet：相同查询条件只请求一次，手动刷新传 force=true 绕过缓存。
 * 写操作（创建/更新/删除）后失效全部奖学金缓存，保证下次读取拿到最新数据。
 *
 * 注意：金额字段 amount_cents 单位为「分」（后端 int64），展示时需除以 100；
 * uid 为学号/用户 ID（后端 int64）。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  RewardingCreateRequest,
  RewardingDto,
  RewardingQuery,
  RewardingUpdateRequest,
} from './types/rewardings'

/** GET /api/rewardings 分页查询奖学金记录（force=true 绕过会话缓存） */
export function queryRewardings(params: RewardingQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<RewardingDto>>(
    '/rewardings',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/rewardings/{id} 获取奖学金记录详情（force=true 绕过会话缓存） */
export function getRewarding(id: number, force?: boolean) {
  return cachedGet<RewardingDto>(`/rewardings/${id}`, undefined, { force })
}

/** POST /api/rewardings 创建奖学金记录，返回新记录 ID */
export async function createRewarding(body: RewardingCreateRequest): Promise<number> {
  const res = await http.post<number>('/rewardings', body)
  invalidate('GET /rewardings')
  return res.data
}

/** PATCH /api/rewardings/{id} 部分更新奖学金记录 */
export async function updateRewarding(
  id: number,
  body: RewardingUpdateRequest,
): Promise<void> {
  await http.patch(`/rewardings/${id}`, body)
  invalidate('GET /rewardings')
}

/** DELETE /api/rewardings/{id} 删除奖学金记录 */
export async function deleteRewarding(id: number): Promise<void> {
  await http.delete(`/rewardings/${id}`)
  invalidate('GET /rewardings')
}
