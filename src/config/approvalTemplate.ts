/**
 * 审批模板管理常量集中定义（代码要求 7：常量统一放 config/，便于复用）。
 * 文案走 i18n（approvalTemplate.business_*），这里只放业务类型选项、配色、分页与输入长度限制。
 * 说明：后端 business_type 为自由字符串、无枚举，故此处仅收敛前端常用选项；
 * 需要新增业务类型时改本文件 + i18n 即可。
 */
import type { TranslateFn } from '../i18n'

/** 业务类型固定选项（表单下拉与工具栏多选筛选共用） */
export const APPROVAL_BUSINESS_TYPE_OPTIONS: string[] = [
  'leave',
  'announcement',
  'course',
]

/** 「其他」选项值：选中后展开自定义输入框，提交时上送用户输入的真实类型 */
export const APPROVAL_BUSINESS_TYPE_OTHER = 'other'

/** 业务类型 → Tag 配色（夜间模式下 antd Tag 自动适配）；未命中时回退默认色 */
export const APPROVAL_BUSINESS_TYPE_COLOR: Record<string, string> = {
  leave: 'blue',
  announcement: 'purple',
  course: 'geekblue',
  other: 'default',
}

/** 模板列表每页展示条数（代码要求 12：表格每页最多 20 行） */
export const APPROVAL_TEMPLATE_PAGE_SIZE = 20

/**
 * 前端一次拉取的模板条数上限。
 * 后端 business_type 筛选仅支持单值，无法承载「类型多选」，故本页一次性取回后再在前端
 * 完成多选筛选与分页；100 为后端允许的最大 page_size。
 */
export const APPROVAL_TEMPLATE_FETCH_SIZE = 100

/** 模板编码最大长度 */
export const APPROVAL_TEMPLATE_CODE_MAX_LENGTH = 64

/** 模板名称最大长度 */
export const APPROVAL_TEMPLATE_NAME_MAX_LENGTH = 64

/** 模板描述最大长度 */
export const APPROVAL_TEMPLATE_DESC_MAX_LENGTH = 200

/** 自定义业务类型最大长度（选「其他」时的输入限制） */
export const APPROVAL_BUSINESS_TYPE_CUSTOM_MAX_LENGTH = 64

/** 审批步骤编号取值范围 */
export const APPROVAL_STEP_NO_MIN = 1
export const APPROVAL_STEP_NO_MAX = 99

/**
 * 审批步骤「审批人角色」下拉一次性拉取的职位条数。
 * 该字段落库为职位编码且受 position 表外键约束，只能从既有职位中选择，故需拉取职位列表；
 * 100 为分页接口允许的最大 page_size。
 */
export const APPROVAL_POSITION_FETCH_SIZE = 100

/** 审批步骤「审批人参数」最大长度 */
export const APPROVAL_STEP_ASSIGNEE_MAX_LENGTH = 64

/** 审批步骤描述最大长度 */
export const APPROVAL_STEP_DESC_MAX_LENGTH = 200

/**
 * 业务类型展示名：固定选项走 i18n，自定义（「其他」）类型原样展示。
 * @param type 业务类型原始值（可选，空值显示「未分类」）
 * @param t 翻译函数（必填，来自 useT()）
 * @returns string 展示文案（必返回）
 */
export function getBusinessTypeLabel(
  type: string | null | undefined,
  t: TranslateFn,
): string {
  if (!type) return t('approvalTemplate.businessUnknown')
  return APPROVAL_BUSINESS_TYPE_OPTIONS.includes(type)
    ? t(`approvalTemplate.business_${type}`)
    : type
}

/**
 * 业务类型 Tag 配色。
 * @param type 业务类型原始值（可选，未命中时回退 default）
 * @returns string antd Tag 颜色（必返回）
 */
export function getBusinessTypeColor(type: string | null | undefined): string {
  return (type && APPROVAL_BUSINESS_TYPE_COLOR[type]) || 'default'
}