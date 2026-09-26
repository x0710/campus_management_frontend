/**
 * 学生端：校历日历（只读）。
 * 数据与交互全部复用 useCalendarEvents + CalendarBoard：
 * 左侧月历看板（含相邻月份日期格事件）、右侧选中日期当天全部事件的堆叠详情。
 */
import { App as AntdApp } from 'antd'
import { useEffect } from 'react'
import CalendarBoard from '../../components/CalendarBoard'
import { useCalendarEvents } from '../../composables/useCalendarEvents'
import { useT } from '../../i18n'

export default function SchoolCalendarView() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const {
    value,
    setValue,
    typeFilter,
    setTypeFilter,
    eventsByDay,
    loading,
    error,
    reload,
    dayDetails,
    dayDetailsLoading,
    dayDetailsError,
  } = useCalendarEvents()

  // 详情拉取失败（如 404）弹窗提示状态码，便于调试（代码要求 9）
  useEffect(() => {
    if (dayDetailsError) {
      message.error(dayDetailsError === 'network' ? t('common.networkError') : dayDetailsError)
    }
  }, [dayDetailsError, message, t])

  return (
    <CalendarBoard
      title={t('calendar.boardTitle')}
      value={value}
      onValueChange={setValue}
      typeFilter={typeFilter}
      onTypeFilterChange={setTypeFilter}
      eventsByDay={eventsByDay}
      dayDetails={dayDetails}
      dayDetailsLoading={dayDetailsLoading}
      loading={loading}
      error={error}
      onRefresh={reload}
    />
  )
}