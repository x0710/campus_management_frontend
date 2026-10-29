/**
 * 站内通知接口：
 * - GET    /api/notices                    分页查询当前用户的站内通知
 * - POST   /api/notices                    管理员为指定接收人创建站内通知
 * - GET    /api/notices/unread-count       查询当前用户的未读通知数量
 * - GET    /api/notices/{id}               查询单条通知详情
 * - PATCH  /api/notices/{id}               更新当前用户自己的通知
 * - DELETE /api/notices/{id}               删除当前用户自己的通知
 * - PUT    /api/notices/{id}/read          将通知标记为已读
 * - DELETE /api/notices/{id}/read          将通知标记为未读
 *
 * 通知列表/详情统一走会话缓存；写操作后失效 'GET /notices'（前缀匹配，
 * 同时清除列表、详情及未读数量缓存）。未读数量变化频繁，采用直连请求不缓存。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  Notice,
  NoticeCreateRequest,
  NoticeQuery,
  NoticeUpdateRequest,
} from './types/notices'

/** 缓存失效前缀：命中通知列表与全部详情缓存 */
const NOTICE_CACHE_PREFIX = 'GET /notices'

/**
 * GET /api/notices 分页查询当前用户的站内通知。
 * @param params 查询条件（可选）：page/page_size/category/keyword/is_read/from_at/to_at
 * @param force 是否绕过会话缓存（可选，默认 false；手动刷新传 true）
 * @returns Promise<PaginatedResponse<Notice>> 分页结果
 */
export function queryNotices(
  params: NoticeQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<Notice>> {
  return cachedGet<PaginatedResponse<Notice>>(
    '/notices',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * POST /api/notices 管理员为指定接收人创建站内通知。
 * @param body 创建参数（必填）：user_id/content 必填，category 可选（默认 system）
 * @returns Promise<number> 新建通知 ID
 */
export async function createNotice(body: NoticeCreateRequest): Promise<number> {
  const res = await http.post<number>('/notices', body)
  invalidate(NOTICE_CACHE_PREFIX)
  return res.data
}

/**
 * GET /api/notices/unread-count 查询当前用户的未读通知数量。
 * 后端响应为 text/plain 整数；这里统一转成 number。
 * @returns Promise<number> 未读数量（非负）
 */
export async function getUnreadNoticeCount(): Promise<number> {
  const res = await http.get<number | string>('/notices/unread-count')
  const count = Number(res.data)
  return Number.isFinite(count) ? count : 0
}

/**
 * GET /api/notices/{id} 查询单条通知详情（仅接收人本人可查看）。
 * @param id 通知 ID（必填）
 * @param force 是否绕过会话缓存（可选，默认 false）
 * @returns Promise<Notice> 通知详情
 */
export function getNotice(id: number, force?: boolean): Promise<Notice> {
  return cachedGet<Notice>(`/notices/${id}`, undefined, { force })
}

/**
 * PATCH /api/notices/{id} 更新当前用户自己的通知（未传入字段保持不变）。
 * @param id 通知 ID（必填）
 * @param body 更新参数（必填，字段均可选）：content/category
 * @returns Promise<void> 无返回数据（后端 204）
 */
export async function updateNotice(
  id: number,
  body: NoticeUpdateRequest,
): Promise<void> {
  await http.patch(`/notices/${id}`, body)
  invalidate(NOTICE_CACHE_PREFIX)
}

/**
 * DELETE /api/notices/{id} 删除当前用户自己的通知（同时删除已读记录）。
 * @param id 通知 ID（必填）
 * @returns Promise<void> 无返回数据（后端 204）
 */
export async function deleteNotice(id: number): Promise<void> {
  await http.delete(`/notices/${id}`)
  invalidate(NOTICE_CACHE_PREFIX)
}

/**
 * PUT /api/notices/{id}/read 将当前用户自己的通知标记为已读。
 * @param id 通知 ID（必填）
 * @returns Promise<void> 无返回数据（后端 204）
 */
export async function markNoticeRead(id: number): Promise<void> {
  await http.put(`/notices/${id}/read`)
  invalidate(NOTICE_CACHE_PREFIX)
}

/**
 * DELETE /api/notices/{id}/read 将当前用户自己的通知标记为未读。
 * @param id 通知 ID（必填）
 * @returns Promise<void> 无返回数据（后端 204）
 */
export async function markNoticeUnread(id: number): Promise<void> {
  await http.delete(`/notices/${id}/read`)
  invalidate(NOTICE_CACHE_PREFIX)
}
