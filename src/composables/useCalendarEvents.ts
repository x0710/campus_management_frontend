/**
 * 校历日历数据层（学生端 / 领导端共用）：
 * - 按「当前选中日期所在月份」拉取区间事件（分页聚合 + 会话缓存，见 queryEventsInRange）；
 * - 按类型筛选（'all' 表示不筛选）；
 * - 把事件按天归组（多日事件逐天展开），供月历格子与「当日事件」列表使用；
 * - 事件详情（GET /api/calendars/{id}）也在此统一管理（走缓存），供右侧卡片内联展示；
 * - reload(force) 用于手动刷新与增删改后的强制刷新，同时刷新已打开的事件详情。
 *
 * 视图层只需消费返回值即可，无需重复实现请求与归组逻辑。
 */
import axios from 'axios'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getEvent,
  queryEventsInRange,
  type CalendarEventDetail,
  type CalendarEventInfo,
  type EventType,
} from '../api/calendars'
import { extractError } from '../api/common'
import { CALENDAR_LOOKBACK_DAYS } from '../config/calendar'

/** 事件类型筛选值：'all' 表示不筛选 */
export type CalendarTypeFilter = 'all' | EventType

/** 日期键（本地时区），用于把事件按天归组 */
export const CALENDAR_DAY_KEY = 'YYYY-MM-DD'

/** 归组结果：日期键 → 该日事件列表 */
export type CalendarEventsByDay = Map<string, CalendarEventInfo[]>

/** GET 失败时由视图层判断是否需要提示（401 由拦截器统一处理登录态，这里不回显） */
function isAuthError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401
}

export function useCalendarEvents() {
  /** 选中日期：其所在月份即看板当前展示的月份 */
  const [value, setValue] = useState<Dayjs>(() => dayjs())
  const [typeFilter, setTypeFilter] = useState<CalendarTypeFilter>('all')

  const [events, setEvents] = useState<CalendarEventInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** 右侧卡片内联展示的事件详情 */
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<CalendarEventDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const monthKey = value.format('YYYY-MM')
  const dayKey = value.format(CALENDAR_DAY_KEY)

  /**
   * 加载当前月份区间的事件（含筛选）。
   * force=true 绕过会话缓存（手动刷新 / 增删改后）；相同条件会命中缓存不重复请求。
   */
  const load = useCallback(
    async (force?: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const monthStart = dayjs(`${monthKey}-01`).startOf('month')
        const list = await queryEventsInRange(
          {
            // 向前多取一段时间，覆盖「起始日期在上月但仍在进行中」的跨月事件
            from_date: monthStart
              .subtract(CALENDAR_LOOKBACK_DAYS, 'day')
              .startOf('day')
              .toISOString(),
            to_date: monthStart.endOf('month').toISOString(),
            ...(typeFilter === 'all' ? {} : { event_type: typeFilter }),
          },
          force,
        )
        setEvents(list)
      } catch (err) {
        if (!isAuthError(err)) setError(extractError(err))
      } finally {
        setLoading(false)
      }
    },
    [monthKey, typeFilter],
  )

  // 月份或筛选变化时自动加载（相同条件命中缓存，不重复请求）
  useEffect(() => {
    void load()
  }, [load])

  /** 日期 → 当日事件（多日事件逐天展开；异常区间仅落在起始日） */
  const eventsByDay = useMemo<CalendarEventsByDay>(() => {
    const map: CalendarEventsByDay = new Map()
    for (const event of events) {
      const start = dayjs(event.start_date).startOf('day')
      const end = dayjs(event.end_date).startOf('day')
      let cursor = start
      let guard = 0
      while (!cursor.isAfter(end) && guard < 366) {
        const key = cursor.format(CALENDAR_DAY_KEY)
        const list = map.get(key)
        if (list) list.push(event)
        else map.set(key, [event])
        cursor = cursor.add(1, 'day')
        guard += 1
      }
    }
    return map
  }, [events])

  const dayEvents = useMemo(
    () => eventsByDay.get(dayKey) ?? [],
    [eventsByDay, dayKey],
  )

  /**
   * 拉取并展示事件详情（走缓存），返回详情供调用方（如表单回填）使用；
   * 失败时返回 null 并记录状态码文案，由视图层弹窗提示。
   */
  const openDetail = useCallback(
    async (id: number, force?: boolean): Promise<CalendarEventDetail | null> => {
      setDetailId(id)
      setDetail(null)
      setDetailError(null)
      setDetailLoading(true)
      try {
        const data = await getEvent(id, force)
        setDetail(data)
        return data
      } catch (err) {
        if (!isAuthError(err)) setDetailError(extractError(err))
        setDetailId(null)
        return null
      } finally {
        setDetailLoading(false)
      }
    },
    [],
  )

  /** 关闭详情，回到「当日事件」列表 */
  const closeDetail = useCallback(() => {
    setDetailId(null)
    setDetail(null)
    setDetailError(null)
  }, [])

  /**
   * 切换选中日期 / 月份：同时退出详情态。
   * 详情只针对某个具体事件，换了日期就不应继续停留在详情上。
   */
  const changeValue = useCallback(
    (next: Dayjs) => {
      setValue(next)
      closeDetail()
    },
    [closeDetail],
  )

  /** 手动刷新：强制拉取最新列表，并同步刷新已打开的事件详情 */
  const reload = useCallback(
    async (force?: boolean) => {
      await load(force)
      if (detailId !== null) {
        await openDetail(detailId, force)
      }
    },
    [load, detailId, openDetail],
  )

  return {
    /** 选中日期（同时决定看板月份） */
    value,
    setValue: changeValue,
    typeFilter,
    setTypeFilter,
    /** 当前月份区间内的事件（已按筛选过滤） */
    events,
    eventsByDay,
    dayEvents,
    loading,
    error,
    reload,
    /** 仅刷新事件列表（详情已关闭或不需要联动时使用，避免对已删除事件重复请求） */
    reloadList: load,
    /** 详情态：detailId 非空表示右侧卡片处于详情展示模式 */
    detailId,
    detail,
    detailLoading,
    detailError,
    openDetail,
    closeDetail,
  }
}