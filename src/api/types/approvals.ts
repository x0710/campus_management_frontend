/**
 * 审批实例模块类型定义：审批步骤状态/决定枚举、审批步骤条目、提交审批结果请求体与待办查询参数。
 * 供 api/approvals.ts 的请求函数与各视图复用。
 */

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

/** GET /api/approvals 分页查询审批模板参数 */
export interface ApprovalTodoQuery {
  /** 不传 approver_id/applicant_id 时，后端默认按"我的待办（approver_id=自己）"过滤 */
  approver_id?: number
  applicant_id?: number
  status?: ApprovalStepStatus
  page?: number
  page_size?: number
}