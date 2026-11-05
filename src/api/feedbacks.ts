/**
 * 意见反馈接口（后端 /api/feedbacks）：
 * - GET    /api/feedbacks        分页查询反馈（权限 feedback.read）
 * - GET    /api/feedbacks/{id}   获取反馈详情（权限 feedback.read）
 * - POST   /api/feedbacks        创建反馈（权限 feedback.create，成功 201 返回反馈 ID）
 * - PATCH  /api/feedbacks/{id}   部分更新反馈（权限 feedback.update，成功 204 无 body）
 * - DELETE /api/feedbacks/{id}   删除反馈（权限 feedback.delete，成功 204 无 body）
 *
 * 查询统一走会话缓存 cachedGet；写操作后失效全部反馈缓存，保证列表下一次读取拿到最新数据。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  FeedbackCreateRequest,
  FeedbackDto,
  FeedbackQuery,
  FeedbackUpdateRequest,
} from './types/feedbacks'

/**
 * GET /api/feedbacks 分页查询反馈（force=true 绕过会话缓存）
 * @param params 类型：FeedbackQuery；默认值：{}；是否必填：可选
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<PaginatedResponse<FeedbackDto>>
 */
export function queryFeedbacks(params: FeedbackQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<FeedbackDto>>(
    '/feedbacks',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * GET /api/feedbacks/{id} 获取反馈详情（force=true 绕过会话缓存）
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<FeedbackDto>
 */
export function getFeedback(id: number, force?: boolean) {
  return cachedGet<FeedbackDto>(`/feedbacks/${id}`, undefined, { force })
}

/**
 * POST /api/feedbacks 创建反馈，返回新反馈 ID
 * @param body 类型：FeedbackCreateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<number>
 */
export async function createFeedback(body: FeedbackCreateRequest): Promise<number> {
  const res = await http.post<number>('/feedbacks', body)
  invalidate('GET /feedbacks')
  return res.data
}

/**
 * PATCH /api/feedbacks/{id} 部分更新反馈
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param body 类型：FeedbackUpdateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updateFeedback(
  id: number,
  body: FeedbackUpdateRequest,
): Promise<void> {
  await http.patch(`/feedbacks/${id}`, body)
  invalidate('GET /feedbacks')
}

/**
 * DELETE /api/feedbacks/{id} 删除反馈
 * @param id 类型：number；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function deleteFeedback(id: number): Promise<void> {
  await http.delete(`/feedbacks/${id}`)
  invalidate('GET /feedbacks')
}
