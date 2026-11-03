/**
 * 党建活动加分审核相关常量（代码要求 7：常量统一收敛到 config/，便于复用）。
 * 供党委支部端 / 党委学院端 / 党委学校端的审核管理页使用。
 */
import type { ApprovalStepStatus } from '../api/types/approvals'

/** 审核列表每页条数（代码要求 12：单页最多 100 行） */
export const PARTY_SCORE_APPROVAL_PAGE_SIZE = 20

/**
 * 工作台「待办事项」统计待审核申报时单次拉取条数。
 *
 * 审批步骤接口不返回分页 total，只能按返回条数合计；取单页上限 100，
 * 尽量接近真实待办数（代码要求 12：单页最多 100 行）。
 */
export const PARTY_SCORE_TODO_PAGE_SIZE = 100

/** 转交对象搜索一次拉取的条数 */
export const PARTY_SCORE_TRANSFER_USER_PAGE_SIZE = 20

/** 审批步骤状态 → Tag 配色 */
export const PARTY_SCORE_APPROVAL_STATUS_COLOR: Record<ApprovalStepStatus, string> = {
  waiting: 'default',
  pending: 'processing',
  approved: 'green',
  rejected: 'red',
  skipped: 'orange',
}

/**
 * 审批步骤是否可操作（等待中 / 待处理才允许通过、驳回或转交）。
 * @param status 审批步骤状态（必填）
 * @returns true 表示可操作，false 表示不可操作
 */
export function isPartyScoreStepActionable(status: ApprovalStepStatus): boolean {
  return status === 'waiting' || status === 'pending'
}
