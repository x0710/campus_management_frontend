/**
 * 审批模板模块类型定义：列表/详情、模板与审批步骤的查询、创建、更新请求体。
 * 分页结构统一复用 types/common.ts 的 PaginatedResponse，本文件不再重复声明。
 * 供 api/approvalmodel.ts 的请求函数与领导端「审批模板管理」视图复用。
 *
 * 与后端 campus-approval DTO 对齐说明：
 * - 响应体 `enabled` 后端为 i8（1 启用 / 0 停用），JSON 中是**数字**；
 *   而请求体（创建/更新）后端为 `Option<bool>`，提交时必须传布尔值，切勿把响应的数字回填后原样提交；
 * - 响应体 `description` 后端为 String（可能为空串），展示时用 `|| '—'` 兜底；
 * - 步骤请求体的 position / assignee_value / description 后端均为 Option，故可选；
 * - 步骤 `position` 落库为职位编码，approval_template_step 表对其有外键约束
 *   （REFERENCES position(code)），故只允许填系统中已存在的职位编码。
 */
import type { PageQuery } from './common'

/** 审批模板列表条目（GET /api/approvals/templates 数组元素）
 * @property id 模板 ID（必填）
 * @property code 模板编码（全局唯一，必填）
 * @property name 模板名称（必填）
 * @property business_type 业务类型（必填，后端为自由字符串）
 * @property enabled 是否启用（后端 i8：1 启用 / 0 停用，JSON 为数字，展示时按真值判断）
 * @property description 描述（后端可能为空串）
 * @property created_at 创建时间（RFC3339）
 * @property updated_at 更新时间（RFC3339）
 */
export interface ApprovalTemplate {
  id: number
  code: string
  name: string
  business_type: string
  enabled: number
  description: string | null
  created_at: string
  updated_at: string
}

/** 审批步骤条目（GET /api/approvals/templates/{id} 的 steps 元素）
 * @property id 步骤 ID（必填）
 * @property template_id 所属模板 ID（必填）
 * @property step_no 步骤编号（必填）
 * @property assignee_value 审批人参数（后端可为空）
 * @property position 审批人角色（后端可为空；落库为职位编码，须存在于 position 表，assignee_value 为空时启用）
 * @property description 描述（后端可能为空串）
 * @property created_at 创建时间（RFC3339）
 * @property updated_at 更新时间（RFC3339）
 */
export interface ApprovalStep {
  id: number
  template_id: number
  step_no: number
  assignee_value: string | null
  position: string | null
  description: string | null
  created_at: string
  updated_at: string
}

/** 审批模板详情（GET /api/approvals/templates/{id}）
 * @property steps 步骤列表（按 step_no 升序，后端始终返回数组）
 * 其余字段同 ApprovalTemplate
 */
export interface ApprovalTemplateDetail {
  id: number
  code: string
  name: string
  business_type: string
  /** 是否启用（后端 i8：1 启用 / 0 停用，JSON 为数字） */
  enabled: number
  description: string | null
  steps: ApprovalStep[] | null
  created_at: string
  updated_at: string
}

/** 分页查询审批模板参数（GET /api/approvals/templates）
 * @property page 页码，从 1 开始（可选，默认 1）
 * @property page_size 每页条数，最大 100（可选，默认 20）
 * @property keyword 按名称或编码模糊搜索（可选）
 * @property business_type 按业务类型精确筛选（可选，后端仅支持单值）
 * @property enabled 按启用状态筛选（可选）
 */
export interface ApprovalTemplateQuery extends PageQuery {
  keyword?: string
  business_type?: string
  enabled?: boolean
}

/** 创建审批模板请求体（POST /api/approvals/templates）
 * @property code 模板编码（必填，全局唯一）
 * @property name 模板名称（必填）
 * @property business_type 业务类型（必填）
 * @property enabled 是否启用（可选，须传布尔值；后端默认 true）
 * @property description 描述（可选）
 * @property steps 初始步骤列表（可选，与模板同事务写入）
 */
export interface ApprovalTemplateCreate {
  code: string
  name: string
  business_type: string
  enabled?: boolean | null
  description?: string | null
  steps?: ApprovalTemplateStepCreate[] | null
}

/** 更新审批模板请求体（PATCH /api/approvals/templates/{id}，code 不可改）
 * @property name 模板名称（可选）
 * @property business_type 业务类型（可选）
 * @property enabled 是否启用（可选，须传布尔值，不能传响应里的 0/1 数字）
 * @property description 描述（可选）
 */
export interface ApprovalTemplateUpdate {
  name?: string | null
  business_type?: string | null
  enabled?: boolean | null
  description?: string | null
}

/** 创建审批步骤请求体（POST /api/approvals/templates/{template_id}/steps）
 * @property step_no 步骤编号（必填，模板内唯一）
 * @property position 审批人角色（可选，须为 position 表中已存在的职位编码，assignee_value 为空时启用）
 * @property assignee_value 审批人参数（可选）
 * @property description 描述（可选）
 */
export interface ApprovalTemplateStepCreate {
  step_no: number
  position?: string | null
  assignee_value?: string | null
  description?: string | null
}

/** 更新审批步骤请求体（PATCH /api/approvals/templates/{template_id}/steps/{step_id}，字段均可选）
 * @property step_no 步骤编号（可选）
 * @property position 审批人角色（可选，须为 position 表中已存在的职位编码）
 * @property assignee_value 审批人参数（可选）
 * @property description 描述（可选）
 */
export interface ApprovalTemplateStepUpdate {
  step_no?: number | null
  position?: string | null
  assignee_value?: string | null
  description?: string | null
}

/** 创建成功响应（创建模板 / 添加步骤共用）
 * @property id 新建资源 ID（必填）
 */
export interface ApprovalTemplateCreatedResponse {
  id: number
}