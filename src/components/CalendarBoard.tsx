/**
 * 校历日历看板（学生端 / 领导端共用，纯展示组件）：
 * - 左侧：月历看板，工具栏含「上一月 / 今天 / 下一月 / 月份选择 / 刷新 / 事件类型筛选」，
 *   日期格内按天展示事件条（多日事件逐天展开），超出折叠为「+N」；
 * - 右侧卡片：默认展示「当日事件」列表；点击某条事件后在**卡片内**展示该事件详情
 *   （名称、类型、时间范围、描述、创建时间），不再使用弹窗；
 * - 通过 toolbarExtra（工具栏右侧插槽）与 detailActions（详情态操作插槽）
 *   让领导端挂载「新增 / 编辑 / 删除」，学生端不传即为只读；
 * - 数据与详情请求由 useCalendarEvents 提供，本组件只负责渲染与交互。
 * - 明暗主题：颜色取自 CSS 变量与 antd token，随全局主题切换。
 */
import {
  CalendarOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  RollbackOutlined,
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
import type { CalendarEventDetail, CalendarEventInfo, EventType } from '../api/calendars'
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
  /** 选中日期当天的事件列表 */
  dayEvents: CalendarEventInfo[]
  loading: boolean
  error: string | null
  /** 手动刷新（force=true 绕过会话缓存） */
  onRefresh: (force?: boolean) => void
  /** 点击事件 → 在右侧卡片内展示详情 */
  onSelectEvent: (id: number) => void
  /** 详情态返回当日列表 */
  onBackToDay: () => void
  detailId: number | null
  detail: CalendarEventDetail | null
  detailLoading: boolean
  /** 工具栏右侧插槽（如「新增事件」） */
  toolbarExtra?: ReactNode
  /** 详情态操作插槽（如「编辑 / 删除」） */
  detailActions?: ReactNode
}

export default function CalendarBoard({
  title,
  value,
  onValueChange,
  typeFilter,
  onTypeFilterChange,
  eventsByDay,
  dayEvents,
  loading,
  error,
  onRefresh,
  onSelectEvent,
  onBackToDay,
  detailId,
  detail,
  detailLoading,
  toolbarExtra,
  detailActions,
}: CalendarBoardProps) {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  const detailMode = detailId !== null

  const typeOptions = useMemo(
    () => [
      { value: 'all' as CalendarTypeFilter, label: t('calendar.filterAll') },
      ...CALENDAR_EVENT_TYPES.map((type: EventType) => ({
        value: type as CalendarTypeFilter,
        label: t(`calendar.type_${type}`),
      })),
    ],
    [t],
  )

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
              className="calendar-type-filter"
              value={typeFilter}
              options={typeOptions}
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
              {detailMode
                ? t('calendar.detailTitle')
                : `${t('calendar.dayEvents')} · ${formatDayLabel(value, locale)}`}
            </h3>
            {detailMode ? (
              <div className="cal-detail-bar-actions">
                {detailActions}
                <Tooltip title={t('calendar.backToList')}>
                  <Button size="small" icon={<RollbackOutlined />} onClick={onBackToDay} />
                </Tooltip>
              </div>
            ) : (
              <span className="cell-sub">
                {t('calendar.eventCount', { count: dayEvents.length })}
              </span>
            )}
          </header>
          <div className="panel-card-body">
            {detailMode ? (
              detailLoading || !detail ? (
                <Spin>
                  <div className="cal-detail-loading">{t('common.loading')}</div>
                </Spin>
              ) : (
                <div className="cal-detail">
                  <div className="cal-detail-title">{detail.title}</div>
                  <div className="cal-detail-meta">
                    <Tag color={CALENDAR_EVENT_COLOR[detail.event_type]}>
                      {t(`calendar.type_${detail.event_type}`)}
                    </Tag>
                  </div>
                  <dl className="cal-detail-list">
                    <dt>{t('calendar.fieldRange')}</dt>
                    <dd>
                      {formatDateTime(detail.start_date, locale)} ~{' '}
                      {formatDateTime(detail.end_date, locale)}
                    </dd>
                    <dt>{t('calendar.fieldDescription')}</dt>
                    <dd>{detail.description || t('calendar.noDescription')}</dd>
                    <dt>{t('calendar.fieldCreatedAt')}</dt>
                    <dd>{formatDateTime(detail.created_at, locale)}</dd>
                  </dl>
                </div>
              )
            ) : dayEvents.length === 0 ? (
              <div className="cal-day-empty">
                <span className="cal-day-empty-icon">
                  <CalendarOutlined />
                </span>
                <span className="cal-day-empty-text">{t('calendar.emptyDay')}</span>
              </div>
            ) : (
              <ul className="cal-day-list">
                {dayEvents.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="cal-day-item"
                      data-type={event.event_type}
                      onClick={() => onSelectEvent(event.id)}
                    >
                      <span className="cal-day-item-title">{event.title}</span>
                      <span className="cal-day-item-meta">
                        <Tag color={CALENDAR_EVENT_COLOR[event.event_type]}>
                          {t(`calendar.type_${event.event_type}`)}
                        </Tag>
                        <span className="cell-sub">
                          {formatDateTime(event.start_date, locale)} ~{' '}
                          {formatDateTime(event.end_date, locale)}
                        </span>
                      </span>
                    </button>
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