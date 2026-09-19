/**
 * 校历日历常量集中定义（ai 要求：常量统一放 config/，供日历看板、筛选等视图复用）。
 * 文案走 i18n（calendar.type_*），这里仅放配色、枚举顺序与分页/展示相关的数值。
 */
import type { EventType } from '../api/calendars'

/** 事件类型 → Tag 配色（夜间模式下 antd Tag 自动适配） */
export const CALENDAR_EVENT_COLOR: Record<EventType, string> = {
  holiday: 'blue',
  exam: 'red',
  activity: 'green',
  other: 'default',
}

/** 事件类型枚举顺序（筛选下拉选项） */
export const CALENDAR_EVENT_TYPES: EventType[] = ['holiday', 'exam', 'activity', 'other']

/** 列表接口单页最大条数（后端 page_size 上限 100，区间聚合时按此分页） */
export const CALENDAR_PAGE_SIZE_MAX = 100

/** 月份区间查询向前多取的天数：覆盖「起始日期在上月、但仍在进行中」的跨月事件 */
export const CALENDAR_LOOKBACK_DAYS = 31

/**
 * 月份区间查询向后多取的天数：月历网格最多展示 6 行 × 7 列 = 42 格，
 * 当 28 天的月份从周日开始时，末行可延伸到下月第 14 天，
 * 因此向后多取 14 天即可覆盖网格中所有下月日期格的事件。
 */
export const CALENDAR_TRAILING_DAYS = 14

/** 单个日期格内最多直接展示的事件条数，超出折叠为「+N」 */
export const CALENDAR_MAX_CELL_EVENTS = 3