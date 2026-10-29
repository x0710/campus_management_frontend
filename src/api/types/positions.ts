/**
 * 职位模块类型定义：职位详情、分页查询参数与创建/更新请求体。
 * 供 api/positions.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 职位（api.json: PositionDetailDto，code 为主键） */
export interface PositionDetail {
  code: string
  /** 职位所属组织 ID */
  organization_id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

/** 用户职位（GET /api/user-positions 返回元素，额外带 user id） */
export interface UserPosition extends PositionDetail {
  uid: number
}

/** 职位分页查询参数 */
export interface PositionQuery extends PageQuery {
  keyword?: string
  /** 按所属组织 ID 过滤 */
  organization_id?: number
}

/** 职位创建请求体（code 由前端指定，创建后不可修改） */
export interface PositionCreateRequest {
  code: string
  /** 职位所属组织 ID（必填） */
  organization_id: number
  name: string
  description?: string
}

/**
 * 职位更新请求体（code 为主键不可改）。
 * 注意：后端将 description: None 视为「保留原值」，因此清空描述无法通过本接口实现，
 * 空值时应省略该字段（见 updatePosition 调用方）。
 */
export interface PositionUpdateRequest {
  /** 职位所属组织 ID（可选） */
  organization_id?: number
  name?: string
  description?: string
}