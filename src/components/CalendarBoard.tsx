/**
 * 校历日历看板（学生端 / 领导端共用，纯展示组件）：
 * - 左侧：月历看板，工具栏含「上一月 / 今天 / 下一月 / 月份选择 / 刷新 / 事件类型筛选」，
 *   日期格内按天展示事件条（多日事件逐天展开），超出折叠为「+N」；
 *   相邻月份的日期格同样展示事件（数据层已把查询区间向后多取若干天）；
 * - 右侧卡片：选中日期后**直接堆叠展示当天全部事件的完整详情**
 *   （名称、类型、时间范围、描述、创建时间），某天有多个事件时上下堆叠，无需先点事件；
 *   卡片头部下方常驻「倒计时」条，展示选中日期距今天的天数（未来/今天/过去三态），
 *   与当天是否有事件无关；
 * - 通过 toolbarExtra（工具栏右侧插槽）与 renderEventActions（每个事件的操作插槽）
 *   让领导端挂载「新增 / 编辑 / 删除」，学生端不传即为只读；
 * - 数据与详情请求由 useCalendarEvents 提供，本组件只负责渲染与交互。
 * - 明暗主题：颜色取自 CSS 变量与 antd token，随全局主题切换。
 */
import {
  CalendarOutlined,
  ClockCircleOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Calendar,
  DatePicker,
  Select,
  Spin,
  Tag,
  Tooltip,
} from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { CalendarEventDetail, EventType } from '../api/calendars'
import { CALENDAR_DAY_KEY, type CalendarTypeFilter, type CalendarEventsByDay } from '../composables/useCalendarEvents'
import {
  CALENDAR_EVENT_COLOR,
  CALENDAR_EVENT_TYPES,
  CALENDAR_MAX_CELL_EVENTS,
} from '../config/calendar'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime, formatDayLabel, formatMonthLabel } from '../utils/datetime'

interface CalendarBoardProps {
  /** 页面标题（学生端「校历日历」/ 领导端「校历管理」） */
  title: string
  /** 选中日期，同时决定看板展示的月份 */
  value: Dayjs
  onValueChange: (value: Dayjs) => void
  typeFilter: CalendarTypeFilter
  onTypeFilterChange: (value: CalendarTypeFilter) => void
  eventsByDay: CalendarEventsByDay
  /** 选中日期当天事件的完整详情（多个事件上下堆叠展示） */
  dayDetails: CalendarEventDetail[]
  dayDetailsLoading: boolean
  loading: boolean
  error: string | null
  /** 手动刷新（force=true 绕过会话缓存） */
  onRefresh: (force?: boolean) => void
  /** 工具栏右侧插槽（如「新增事件」） */
  toolbarExtra?: ReactNode
  /** 每个事件的操作插槽（如「编辑 / 删除」），领导端传入，学生端不传即只读 */
  renderEventActions?: (event: CalendarEventDetail) => ReactNode
}

export default function CalendarBoard({
  title,
  value,
  onValueChange,
  typeFilter,
  onTypeFilterChange,
  eventsByDay,
  dayDetails,
  dayDetailsLoading,
  loading,
  error,
  onRefresh,
  toolbarExtra,
  renderEventActions,
}: CalendarBoardProps) {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  const typeOptions = useMemo(
    () =>
      CALENDAR_EVENT_TYPES.map((type: EventType) => ({
        value: type,
        label: t(`calendar.type_${type}`),
      })),
    [t],
  )

  /**
   * 倒计时：选中日期与今天的天数差。
   * 两侧都先归零到当天 0 点（本地时区），规避时分秒与 UTC 截断造成的误差。
   * 拆成「未来 / 明天 / 今天 / 昨天 / 过去」五种文案，样式归为 future/today/past 三态。
   */
  const dayDiff = value.startOf('day').diff(dayjs().startOf('day'), 'day')
  let countdownStatus: 'future' | 'today' | 'past'
  let countdownText: string
  if (dayDiff > 1) {
    countdownStatus = 'future'
    countdownText = t('calendar.countdownFuture', { days: dayDiff })
  } else if (dayDiff === 1) {
    countdownStatus = 'future'
    countdownText = t('calendar.countdownTomorrow')
  } else if (dayDiff === 0) {
    countdownStatus = 'today'
    countdownText = t('calendar.countdownToday')
  } else if (dayDiff === -1) {
    countdownStatus = 'past'
    countdownText = t('calendar.countdownYesterday')
  } else {
    countdownStatus = 'past'
    countdownText = t('calendar.countdownPast', { days: -dayDiff })
  }

  /** 切换月份：定位到目标月首日，右侧当日事件同步切换 */
  const gotoMonth = (offset: number) => {
    onValueChange(value.startOf('month').add(offset, 'month'))
  }

  /** 日期格内容：事件条 + 超出折叠提示 */
  const renderCell = (date: Dayjs) => {
    const list = eventsByDay.get(date.format(CALENDAR_DAY_KEY))
    if (!list || list.length === 0) return null
    const visible = list.slice(0, CALENDAR_MAX_CELL_EVENTS)
    const rest = list.length - visible.length
    return (
      <div className="cal-cell-events">
        {visible.map((event) => (
          <Tooltip
            key={event.id}
            title={`${t(`calendar.type_${event.event_type}`)}｜${formatDateTime(event.start_date, locale)} ~ ${formatDateTime(event.end_date, locale)}`}
          >
            <span className="cal-event-chip" data-type={event.event_type}>
              {event.title}
            </span>
          </Tooltip>
        ))}
        {rest > 0 && (
          <Tooltip title={list.map((e) => e.title).join('、')}>
            <span className="cal-event-more">
              {t('calendar.moreEvents', { count: rest })}
            </span>
          </Tooltip>
        )}
      </div>
    )
  }

  return (
    <div className="calendar-board-view">
      <header className="calendar-board-head">
        <h2 className="calendar-board-title">{title}</h2>
        <p className="calendar-board-subtitle">{formatMonthLabel(value, locale)}</p>
      </header>

      <div className="calendar-board-body">
        <section className="panel-card calendar-board-main">
          <div className="calendar-toolbar">
            <Tooltip title={t('calendar.prevMonth')}>
              <Button size="small" icon={<LeftOutlined />} onClick={() => gotoMonth(-1)} />
            </Tooltip>
            <Button size="small" onClick={() => onValueChange(dayjs())}>
              {t('calendar.today')}
            </Button>
            <Tooltip title={t('calendar.nextMonth')}>
              <Button size="small" icon={<RightOutlined />} onClick={() => gotoMonth(1)} />
            </Tooltip>
            <DatePicker
              className="calendar-month-picker"
              picker="month"
              allowClear={false}
              value={value}
              onChange={(next: Dayjs | null) => {
                if (next) onValueChange(next.startOf('month'))
              }}
            />
            <span className="calendar-toolbar-title">{formatMonthLabel(value, locale)}</span>
            <span className="calendar-toolbar-spacer" />
            {toolbarExtra}
            <Tooltip title={t('common.refresh')}>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => onRefresh(true)}
              />
            </Tooltip>
            <Select<CalendarTypeFilter>
              size="small"
              mode="multiple"
              className="calendar-type-filter"
              value={typeFilter}
              options={typeOptions}
              placeholder={t('calendar.filterPlaceholder')}
              allowClear
              maxTagCount="responsive"
              onChange={(v: CalendarTypeFilter) => onTypeFilterChange(v)}
            />
          </div>

          {error ? (
            <div className="panel-card-body">
              <Alert
                type="error"
                showIcon
                title={error === 'network' ? t('common.networkError') : t('common.loadFailed')}
                description={error === 'network' ? undefined : error}
                action={
                  <Button size="small" onClick={() => onRefresh(true)}>
                    {t('common.retry')}
                  </Button>
                }
              />
            </div>
          ) : (
            <Spin spinning={loading}>
              <Calendar
                fullscreen
                value={value}
                onSelect={(date: Dayjs) => onValueChange(date)}
                onPanelChange={(date: Dayjs) => onValueChange(date)}
                headerRender={() => null}
                cellRender={(current, info) =>
                  info.type === 'date' ? renderCell(current as Dayjs) : info.originNode
                }
              />
            </Spin>
          )}
        </section>

        <section className="panel-card calendar-day-card">
          <header className="panel-card-header">
            <h3 className="panel-card-title">
              <span className="calendar-day-bar" />
              {`${t('calendar.detailTitle')} · ${formatDayLabel(value, locale)}`}
            </h3>
            <span className="cell-sub">
              {t('calendar.eventCount', { count: dayDetails.length })}
            </span>
          </header>
          <div className={`cal-countdown cal-countdown-${countdownStatus}`}>
            <ClockCircleOutlined />
            <span>{countdownText}</span>
          </div>
          <div className="panel-card-body">
            {dayDetailsLoading ? (
              <Spin>
                <div className="cal-detail-loading">{t('common.loading')}</div>
              </Spin>
            ) : dayDetails.length === 0 ? (
              <div className="cal-day-empty">
                <span className="cal-day-empty-icon">
                  <CalendarOutlined />
                </span>
                <span className="cal-day-empty-text">{t('calendar.emptyDay')}</span>
              </div>
            ) : (
              <ul className="cal-detail-stack">
                {dayDetails.map((event) => (
                  <li key={event.id} className="cal-detail cal-detail-card" data-type={event.event_type}>
                    <div className="cal-detail-head">
                      <span className="cal-detail-title">{event.title}</span>
                      {renderEventActions && (
                        <div className="cal-detail-bar-actions">{renderEventActions(event)}</div>
                      )}
                    </div>
                    <div className="cal-detail-meta">
                      <Tag color={CALENDAR_EVENT_COLOR[event.event_type]}>
                        {t(`calendar.type_${event.event_type}`)}
                      </Tag>
                    </div>
                    <dl className="cal-detail-list">
                      <dt>{t('calendar.fieldRange')}</dt>
                      <dd>
                        {formatDateTime(event.start_date, locale)} ~{' '}
                        {formatDateTime(event.end_date, locale)}
                      </dd>
                      <dt>{t('calendar.fieldDescription')}</dt>
                      <dd>{event.description || t('calendar.noDescription')}</dd>
                      <dt>{t('calendar.fieldCreatedAt')}</dt>
                      <dd>{formatDateTime(event.created_at, locale)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}