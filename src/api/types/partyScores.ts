/**
 * 党建活动加分（party-scores）模块类型定义。
 *
 * 对应后端 tag「party-score」的 /api/party-scores 系列接口：
 *   GET   /api/party-scores                                  分页查询加分申请
 *   GET   /api/party/scores/organization-average             查询组织党建活动加分平均分
 *   GET   /api/party/scores                                  批量查询用户党建活动加分总计
 *   POST  /api/party-scores                                  创建加分申请
 *   GET   /api/party-scores/{id}                             加分申请详情（含附件下载地址 file_urls）
 *   GET   /api/party-scores/approvals                        当前审批人已处理的审批步骤列表
 *   PUT   /api/party-scores/approvals/{id}/approve|reject|transfer  审批通过/驳回/转交
 * （接口契约以 Swagger 为准；模型名对应 api.json: PartyScore* / ApprovalInstanceStep）
 *
 * 说明：i64 字段在 JSON 中序列化为数字，前端统一用 number 承接；
 * 分数为后端 DecimalText（JSON 字符串，如 "5" / "-2.5"），前端统一用 string 承接并原样透传，
 * 避免浮点精度丢失；DateTime 统一用字符串（RFC3339）。
 * 供 api/partyScores.ts 的请求函数与党建端各视图复用。
 */
import type { ApprovalStepStatus } from './approvals'
import type { PageQuery } from './common'

/** 党建活动加分申请记录（api.json: PartyScoreInfo，列表项不含 template_id） */
export interface PartyScore {
  /** 加分申请 ID */
  id: number
  /** 审批模板 ID（仅详情接口返回；列表项可能不含） */
  template_id?: number
  /** 申请人用户 ID */
  user_id: number
  /** 申请加分（DecimalText 字符串，可正可负，如 "5" / "-2.5"） */
  requested_score: string
  /** 审批核定分数（DecimalText 字符串）；未审批通过时为 null */
  approved_score: string | null
  /** 关联的审批实例 ID */
  approval_instance_id: number
  /** 创建时间（RFC3339） */
  created_at: string
  /** 更新时间（RFC3339） */
  updated_at: string
  /** 附件下载地址列表（详情接口返回；列表项可能不含） */
  file_urls?: string[]
  /** 申请加分原因（列表摘要可能不含；详情接口必返回，可为空串） */
  reason?: string
}

/** GET /api/party-scores/{id} 加分申请详情（api.json: PartyScoreDetail） */
export interface PartyScoreDetail extends PartyScore {
  /** 审批模板 ID（详情必返回） */
  template_id: number
  /** 附件下载地址列表（后端已签发地址，可直接打开下载） */
  file_urls: string[]
  /** 申请加分原因（详情必返回，可为空串） */
  reason: string
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
  /** 申请加分（必填，DecimalText 字符串，可正可负） */
  requested_score: string
  /**
   * 附件文件 ID 列表（必填，无附件时传空数组）。
   * 需先调用 POST /api/files 上传文件，再把返回的 id 填入此字段，实现申请与附件匹配。
   */
  files: number[]
  /** 申请加分原因（可选，推荐填写；后端按字符串原样保存） */
  reason?: string
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
  /**
   * 审批核定分数（后端 PartyScoreApproveRequest.reviewed_score 为必填 DecimalText，
   * JSON 中是以字符串传输的 Decimal；审批通过时必传，驳回/转交时不使用）。
   */
  reviewed_score: string
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

/** GET /api/party/scores/organization-average 组织党建活动加分平均分（api.json: PartyOrganizationScoreAverage） */
export interface PartyOrganizationScoreAverage {
  /** 组织 ID */
  organization_id: number
  /** 组织名称 */
  organization_name: string
  /** 组织成员数（含递归下级时为本级及下级去重人数） */
  member_count: number
  /** 党建活动加分平均分（后端 DecimalText，JSON 字符串；无数据时为 null） */
  average_score: string | null
}

/** GET /api/party/scores/organization-average 查询参数 */
export interface PartyOrganizationScoreAverageQuery {
  /** 组织 ID（必填） */
  organization_id: number
  /** 是否递归汇总下级组织，默认 false */
  recursive?: boolean
}

/** GET /api/party/scores 批量查询返回项：[用户 ID, 党建活动加分总计（DecimalText 字符串）] */
export type PartyScoreTotalItem = [number, string]
