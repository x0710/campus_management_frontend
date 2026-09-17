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
