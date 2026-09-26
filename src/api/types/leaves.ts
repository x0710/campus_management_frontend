/**
 * 请假模块类型定义：请假类型/状态枚举、请假记录、详情、创建请求、时间冲突结果与查询参数。
 * 供 api/leaves.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 请假类型（api.json: LeaveType） */
export type LeaveType = 'personal' | 'sick' | 'public' | 'other'

/** 请假审批状态（查询筛选用；列表项本身不含状态，状态在审批实例上） */
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

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
  attachment_url: string | null
  /** 后端实际返回 0/1 */
  parent_confirm: boolean | number
  approval_id: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 请假分页查询参数 */
export interface LeaveQuery extends PageQuery {
  status?: LeaveStatus
  leave_type?: LeaveType
  start_date?: string
  end_date?: string
}