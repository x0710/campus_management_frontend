/** 请假相关常量，供列表标签、详情弹窗等多处复用。 */
 
import type { LeaveType } from '../api/leaves'
import type { ApprovalStepStatus } from '../api/approvals'

/**
 * 请假相关常量集中定义，供列表标签、详情弹窗等多处复用。
 * 文案走 i18n（key 后缀与类型编码一致），这里仅放与展示样式相关的静态映射。
 */

/** 请假类型 → Tag 配色（夜间模式下 antd Tag 自动适配） */
export const LEAVE_TYPE_COLOR: Record<LeaveType, string> = {
  personal: 'blue',
  sick: 'red',
  public: 'green',
  other: 'default',
}

/**
 * 请假审批状态 → Tag 配色。
 * 请假状态取自审批实例步骤状态（waiting/pending/approved/rejected/skipped）。
 */
export const LEAVE_STATUS_COLOR: Record<ApprovalStepStatus, string> = {
  waiting: 'default',
  pending: 'processing',
  approved: 'green',
  rejected: 'red',
  skipped: 'default',
}

/** i18n key 后缀：t(`leaveDetail.type_${type}`) */
export const LEAVE_TYPE_KEY_SUFFIX: Record<LeaveType, string> = {
  personal: 'personal',
  sick: 'sick',
  public: 'public',
  other: 'other',
}
