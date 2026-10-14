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

/** 
 * 把上一次登录时间转换为可以读时长描述，用于登录后的欢迎提示
 * 小于1分钟：刚刚
 * - 小于 24 小时：X 小时 [Y 分钟]
 * - 小于 30 天：X 天
 * - 30 天及以上：X 个月 [Y 天]
 * @param from 上次登录时间（RFC3339 字符串）
 * @param locale 当前语言
 * @param now 当前时间基准（默认取调用时刻，方便测试）
 * @returns 时长描述；时间非法或为未来时间时返回 null
 */
export function formatElapsed(from: string, locale: Locale, now: Date = new Date()): string | null{
  const start = new Date(from) 
  if (Number.isNaN(start.getTime())) return null

  const diffMs = now.getTime() - start.getTime()
  if (diffMs < 0) return null

  const minute = 60 * 1000
  const hour = minute * 60 
  const day = hour * 24

  const totalMinutes = Math.floor(diffMs / minute)
  if (totalMinutes < 1) {
    return locale === 'zh' ? '刚刚' : 'just now'
  }
  if (totalMinutes < 60) {
    return locale === 'zh' ?`${totalMinutes}分钟` : `${totalMinutes} minutes`
  }

  const totalHours = Math.floor(diffMs / hour)
  if (totalHours < 24) {
    const minutes = totalMinutes % 60
    if (minutes === 0) return locale === 'zh' ?`${totalHours}小时` : `${totalHours} hours`
     return locale === 'zh' ? `${totalHours} 小时 ${minutes} 分钟` : `${totalHours} hr ${minutes} min`  
  }
  const totalDays = Math.floor(diffMs / day)
  if (totalDays < 30) {
    return locale === 'zh' ? `${totalDays} 天` : `${totalDays} day(s)`
  }

  const months = Math.floor(totalDays / 30)
  const days = totalDays % 30
  if (days === 0) return locale === 'zh' ? `${months} 个月` : `${months} month(s)`
  return locale === 'zh' ? `${months} 个月 ${days} 天` : `${months} month(s) ${days} day(s)`
}