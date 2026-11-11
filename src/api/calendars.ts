/**
 * 校园日历接口（GET /api/calendars 列表、GET /api/calendars/{id} 详情）。
 * 所有查询走会话缓存 cachedGet：同一查询条件（含页码、筛选、日期区间）只请求一次，
 * 手动刷新时传 force=true 绕过缓存；事件增删改后由调用方 invalidate('GET /calendars') 失效。
 */
import { CALENDAR_PAGE_SIZE_MAX } from '../config/calendar'
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  CalendarCreateRequest,
  CalendarEventDetail,
  CalendarEventInfo,
  CalendarQuery,
  CalendarRangeQuery,
  CalendarUpdateRequest,
} from './types/calendars'

/**
 * GET /api/calendars 分页查询校园日历事件（force=true 绕过会话缓存）
 * @param params 类型：CalendarQuery；默认值：{}；是否必填：可选
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<PaginatedResponse<CalendarEventInfo>>
 */
export function queryEvents(params: CalendarQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<CalendarEventInfo>>(
    '/calendars',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * GET /api/calendars/{id} 获取指定日历事件详情
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<CalendarEventDetail>
 */
export function getEvent(id: number, force?: boolean) {
  return cachedGet<CalendarEventDetail>(`/calendars/${id}`, undefined, { force })
}

/**
 * POST /api/calendars 创建日历事件（权限 calendar.create），返回新事件 ID。
 * 创建后失效全部日历缓存（列表区间与详情），保证下次读取拿到最新数据。
 * @param body 类型：CalendarCreateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<number>
 */
export async function createEvent(body: CalendarCreateRequest): Promise<number> {
  const res = await http.post<number>('/calendars', body)
  invalidate('GET /calendars')
  return res.data
}

/**
 * PATCH /api/calendars/{id} 更新日历事件（权限 calendar.update）
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param body 类型：CalendarUpdateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updateEvent(
  id: number,
  body: CalendarUpdateRequest,
): Promise<void> {
  await http.patch(`/calendars/${id}`, body)
  invalidate('GET /calendars')
}

/**
 * DELETE /api/calendars/{id} 删除日历事件（权限 calendar.delete）
 * @param id 类型：number；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function deleteEvent(id: number): Promise<void> {
  await http.delete(`/calendars/${id}`)
  invalidate('GET /calendars')
}

/**
 * 拉取指定日期区间内的全部日历事件（分页聚合）。
 * 后端 page_size 上限 100，先取第 1 页拿到 total_pages，其余页并行请求后合并，
 * 使日历看板能一次性拿到整个区间的事件；各页命中缓存时不产生额外网络请求。
 * @param range 类型：CalendarRangeQuery；默认值：无；是否必填：必填
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<CalendarEventInfo[]>
 */
export async function queryEventsInRange(
  range: CalendarRangeQuery,
  force?: boolean,
): Promise<CalendarEventInfo[]> {
  const base: CalendarQuery = {
    ...(range.start_date ? { start_date: range.start_date } : {}),
    ...(range.end_date ? { end_date: range.end_date } : {}),
    page_size: CALENDAR_PAGE_SIZE_MAX,
    from_date: range.from_date,
    to_date: range.to_date,
    ...(range.event_type ? { event_type: range.event_type } : {}),
  }
  const first = await queryEvents({ ...base, page: 1 }, force)
  const all = [...first.data]
  const restPages = Math.max(0, (first.total_pages ?? 1) - 1)
  if (restPages > 0) {
    const rest = await Promise.all(
      Array.from({ length: restPages }, (_, i) =>
        queryEvents({ ...base, page: i + 2 }, force),
      ),
    )
    for (const res of rest) all.push(...res.data)
  }
  return all
}