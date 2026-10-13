/**
 * 奖学金模块类型定义：奖学金记录详情、分页查询参数与创建/更新请求体。
 * 金额字段 amount_cents 为后端 int64（单位：分，如 100000 = 1000.00 元）。
 * uid 为学号/用户 ID（后端 int64，JSON 中序列化为整数）。
 * 供 api/rewardings.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 奖学金记录详情（api.json: RewardingDto，列表项即完整详情） */
export interface RewardingDto {
  id: number
  /** 学生/用户 ID（对应 users.id，样例为学号如 2409122025） */
  uid: number
  /** 奖学金项目名称 */
  project: string
  /** 金额（单位：分，后端 int64；展示时需除以 100） */
  amount_cents: number
  /** 创建时间（RFC3339） */
  created_at: string
}

/** 奖学金分页查询参数（api.json: RewardingQueryParams） */
export interface RewardingQuery extends PageQuery {
  /** 按学生/用户 ID 精确筛选 */
  uid?: number
  /** 按奖学金项目名称精确筛选 */
  project?: string
  /** 按项目名称等字段模糊搜索 */
  keyword?: string
  /** 金额下限（单位：分，含） */
  amount_min?: number
  /** 金额上限（单位：分，含） */
  amount_max?: number
  /** 创建时间起始（含，RFC3339） */
  from_at?: string
  /** 创建时间截止（含，RFC3339） */
  to_at?: string
}

/** 创建奖学金记录请求（POST /api/rewardings） */
export interface RewardingCreateRequest {
  /** 学生/用户 ID（必填） */
  uid: number
  /** 奖学金项目名称（必填） */
  project: string
  /** 金额（单位：分，必填） */
  amount_cents: number
}

/** 更新奖学金记录请求（PATCH /api/rewardings/{id}，字段均可选） */
export type RewardingUpdateRequest = Partial<RewardingCreateRequest>
