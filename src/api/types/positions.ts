/**
 * 职位模块类型定义：职位详情、分页查询参数与创建/更新请求体。
 * 供 api/positions.ts 的请求函数与各视图复用。
 */
import type { PageQuery, CreatedDateQuery } from './common'

export type PositionUsageScope = 'self_only' | 'self_and_children' | 'self_and_descendants'

/** 职位（api.json: PositionDetailDto，code 为主键） */
export interface PositionDetail {
  code: string
  /** 职位所属组织 ID */
  organization_id: number
  usage_scope: PositionUsageScope
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

/** 用户职位（GET /api/user-positions 返回元素，额外带 user id） */
export interface UserPosition extends PositionDetail {
  uid: number
  /** 实际任职组织；organization_id 仍为职位所属组织。 */
  member_organization_id: number
}

/** 职位分页查询参数 */
export interface PositionQuery extends PageQuery, CreatedDateQuery {
  keyword?: string
  /** 按目标组织可任职资格筛选，包含父组织向直属子组织开放的职位，以及祖先组织向全部下级开放的职位。 */
  usable_in_organization_id?: number
  /** 按所属组织 ID 过滤 */
  organization_id?: number
}

/** 职位创建请求体（code 由前端指定，创建后不可修改） */
export interface PositionCreateRequest {
  code: string
  /** 职位所属组织 ID（必填） */
  organization_id: number
  name: string
  usage_scope?: PositionUsageScope
  description?: string
}

/**
 * 职位更新请求体（code 为主键不可改）。
 * description 省略（None）表示保留原值；传入空字符串表示清空描述。
 */
export interface PositionUpdateRequest {
  usage_scope?: PositionUsageScope | null
  name?: string
  description?: string
}
