/**
 * 请假模块类型定义：请假类型/状态枚举、请假记录、详情、创建请求、时间冲突结果与查询参数。
 * 供 api/leaves.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 请假类型（api.json: LeaveType） */
export type LeaveType = 'personal' | 'sick' | 'public' | 'other'

/** 请假记录（api.json: LeaveInfoResponse） */
export interface LeaveInfo {
  id: number
  leave_type: LeaveType
  start_time: string
  end_time: string
  approval_id: number
  created_at: string
  updated_at: string
}

/** 创建请假请求（api.json: LeaveCreateRequest，所有字段均 required） */
export interface LeaveCreateRequest {
  leave_type: LeaveType
  reason: string
  start_time: string
  end_time: string
  destination: string
  attachment_id: string[]
  parent_confirm: boolean
}

/** 请假时间冲突检查结果（api.json: LeaveConflictResponse） */
export interface LeaveConflict {
  has_conflict: boolean
  conflicts: LeaveInfo[]
}

/** 请假详情（api.json: LeaveDetailResponse；附件接口未提供时 attachment_url 为空串） */
export interface LeaveDetail {
  id: number
  user_id: number
  leave_type: LeaveType
  reason: string
  start_time: string
  end_time: string
  destination: string
  /** 附件下载地址；无附件时为空串 */
  attachment_url: string
  parent_confirm: boolean
  approval_id: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 撤回请假请求（PATCH /api/leaves/{id}/cancel body；reason 可选） */
export interface CancelLeaveRequest {
  reason?: string
}

/** 请假分页查询参数（api.json: LeaveQueryParams；不支持按审批状态筛选） */
export interface LeaveQuery extends PageQuery {
  leave_type?: LeaveType
  start_date?: string
  end_date?: string
}

/** 请假统计（GET /api/leaves/statistics 响应） */
export interface LeaveStatistics {
  total_count: number
  pending_count: number
  approved_count: number
  rejected_count: number
  cancelled_count: number
  personal_count: number
  sick_count: number
  public_count: number
  other_count: number
}