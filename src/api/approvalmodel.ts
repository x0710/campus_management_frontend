/**
 * 审批模板接口：
 * - GET    /api/approvals/templates                                分页查询审批模板（权限 approval.read）
 * - POST   /api/approvals/templates                                创建审批模板（权限 approval.create）
 * - GET    /api/approvals/templates/{id}                           审批模板详情（权限 approval.read）
 * - PATCH  /api/approvals/templates/{id}                           更新审批模板（权限 approval.update）
 * - DELETE /api/approvals/templates/{id}                           删除审批模板（权限 approval.delete）
 * - POST   /api/approvals/templates/{template_id}/steps            添加审批步骤（权限 approval.create）
 * - PATCH  /api/approvals/templates/{template_id}/steps/{step_id}  更新审批步骤（权限 approval.update）
 * - DELETE /api/approvals/templates/{template_id}/steps/{step_id}  删除审批步骤（权限 approval.delete）
 *
 * 查询统一走会话缓存 cachedGet：相同查询条件只请求一次，手动刷新传 force=true 绕过缓存；
 * 写操作后统一失效 'GET /approvals/templates'（前缀匹配，同时清除列表与各详情缓存）。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  ApprovalTemplate,
  ApprovalTemplateCreate,
  ApprovalTemplateCreatedResponse,
  ApprovalTemplateDetail,
  ApprovalTemplateQuery,
  ApprovalTemplateStepCreate,
  ApprovalTemplateStepUpdate,
  ApprovalTemplateUpdate,
} from './types/approvalmodel'

/** 缓存失效前缀：命中审批模板列表与全部详情缓存 */
const TEMPLATE_CACHE_PREFIX = 'GET /approvals/templates'

/**
 * GET /api/approvals/templates 分页查询审批模板
 * @param params 查询条件（可选，默认空对象）：page 页码默认 1、page_size 每页条数默认 20、
 *               keyword 关键字、business_type 业务类型、enabled 启用状态 均为可选
 * @param force 是否绕过会话缓存（可选，默认 false；手动刷新传 true）
 * @returns Promise<PaginatedResponse<ApprovalTemplate>> 分页结果（必返回，含 data/total/page/page_size/total_pages）
 */
export function queryApprovalTemplates(
  params: ApprovalTemplateQuery = {},
  force?: boolean,
) {
  return cachedGet<PaginatedResponse<ApprovalTemplate>>(
    '/approvals/templates',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * POST /api/approvals/templates 创建审批模板
 * @param body 创建参数（必填）：code/name/business_type 必填，enabled/description/steps 可选
 * @returns Promise<number> 新建模板 ID（必返回）
 */
export async function createApprovalTemplate(
  body: ApprovalTemplateCreate,
): Promise<number> {
  const res = await http.post<ApprovalTemplateCreatedResponse>(
    '/approvals/templates',
    body,
  )
  invalidate(TEMPLATE_CACHE_PREFIX)
  return res.data.id
}

/**
 * GET /api/approvals/templates/{id} 获取审批模板详情（含步骤列表）
 * @param id 模板 ID（必填）
 * @param force 是否绕过会话缓存（可选，默认 false）
 * @returns Promise<ApprovalTemplateDetail> 模板详情（必返回）
 */
export function getApprovalTemplateDetail(id: number, force?: boolean) {
  return cachedGet<ApprovalTemplateDetail>(
    `/approvals/templates/${id}`,
    undefined,
    { force },
  )
}

/**
 * PATCH /api/approvals/templates/{id} 更新审批模板（code 不可改）
 * @param id 模板 ID（必填）
 * @param body 更新参数（必填，字段均可选）：name/business_type/enabled/description
 * @returns Promise<void> 无返回数据（后端 204）
 */
export async function updateApprovalTemplate(
  id: number,
  body: ApprovalTemplateUpdate,
): Promise<void> {
  await http.patch(`/approvals/templates/${id}`, body)
  invalidate(TEMPLATE_CACHE_PREFIX)
}

/**
 * DELETE /api/approvals/templates/{id} 删除审批模板（关联步骤级联删除）
 * @param id 模板 ID（必填）
 * @returns Promise<void> 无返回数据（后端 204）
 */
export async function deleteApprovalTemplate(id: number): Promise<void> {
  await http.delete(`/approvals/templates/${id}`)
  invalidate(TEMPLATE_CACHE_PREFIX)
}

/**
 * POST /api/approvals/templates/{template_id}/steps 为模板添加审批步骤
 * @param templateId 模板 ID（必填）
 * @param body 步骤参数（必填）：step_no 必填，position/assignee_value/description 可选
 * @returns Promise<number> 新步骤 ID（必返回）
 */
export async function addApprovalTemplateStep(
  templateId: number,
  body: ApprovalTemplateStepCreate,
): Promise<number> {
  const res = await http.post<ApprovalTemplateCreatedResponse>(
    `/approvals/templates/${templateId}/steps`,
    body,
  )
  invalidate(TEMPLATE_CACHE_PREFIX)
  return res.data.id
}

/**
 * PATCH /api/approvals/templates/{template_id}/steps/{step_id} 更新审批步骤
 * @param templateId 模板 ID（必填）
 * @param stepId 步骤 ID（必填）
 * @param body 更新参数（必填，字段均可选）：step_no/position/assignee_value/description
 * @returns Promise<void> 无返回数据（后端 204）
 */
export async function updateApprovalTemplateStep(
  templateId: number,
  stepId: number,
  body: ApprovalTemplateStepUpdate,
): Promise<void> {
  await http.patch(
    `/approvals/templates/${templateId}/steps/${stepId}`,
    body,
  )
  invalidate(TEMPLATE_CACHE_PREFIX)
}

/**
 * DELETE /api/approvals/templates/{template_id}/steps/{step_id} 删除审批步骤
 * @param templateId 模板 ID（必填）
 * @param stepId 步骤 ID（必填）
 * @returns Promise<void> 无返回数据（后端 204）
 */
export async function deleteApprovalTemplateStep(
  templateId: number,
  stepId: number,
): Promise<void> {
  await http.delete(`/approvals/templates/${templateId}/steps/${stepId}`)
  invalidate(TEMPLATE_CACHE_PREFIX)
}