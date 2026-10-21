/**
 * 党建活动加分（party-scores）模块类型定义。
 *
 * 对应后端 tag「party-score」的 /api/party-scores 系列接口：
 *   GET   /api/party-scores                                  分页查询加分申请
 *   POST  /api/party-scores                                  创建加分申请
 *   GET   /api/party-scores/{id}                             加分申请详情
 *   GET   /api/party-scores/approvals                        当前审批人已处理的审批步骤列表
 *   PUT   /api/party-scores/approvals/{id}/approve|reject|transfer  审批通过/驳回/转交
 * （接口契约以 Swagger 为准；模型名对应 api.json: PartyScore* / ApprovalInstanceStep）
 *
 * 说明：i64 字段在 JSON 中序列化为数字，前端统一用 number 承接；DateTime 统一用字符串（RFC3339）。
 * 供 api/partyScores.ts 的请求函数与党建端各视图复用。
 */
import type { ApprovalStepStatus } from './approvals'
import type { PageQuery } from './common'

/** 党建活动加分申请记录（api.json: PartyScore，列表项与详情同构） */
export interface PartyScore {
  /** 加分申请 ID */
  id: number
  /** 审批模板 ID（服务端据此为该用户创建审批实例） */
  template_id: number
  /** 申请人用户 ID */
  user_id: number
  /** 申请加分（int64，可正可负） */
  requested_score: number
  /** 审批核定分数；未审批通过时为 null */
  approved_score: number | null
  /** 关联的审批实例 ID */
  approval_instance_id: number
  /** 创建时间（RFC3339） */
  created_at: string
  /** 更新时间（RFC3339） */
  updated_at: string
}

/**
 * GET /api/party-scores 分页查询参数。
 * 继承 PageQuery（page/page_size 均可选）。
 */
export interface PartyScoreQuery extends PageQuery {
  /** 按审批模板 ID 精确筛选 */
  template_id?: number
  /** 按申请用户 ID 精确筛选 */
  user_id?: number
  /** 按关联审批实例 ID 精确筛选 */
  approval_instance_id?: number
}

/** POST /api/party-scores 创建加分申请请求体 */
export interface PartyScoreCreateRequest {
  /** 审批模板 ID（必填） */
  template_id: number
  /** 申请用户 ID（必填） */
  user_id: number
  /** 申请加分（必填，int64） */
  requested_score: number
}

/** POST /api/party-scores 创建成功响应（api.json: PartyScoreCreateResponse） */
export interface PartyScoreCreateResponse {
  /** 新建加分申请 ID */
  id: number
  /** 随之创建的审批实例 ID */
  approval_instance_id: number
}

/**
 * GET /api/party-scores/approvals 查询参数。
 * 继承 PageQuery（page/page_size 均可选）；返回裸数组（无分页 total）。
 */
export interface PartyScoreApprovalQuery extends PageQuery {
  /** 按审批人 ID 筛选 */
  approver_id?: number
  /** 按申请人 ID 筛选 */
  applicant_id?: number
  /** 按组织 ID 筛选 */
  organization_id?: number
  /** 按审批步骤状态筛选 */
  status?: ApprovalStepStatus
}

/** PUT /api/party-scores/approvals/{id}/approve 审批通过请求体 */
export interface PartyScoreApproveRequest {
  /** 审批意见（必填） */
  comment: string
  /** 审批核定分数，用于留痕并作为最终审批分数（可选，缺省为 null） */
  reviewed_score?: number | null
}

/** PUT /api/party-scores/approvals/{id}/reject 审批驳回请求体 */
export interface PartyScoreRejectRequest {
  /** 驳回意见（必填） */
  comment: string
}

/** PUT /api/party-scores/approvals/{id}/transfer 审批转交请求体 */
export interface PartyScoreTransferRequest {
  /** 转交给的目标用户 ID（必填） */
  transfer_to: number
  /** 转交意见（必填） */
  comment: string
}
