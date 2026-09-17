/** 审批模块, 提供审批相关 API */

import { invalidate } from './cache'
import { http } from './http'

/** 审批步骤状态（api.json: ApprovalInstanceStepStatus；DB enum waiting/pending/approved/rejected/skipped） */
export type ApprovalStepStatus = 'waiting' | 'pending' | 'approved' | 'rejected' | 'skipped'

/** 审批决定（api.json: ApprovalRecordStatus；注意落库值 approve 由后端映射，前端仍传 agree） */
export type ApprovalDecision = 'agree' | 'reject' | 'transfer'

/** 审批步骤条目（GET /api/approvals 数组元素） */
export interface ApprovalInstanceStep {
  id: number
  instance_id: number
  step_order: number
  approver_id: number
  status: ApprovalStepStatus
  started_at: string
  finished_at: string | null
}

/** PUT /api/approvals 请求体（api.json: ApprovalStepResultDto） */
export interface ApprovalStepResult {
  approval_instance_step_id: number
  /** 服务端会以当前登录用户覆盖该字段，契约要求必传 */
  user_id: number
  instance_id: number
  step_order: number
  decision: ApprovalDecision
  transfer_to?: number | null
  comment: string
}

export interface ApprovalTodoQuery {
  /** 不传 approver_id/applicant_id 时，后端默认按"我的待办（approver_id=自己）"过滤 */
  approver_id?: number
  applicant_id?: number
  status?: ApprovalStepStatus
  page?: number
  page_size?: number
}

/**
 * GET /api/approvals 审批步骤列表。
 * 注意：接口返回裸数组（无分页 total），page/page_size 由后端 LIMIT/OFFSET 生效。
 */
export function queryApprovals(params: ApprovalTodoQuery = {}) {
  return http
    .get<ApprovalInstanceStep[]>('/approvals', { params })
    .then((res) => res.data)
}

/** PUT /api/approvals 提交审批结果（同意 / 驳回 / 转交），成功返回 200 无 body */
export function submitApproval(data: ApprovalStepResult) {
  return http
    .put('/approvals', data)
    .then((res) => {
      // 审批结果会改变请假记录状态，失效请假列表缓存使各端下次进入取最新数据
      invalidate('GET /leaves')
      return res.data
    })
}
