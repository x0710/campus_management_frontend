/**
 * 校园日历接口（GET /api/calendars 列表、GET /api/calendars/{id} 详情）。
 * 所有查询走会话缓存 cachedGet：同一查询条件（含页码、筛选、日期区间）只请求一次，
 * 手动刷新时传 force=true 绕过缓存；事件增删改后由调用方 invalidate('GET /calendars') 失效。
 */
import { CALENDAR_PAGE_SIZE_MAX } from '../config/calendar'
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PageQuery, PaginatedResponse } from './common'

/** 日历事件类型（api.json: EventType） */
export type EventType = 'holiday' | 'exam' | 'activity' | 'other'

/** 日历事件列表项（api.json: CalendarEventInfo） */
export interface CalendarEventInfo {
  id: number
  start_date: string
  end_date: string
  title: string
  event_type: EventType
}

/** 日历事件详情（api.json: CalendarEventDetail） */
export interface CalendarEventDetail extends CalendarEventInfo {
  description: string | null  
  created_at: string
}

export interface CalendarQuery extends PageQuery {
  event_type?: EventType
  from_date?: string
  to_date?: string
  keyword?: string
}

/** 日期区间查询条件（用于按月/按自定义区间拉取全部事件） */
export interface CalendarRangeQuery {
  /** 起始日期下界（含，RFC3339） */
  from_date: string
  /** 起始日期上界（含，RFC3339） */
  to_date: string
  event_type?: EventType
}

/** GET /api/calendars 分页查询校园日历事件（force=true 绕过会话缓存） */
export function queryEvents(params: CalendarQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<CalendarEventInfo>>(
    '/calendars',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/calendars/{id} 获取指定日历事件详情 */
export function getEvent(id: number, force?: boolean) {
  return cachedGet<CalendarEventDetail>(`/calendars/${id}`, undefined, { force })
}

/** 创建日历事件请求体（POST /api/calendars） */
export interface CalendarCreateRequest {
  start_date: string
  end_date: string
  title: string
  event_type: EventType
  description?: string | null
}

/** 更新日历事件请求体（PATCH /api/calendars/{id}，字段均可选） */
export interface CalendarUpdateRequest {
  start_date?: string
  end_date?: string
  title?: string
  event_type?: EventType
  description?: string | null
}

/**
 * POST /api/calendars 创建日历事件（权限 calendar.create），返回新事件 ID。
 * 创建后失效全部日历缓存（列表区间与详情），保证下次读取拿到最新数据。
 */
export async function createEvent(body: CalendarCreateRequest): Promise<number> {
  const res = await http.post<number>('/calendars', body)
  invalidate('GET /calendars')
  return res.data
}

/** PATCH /api/calendars/{id} 更新日历事件（权限 calendar.update） */
export async function updateEvent(
  id: number,
  body: CalendarUpdateRequest,
): Promise<void> {
  await http.patch(`/calendars/${id}`, body)
  invalidate('GET /calendars')
}

/** DELETE /api/calendars/{id} 删除日历事件（权限 calendar.delete） */
export async function deleteEvent(id: number): Promise<void> {
  await http.delete(`/calendars/${id}`)
  invalidate('GET /calendars')
}

/**
 * 拉取指定日期区间内的全部日历事件（分页聚合）。
 * 后端 page_size 上限 100，先取第 1 页拿到 total_pages，其余页并行请求后合并，
 * 使日历看板能一次性拿到整个区间的事件；各页命中缓存时不产生额外网络请求。
 */
export async function queryEventsInRange(
  range: CalendarRangeQuery,
  force?: boolean,
): Promise<CalendarEventInfo[]> {
  const base: CalendarQuery = {
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