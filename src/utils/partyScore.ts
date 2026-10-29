/**
 * 党建活动加分分数展示工具。
 *
 * 后端分数为 DecimalText（JSON 字符串，如 "5" / "-2.5"），前端统一按字符串承接并原样透传，
 * 只在展示 / 判断正负时转成数值，避免 number 与 string 混用以及浮点精度丢失。
 */

/**
 * 把后端分数格式化为展示文本：正数前加「+」，负数与零保持原值，空值返回占位符。
 * @param score 后端返回的 DecimalText（字符串）或空值
 * @returns 展示用分数文本（必返回；空值返回「—」）
 */
export function formatPartyScore(score: string | null | undefined): string {
  if (score === null || score === undefined || score.trim() === '') return '—'
  const numeric = Number(score)
  if (!Number.isFinite(numeric)) return score
  return numeric > 0 ? `+${score}` : score
}

/**
 * 判断分数是否为负数（用于「加分绿色 / 减分红」配色）。
 * @param score 后端返回的 DecimalText（字符串）或空值
 * @returns true 表示负数；空值或非数字返回 false
 */
export function isNegativePartyScore(score: string | null | undefined): boolean {
  if (score === null || score === undefined || score.trim() === '') return false
  const numeric = Number(score)
  return Number.isFinite(numeric) && numeric < 0
}
