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
