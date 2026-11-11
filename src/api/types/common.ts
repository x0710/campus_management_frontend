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

/** 按创建日期查询：YYYY-MM-DD、UTC，起止日均包含，支持仅填一端。 */
export interface CreatedDateQuery {
  start_date?: string
  end_date?: string
}

/** 请假/违规接口已有业务时间字段，创建日期使用独立名称。 */
export interface CreatedDateAliasQuery {
  created_start_date?: string
  created_end_date?: string
}
