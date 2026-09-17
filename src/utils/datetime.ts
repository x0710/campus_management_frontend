import type { Dayjs } from 'dayjs'
import type { Locale } from '../store/settings'

/** 按当前语言格式化日期时间；后端返回 RFC3339（UTC），toLocaleString 自动转本地时区 */
export function formatDateTime(value: string | null, locale: Locale): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 月份标签：zh → 2026年9月；en → September 2026（用于日历看板标题） */
export function formatMonthLabel(value: Dayjs, locale: Locale): string {
  if (locale === 'zh') return `${value.year()}年${value.month() + 1}月`
  return value.format('MMMM YYYY')
}

/** 日期标签：2026/9/11（用于「当日事件」标题，与月份标签风格一致） */
export function formatDayLabel(value: Dayjs, locale: Locale): string {
  if (locale === 'zh') return `${value.year()}/${value.month() + 1}/${value.date()}`
  return value.format('YYYY/M/D')
}
