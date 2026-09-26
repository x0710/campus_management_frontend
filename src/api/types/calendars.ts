/**
 * 日历模块类型定义：事件类型枚举、列表项/详情、查询参数（分页与区间）与创建/更新请求体。
 * 供 api/calendars.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

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

/** 日历事件分页查询参数 */
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