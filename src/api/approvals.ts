/** 审批模块, 提供审批相关 API */

import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type {
  ApprovalInstanceStep,
  ApprovalRecordItem,
  ApprovalStepResult,
  ApprovalTodoQuery,
} from './types/approvals'

/** 按步骤 ID 查找审批步骤时单页拉取条数（后端允许的最大值） */
const APPROVAL_STEP_SCAN_PAGE_SIZE = 100

/** 按步骤 ID 查找审批步骤时最多扫描的页数，避免异常数据导致无限翻页 */
const APPROVAL_STEP_SCAN_MAX_PAGES = 10

/**
 * GET /api/approvals 审批步骤列表。
 * 注意：接口返回裸数组（无分页 total），page/page_size 由后端 LIMIT/OFFSET 生效。
 */
export function queryApprovals(params: ApprovalTodoQuery = {}) {
  return http
    .get<ApprovalInstanceStep[]>('/approvals', { params })
    .then((res) => res.data)
}

/**
 * 按审批步骤 ID 查找审批步骤（详情页刷新后仍可恢复）。
 *
 * 后端未提供单个审批步骤的 GET 详情接口，只能分页拉取 GET /api/approvals
 * 后在前端按步骤 ID 匹配；查询走会话缓存，列表页刚拉过的页可直接命中。
 * @param stepId 审批步骤 ID（必填）
 * @param approverId 审批人 ID（可选；显式传入避免依赖后端「缺省即本人」的隐式行为）
 * @param force 是否绕过会话缓存重新请求（用于手动刷新），默认 false
 * @returns Promise<ApprovalInstanceStep | null> 命中的步骤；扫描到末页仍未命中返回 null
 */
export async function findApprovalStepById(
  stepId: number,
  approverId?: number,
  force?: boolean,
): Promise<ApprovalInstanceStep | null> {
  for (let page = 1; page <= APPROVAL_STEP_SCAN_MAX_PAGES; page += 1) {
    const params: ApprovalTodoQuery = {
      ...(approverId !== undefined ? { approver_id: approverId } : {}),
      page,
      page_size: APPROVAL_STEP_SCAN_PAGE_SIZE,
    }
    const steps = await cachedGet<ApprovalInstanceStep[]>(
      '/approvals',
      params as Record<string, unknown>,
      { force },
    )
    const hit = steps.find((step) => step.id === stepId)
    if (hit) return hit
    // 裸数组无 total：不足一页表示已到末尾
    if (steps.length < APPROVAL_STEP_SCAN_PAGE_SIZE) break
  }
  return null
}

/**
 * GET /api/approvals/{id}/records 查询审批实例中的全部审批意见记录。
 * 审批流转区按记录展示每个环节的操作人、决定、意见与时间。
 * @param instanceId 审批实例 ID（必填）
 * @param force 是否绕过会话缓存重新请求，默认 false
 * @returns Promise<ApprovalRecordItem[]> 按环节顺序排列的审批记录
 */
export function getApprovalRecords(instanceId: number, force?: boolean) {
  return cachedGet<ApprovalRecordItem[]>(`/approvals/${instanceId}/records`, undefined, { force })
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

/**
 * DELETE /api/approvals/{id} 撤回审批实例（GLOBAL_AUTH，仅审批实例发起人，成功 204 无 body）。
 * 撤回后审批步骤与关联业务记录状态会同步更新，因此同时失效审批与请假缓存。
 * @param id 审批实例 ID（必填）
 * @returns Promise<void>
 */
export function cancelApproval(id: number) {
  return http.delete(`/approvals/${id}`).then((res) => {
    invalidate('GET /approvals')
    invalidate('GET /leaves')
    return res.data
  })
}
