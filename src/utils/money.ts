/**
 * 金额工具：人民币金额格式化。
 * 后端金额字段 amount_cents 以「分」为单位（int64），展示与输入统一转换为「元」，
 * 避免浮点精度问题；格式化结果带人民币符号与千分位，如 ¥1,000.00。
 */
import type { Locale } from '../store/settings'

/**
 * 把以「分」为单位的金额格式化为人民币字符串（如 100000 → ¥1,000.00）。
 * @param cents 以「分」为单位的金额（必填，非有限数值按 0 处理）
 * @param locale 当前语言（必填，决定数字分组/小数分隔符）
 * @returns 带人民币符号的金额字符串（必返回）
 */
export function formatCentsAsYuan(cents: number, locale: Locale): string {
  const value = Number.isFinite(cents) ? cents / 100 : 0
  const formatted = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return `¥${formatted}`
}

/**
 * 把以「元」为单位的金额转换为「分」（四舍五入到整数）。
 * @param yuan 以「元」为单位的金额（必填）
 * @returns 以「分」为单位的整数金额（必返回）
 */
export function yuanToCents(yuan: number): number {
  return Math.round((Number.isFinite(yuan) ? yuan : 0) * 100)
}
