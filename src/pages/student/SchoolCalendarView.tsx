/**
 * 学生端：校历日历（只读）。
 * 数据与交互全部复用 useCalendarEvents + CalendarBoard：
 * 左侧月历看板、右侧「当日事件」卡片，点击事件在卡片内展示详情。
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
    dayEvents,
    loading,
    error,
    reload,
    detailId,
    detail,
    detailLoading,
    detailError,
    openDetail,
    closeDetail,
  } = useCalendarEvents()

  // 详情拉取失败（如 404）弹窗提示状态码，便于调试（ai 要求 9）
  useEffect(() => {
    if (detailError) {
      message.error(detailError === 'network' ? t('common.networkError') : detailError)
    }
  }, [detailError, message, t])

  return (
    <CalendarBoard
      title={t('calendar.boardTitle')}
      value={value}
      onValueChange={setValue}
      typeFilter={typeFilter}
      onTypeFilterChange={setTypeFilter}
      eventsByDay={eventsByDay}
      dayEvents={dayEvents}
      loading={loading}
      error={error}
      onRefresh={reload}
      onSelectEvent={(id: number) => void openDetail(id)}
      onBackToDay={closeDetail}
      detailId={detailId}
      detail={detail}
      detailLoading={detailLoading}
    />
  )
}