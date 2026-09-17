import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PageQuery, PaginatedResponse } from './common'

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

export interface LeaveQuery extends PageQuery {
  status?: LeaveStatus
  leave_type?: LeaveType
  start_date?: string
  end_date?: string
}

/**
 * GET /api/leaves 分页查询请假记录（学生只能看到本人的，由后端过滤；会话内缓存）。
 * force=true 可绕过缓存（手动刷新）。
 */
export function queryLeaves(params: LeaveQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<LeaveInfo>>(
    '/leaves',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * POST /api/leaves 学生提交请假申请，成功后返回新建记录 ID（u64）。
 * 400 表示时间冲突或参数错误，错误信息由调用方展示。
 */
export function createLeave(data: LeaveCreateRequest) {
  return http
    .post<number>('/leaves', data)
    .then((res) => {
      invalidate('GET /leaves')
      return res.data
    })
}

/**
 * GET /api/leaves/check-conflict 检查时间段是否与待审批/已批准请假冲突。
 * 属于提交前的实时校验，结果随后端状态快速变化，不做缓存，每次都请求最新结果。
 */
export function checkLeaveConflict(params: {
  start_time: string
  end_time: string
  exclude_id?: number
}) {
  return http
    .get<LeaveConflict>('/leaves/check-conflict', { params })
    .then((res) => res.data)
}

/**
 * GET /api/leaves/{id} 获取请假详情（会话内缓存）。
 * 审批列表中的 instance_id 即请假记录的 approval_id，按后端运行时约定用该值作为路径 id 查询。
 * force=true 可绕过缓存（手动刷新）。
 */
export function getLeave(id: number, force?: boolean) {
  return cachedGet<LeaveDetail>(`/leaves/${id}`, undefined, { force })
}
