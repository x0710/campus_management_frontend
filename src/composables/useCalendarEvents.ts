/**
 * 校历日历数据层（学生端 / 领导端共用）：
 * - 按「当前选中日期所在月份」拉取区间事件（分页聚合 + 会话缓存，见 queryEventsInRange）；
 *   区间向左右各多取若干天，保证月历网格中相邻月份的日期格也能显示事件；
 * - 按类型筛选（可多选：空数组表示全部；仅选 1 个类型时下推后端，多选时本地合并过滤）；
 * - 把事件按天归组（多日事件逐天展开），供月历格子与右侧卡片使用；
 * - 右侧卡片选中日期后直接展示当天全部事件的完整详情：
 *   列表接口不含描述/创建时间，这里按事件 id 并发调用 GET /api/calendars/{id} 补齐（走缓存）；
 * - reload(force) 用于手动刷新与增删改后的强制刷新，同时刷新当日事件详情。
 *
 * 视图层只需消费返回值即可，无需重复实现请求与归组逻辑。
 */
import axios from 'axios'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getEvent,
  queryEventsInRange,
  type CalendarEventDetail,
  type CalendarEventInfo,
  type EventType,
} from '../api/calendars'
import { extractError } from '../api/common'
import { CALENDAR_LOOKBACK_DAYS, CALENDAR_TRAILING_DAYS } from '../config/calendar'

/** 事件类型筛选值：可多选；空数组表示不筛选（全部类型） */
export type CalendarTypeFilter = EventType[]

/** 日期键（本地时区），用于把事件按天归组 */
export const CALENDAR_DAY_KEY = 'YYYY-MM-DD'

/** 归组结果：日期键 → 该日事件列表 */
export type CalendarEventsByDay = Map<string, CalendarEventInfo[]>

/** 稳定的空数组引用：避免无事件日期每次渲染都产生新数组导致副作用重复触发 */
const EMPTY_EVENTS: CalendarEventInfo[] = []

/** 稳定的空详情数组引用（同上） */
const EMPTY_DETAILS: CalendarEventDetail[] = []

/** GET 失败时由视图层判断是否需要提示（401 由拦截器统一处理登录态，这里不回显） */
function isAuthError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401
}

export function useCalendarEvents() {
  /** 选中日期：其所在月份即看板当前展示的月份 */
  const [value, setValue] = useState<Dayjs>(() => dayjs())
  const [typeFilter, setTypeFilter] = useState<CalendarTypeFilter>([])

  /** 后端返回的原始事件列表（未做多类型本地过滤） */
  const [rawEvents, setRawEvents] = useState<CalendarEventInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** 已加载的事件详情：日期键 → 该日全部事件详情（切回同一天可直接复用） */
  const [detailsByDay, setDetailsByDay] = useState<Record<string, CalendarEventDetail[]>>({})
  const [dayDetailsError, setDayDetailsError] = useState<string | null>(null)
  /** 详情请求是否绕过会话缓存（由 reload(true) 置位，单次有效） */
  const detailForceRef = useRef(false)

  const monthKey = value.format('YYYY-MM')
  const dayKey = value.format(CALENDAR_DAY_KEY)
  /** 筛选条件的稳定标识：避免数组引用变化引起无意义的重载 */
  const typeKey = typeFilter.join(',')

  /**
   * 加载当前月份区间的事件（含筛选）。
   * 后端仅支持单类型筛选：只选中 1 个类型时下推给后端，其余情况拉取全部类型后在本地过滤
   * （多选合并展示时无需后端改动，且「全部」与多选命中同一份会话缓存）。
   * force=true 绕过会话缓存（手动刷新 / 增删改后）；相同条件会命中缓存不重复请求。
   */
  const load = useCallback(
    async (force?: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const monthStart = dayjs(`${monthKey}-01`).startOf('month')
        const singleType = typeKey.length > 0 && !typeKey.includes(',') ? (typeKey as EventType) : undefined
        const list = await queryEventsInRange(
          {
            // 向前多取一段时间，覆盖「起始日期在上月但仍在进行中」的跨月事件
            from_date: monthStart
              .subtract(CALENDAR_LOOKBACK_DAYS, 'day')
              .startOf('day')
              .toISOString(),
            // 向后多取若干天，覆盖月历网格中展示的下月日期格（否则下月事件无法显示）
            to_date: monthStart
              .endOf('month')
              .add(CALENDAR_TRAILING_DAYS, 'day')
              .endOf('day')
              .toISOString(),
            ...(singleType ? { event_type: singleType } : {}),
          },
          force,
        )
        setRawEvents(list)
      } catch (err) {
        if (!isAuthError(err)) setError(extractError(err))
      } finally {
        setLoading(false)
      }
    },
    [monthKey, typeKey],
  )

  // 月份或筛选变化时自动加载（相同条件命中缓存，不重复请求）
  useEffect(() => {
    void load()
  }, [load])

  /** 按选中类型过滤后的事件列表（空选 = 不过滤，展示全部类型） */
  const events = useMemo<CalendarEventInfo[]>(() => {
    if (typeFilter.length === 0) return rawEvents
    const selected = new Set<EventType>(typeFilter)
    return rawEvents.filter((event) => selected.has(event.event_type))
  }, [rawEvents, typeFilter])

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
    () => eventsByDay.get(dayKey) ?? EMPTY_EVENTS,
    [eventsByDay, dayKey],
  )

  /**
   * 选中日期变化（或列表刷新）后，补齐当天每个事件的完整详情。
   * 列表接口只返回标题/类型/起止日期，描述与创建时间需逐个请求详情；
   * 请求走会话缓存，同一事件只请求一次；force 由 reload(true) 单次置位。
   */
  useEffect(() => {
    const force = detailForceRef.current
    detailForceRef.current = false
    if (dayEvents.length === 0) return

    let cancelled = false
    void Promise.all(
      dayEvents.map(async (event) => {
        try {
          return { detail: await getEvent(event.id, force), error: null }
        } catch (err) {
          return {
            detail: null,
            error: isAuthError(err) ? null : extractError(err),
          }
        }
      }),
    ).then((results) => {
      if (cancelled) return
      setDetailsByDay((prev) => ({
        ...prev,
        [dayKey]: results
          .map((item) => item.detail)
          .filter((item): item is CalendarEventDetail => item !== null),
      }))
      setDayDetailsError(results.find((item) => item.error)?.error ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [dayEvents, dayKey])

  /**
   * 选中日期当天的事件完整详情：
   * 已加载过的日期直接复用缓存，并过滤掉当天已不存在的事件（如刚被删除），避免展示过期详情。
   */
  const dayDetails = useMemo(() => {
    const cached = detailsByDay[dayKey]
    if (!cached) return EMPTY_DETAILS
    const ids = new Set(dayEvents.map((event) => event.id))
    return cached.filter((item) => ids.has(item.id))
  }, [detailsByDay, dayKey, dayEvents])

  /** 列表加载中、或当天有事件但详情尚未取回时，右侧卡片显示加载态 */
  const dayDetailsLoading = loading || (dayEvents.length > 0 && detailsByDay[dayKey] === undefined)

  /**
   * 切换选中日期 / 月份：月历与右侧卡片都跟随选中日期刷新。
   */
  const changeValue = useCallback((next: Dayjs) => {
    setValue(next)
  }, [])

  /** 手动刷新：强制拉取最新列表（详情随列表刷新自动重取，force 单次生效） */
  const reload = useCallback(
    async (force?: boolean) => {
      detailForceRef.current = force === true
      await load(force)
    },
    [load],
  )

  return {
    /** 选中日期（同时决定看板月份） */
    value,
    setValue: changeValue,
    typeFilter,
    setTypeFilter,
    /** 按天归组的事件（含相邻月份可见日期格），供月历格子渲染 */
    eventsByDay,
    loading,
    error,
    reload,
    /** 选中日期当天的事件完整详情（右侧卡片按此堆叠展示） */
    dayDetails,
    dayDetailsLoading,
    dayDetailsError,
  }
}