/** 审批模块, 提供审批相关 API */

import { invalidate } from './cache'
import { http } from './http'
import type { ApprovalInstanceStep, ApprovalStepResult, ApprovalTodoQuery } from './types/approvals'



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



