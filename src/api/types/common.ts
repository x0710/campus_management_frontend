/**
 * 通用分页类型定义（api.json: PaginatedResponse）。
 * 被各业务领域类型文件与请求函数复用，避免在每个模块里重复声明分页结构。
 */

/** 分页响应（api.json: PaginatedResponse — data/total/page/page_size/total_pages） */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/** 分页查询通用参数（页码、每页条数） */
export interface PageQuery {
  page?: number
  page_size?: number
}