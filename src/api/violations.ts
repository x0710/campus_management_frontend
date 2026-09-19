/**
 * 违规记录接口（后端 campus-violation）：
 * - GET   /api/violations        分页查询违规记录（权限 violation.read）
 * - GET   /api/violations/{id}   获取违规记录详情（权限 violation.read）
 * - PATCH /api/violations/{id}   部分更新违规记录（权限 violation.update，成功 204 无 body）
 *
 * 查询统一走会话缓存 cachedGet：相同查询条件只请求一次，手动刷新传 force=true 绕过缓存。
 * 注意：severity 后端以 camelCase 序列化，JSON 中为小写字符串 low|medium|high|critical。
 * 更新请求中未提供的字段保持原值（Option 语义），occurred_at 为 RFC3339 字符串。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PageQuery, PaginatedResponse } from './common'

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

/** GET /api/violations 分页查询违规记录（force=true 绕过会话缓存） */
export function queryViolations(params: ViolationQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<ViolationDto>>(
    '/violations',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/violations/{id} 获取违规记录详情（force=true 绕过会话缓存） */
export function getViolation(id: number, force?: boolean) {
  return cachedGet<ViolationDto>(`/violations/${id}`, undefined, { force })
}

/** PATCH /api/violations/{id} 部分更新违规记录，成功后失效列表缓存 */
export async function updateViolation(id: number, body: ViolationUpdateRequest): Promise<void> {
  await http.patch(`/violations/${id}`, body)
  invalidate('GET /violations')
}
