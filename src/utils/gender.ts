/**
 * 性别字段兼容解析。
 *
 * 后端 `GET /api/users/*` 历史上返回 `male` / `female`，新版接口改为返回中文 `男` / `女`；
 * 本工具统一归一化为前端表单使用的 `Gender` 枚举，避免两种返回格式导致「未知性别」。
 */
import type { Gender } from '../api/types/users'

/**
 * 把后端性别值归一化为 `male` / `female`。
 * @param value 后端返回的性别（英文或中文；可为空）
 * @returns 标准性别；无法识别时返回 undefined
 */
export function normalizeGender(value: string | null | undefined): Gender | undefined {
  const text = value?.trim()
  if (!text) return undefined
  const lower = text.toLowerCase()
  if (lower === 'male' || text === '男' || text === '男性') return 'male'
  if (lower === 'female' || text === '女' || text === '女性') return 'female'
  return undefined
}

/**
 * 从身份证号推导性别（GB 11643）：第 17 位奇数为男、偶数为女。
 * 用于批量接口不返回性别时的兜底展示（如组织成员导出）。
 * @param idCard 身份证号（可空）
 * @returns 标准性别；号码缺失或格式不符时返回 undefined
 */
export function genderFromIdCard(idCard: string | null | undefined): Gender | undefined {
  const text = idCard?.trim()
  if (!text || text.length < 17) return undefined
  const digit = text[16]
  if (digit < '0' || digit > '9') return undefined
  return Number(digit) % 2 === 1 ? 'male' : 'female'
}
