/** 分页响应（api.json: PaginatedResponse — data/total/page/page_size/total_pages） */
import axios from 'axios'

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface PageQuery {
  page?: number
  page_size?: number
}

/**
 * 从 axios 异常提取可展示的错误：
 * - 后端 AppError 响应体为纯文本，原样返回
 * - 无响应返回 'network'，其他情况返回 'failed'（由视图映射 i18n）
 */
export function extractError(err: unknown): string {
  if (!axios.isAxiosError(err)) return 'failed'
  const data = err.response?.data
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (!err.response) return 'network'
  return 'failed'
}

/**
 * 从 axios 异常提取**带 HTTP 状态码**的可展示文案（ai 要求 9：错误提示需含 404、500 等状态码）。
 * - 有响应：返回 `${status} ${后端文本 | statusText}`，如 "404 Not Found"、"403 无权限"
 * - 无响应：返回 'network'（由视图映射 i18n）
 * - 非 axios 异常：返回 'failed'（由视图映射 i18n）
 * 供公告详情页、公告编辑页等需要展示状态码的视图复用。
 */
export function extractErrorWithStatus(err: unknown): string {
  if (!axios.isAxiosError(err)) return 'failed'
  const res = err.response
  if (!res) return 'network'
  const body = typeof res.data === 'string' && res.data.trim() ? res.data.trim() : res.statusText
  return body ? `${res.status} ${body}` : String(res.status)
}
