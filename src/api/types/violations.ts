/**
 * 违规记录模块类型定义：违规严重程度枚举、违规详情、分页查询参数与更新请求体。
 * 注意：severity 后端以 camelCase 序列化，JSON 中为小写字符串 low|medium|high|critical。
 * 供 api/violations.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 违规严重程度（api.json: ViolationSeverity，序列化为小写） */
export type ViolationSeverity = 'low' | 'medium' | 'high' | 'critical'

/** 违规记录详情（api.json: ViolationDto，列表项即完整详情） */
export interface ViolationDto {
  id: number
  /** 学生 ID（对应 users.id） */
  student_id: number
  category: string
  title: string
  description: string | null
  /** 发生时间（RFC3339） */
  occurred_at: string
  location: string | null
  severity: ViolationSeverity
  /** 记录人 ID */
  recorder_id: number
  attachment: number | null
  created_at: string
  updated_at: string
}

/** 违规分页查询参数（api.json: ViolationQueryParams） */
export interface ViolationQuery extends PageQuery {
  /** 按标题或描述模糊搜索 */
  keyword?: string
  /** 按学生 ID 筛选 */
  user_id?: number
  /** 按类别筛选 */
  category?: string
  severity?: ViolationSeverity
  /** 发生时间起始（含，RFC3339） */
  start_date?: string
  /** 发生时间截止（含，RFC3339） */
  end_date?: string
}

/** 违规更新请求体（api.json: ViolationUpdateRequest，所有字段可选，省略即保留原值） */
export interface ViolationUpdateRequest {
  category?: string
  title?: string
  description?: string
  /** RFC3339 */
  occurred_at?: string
  location?: string
  severity?: ViolationSeverity
}