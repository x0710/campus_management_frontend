/**
 * 请假接口层：请假记录查询/详情、创建、撤回、软删除与时间冲突检查。
 * 查询类走会话缓存 cachedGet，写操作后失效 'GET /leaves' 缓存，保证列表取到最新数据。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  LeaveConflict,
  LeaveCreateRequest,
  LeaveDetail,
  LeaveInfo,
  LeaveQuery,
} from './types/leaves'

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

/**
 * PATCH /api/leaves/{id}/cancel 撤回请假申请（仅本人、仅待审批状态，成功返回 204）。
 * 400 表示状态非待审批，403 表示非本人，错误信息由调用方展示。
 */
export function cancelLeave(id: number): Promise<void> {
  return http.patch(`/leaves/${id}/cancel`).then((res) => {
    invalidate('GET /leaves')
    return res.data
  })
}

/**
 * DELETE /api/leaves/{id} 软删除请假记录（仅本人、仅已驳回/已撤回可删，成功返回 204）。
 * 400 表示当前状态不允许删除，错误信息由调用方展示。
 */
export function deleteLeave(id: number): Promise<void> {
  return http.delete(`/leaves/${id}`).then((res) => {
    invalidate('GET /leaves')
    return res.data
  })
}
