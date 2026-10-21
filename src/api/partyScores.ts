/**
 * 党建活动加分接口层（后端 /api/party-scores）。
 *
 * 提供加分申请的查询/详情/创建，以及审批待办列表与通过/驳回/转交处理：
 *   GET    /api/party-scores                                        分页查询加分申请
 *   POST   /api/party-scores                                        创建加分申请
 *   GET    /api/party-scores/{id}                                   加分申请详情
 *   PUT    /api/party-scores/approvals/{id}/approve                 审批通过
 *   PUT    /api/party-scores/approvals/{id}/reject                  审批驳回
 *   PUT    /api/party-scores/approvals/{id}/transfer                审批转交
 *
 * 查询类统一走会话缓存 cachedGet（代码要求 5）：相同查询条件只请求一次，手动刷新传 force=true 绕过缓存。
 * 写操作后失效 'GET /party-scores' 前缀缓存（含列表 / 详情 / 审批列表），保证下次读取拿到最新数据（代码要求 13）。
 *
 * 注意：后端把 /api/party-scores/{id} 注册在 /api/party-scores/approvals 之前，
 * GET /api/party-scores/approvals 会被误解析成 id="approvals" 并返回 404。
 * 因此审批列表不直接请求该地址，而是用 GET /api/party-scores 获取全部加分申请实例 ID，
 * 再按实例过滤 GET /api/approvals（当前审批人的审批步骤），在前端合成同样的结果。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { ApprovalInstanceStep, ApprovalTodoQuery } from './types/approvals'
import type { PaginatedResponse } from './types/common'
import type {
  PartyScore,
  PartyScoreApproveRequest,
  PartyScoreApprovalQuery,
  PartyScoreCreateRequest,
  PartyScoreCreateResponse,
  PartyScoreQuery,
  PartyScoreRejectRequest,
  PartyScoreTransferRequest,
} from './types/partyScores'

/** 分页拉取 party-scores 时的单页条数（后端允许的最大值） */
const PARTY_SCORE_FETCH_SIZE = 100

/** 分页拉取通用审批步骤时的单页条数（后端允许的最大值） */
const APPROVAL_STEP_FETCH_SIZE = 100

/** 审批步骤查询未传 page_size 时的默认条数 */
const PARTY_SCORE_APPROVAL_DEFAULT_SIZE = 20

/**
 * 获取全部分活动加分申请对应的审批实例 ID 集合（会话缓存）。
 * 用于把通用审批步骤列表过滤成党建加分审批步骤。
 * @param force 是否绕过缓存重新请求（用于手动刷新），默认 false
 * @returns Promise<Set<number>> 审批实例 ID 集合（可能为空，不会为 null）
 */
async function fetchPartyScoreInstanceIds(force = false): Promise<Set<number>> {
  const first = await queryPartyScores(
    { page: 1, page_size: PARTY_SCORE_FETCH_SIZE },
    force,
  )
  const ids = new Set(first.data.map((item) => item.approval_instance_id))
  for (let page = 2; page <= first.total_pages; page++) {
    const res = await queryPartyScores(
      { page, page_size: PARTY_SCORE_FETCH_SIZE },
      force,
    )
    for (const item of res.data) ids.add(item.approval_instance_id)
  }
  return ids
}

/**
 * GET /api/party-scores 分页查询党建活动加分申请（会话缓存）。
 * @param params 查询参数（page/page_size/template_id/user_id/approval_instance_id，均可选，默认 {}）
 * @param force 是否强制绕过缓存重新请求（用于手动刷新），默认 false
 * @returns Promise<PaginatedResponse<PartyScore>> 分页结果（data 为加分申请数组）
 */
export function queryPartyScores(params: PartyScoreQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<PartyScore>>(
    '/party-scores',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * GET /api/party-scores/{id} 获取加分申请详情（会话缓存）。
 * @param id 加分申请 ID（必填）
 * @param force 是否强制绕过缓存重新请求（用于手动刷新），默认 false
 * @returns Promise<PartyScore> 加分申请详情
 */
export function getPartyScore(id: number, force?: boolean) {
  return cachedGet<PartyScore>(`/party-scores/${id}`, undefined, { force })
}

/**
 * POST /api/party-scores 创建党建活动加分申请。
 * 201 返回新建申请 ID 与审批实例 ID；400 表示参数错误，403 表示无权访问，错误信息由调用方展示。
 * @param data 创建请求体（template_id/user_id/requested_score，均必填）
 * @returns Promise<PartyScoreCreateResponse> 新建申请 ID 与审批实例 ID
 */
export function createPartyScore(data: PartyScoreCreateRequest) {
  return http.post<PartyScoreCreateResponse>('/party-scores', data).then((res) => {
    invalidate('GET /party-scores')
    // 审核列表由 /api/approvals + /api/party-scores 前端合成，新申请会新增待办步骤，
    // 必须同时失效通用审批列表缓存，否则同一会话内刚提交的申请不会出现在审核列表
    invalidate('GET /approvals?')
    return res.data
  })
}

/**
 * 获取当前审批人的党建加分审批步骤列表（会话缓存）。
 * 后端 GET /api/party-scores/approvals 与 /api/party-scores/{id} 路由冲突，返回 404，
 * 故改用 GET /api/party-scores 的实例 ID + GET /api/approvals 的前端合成实现。
 * 注意：两个底层接口都返回裸数组（无分页 total），本函数按筛选后的结果完成前端分页。
 * @param params 查询参数（approver_id/applicant_id/organization_id/status/page/page_size，均可选，默认 {}）
 * @param force 是否强制绕过缓存重新请求（用于手动刷新），默认 false
 * @returns Promise<ApprovalInstanceStep[]> 指定页的党建加分审批步骤数组（必返回，可能为空）
 */
export async function queryPartyScoreApprovals(
  params: PartyScoreApprovalQuery = {},
  force?: boolean,
): Promise<ApprovalInstanceStep[]> {
  const page = params.page && params.page >= 1 ? params.page : 1
  const pageSize = Math.min(
    params.page_size ?? PARTY_SCORE_APPROVAL_DEFAULT_SIZE,
    PARTY_SCORE_FETCH_SIZE,
  )
  const targetOffset = (page - 1) * pageSize
  const targetEnd = targetOffset + pageSize

  const partyInstanceIds = await fetchPartyScoreInstanceIds(force)

  const collected: ApprovalInstanceStep[] = []
  let rawPage = 1
  while (true) {
    const rawParams: ApprovalTodoQuery = {
      ...(params.approver_id !== undefined ? { approver_id: params.approver_id } : {}),
      ...(params.applicant_id !== undefined ? { applicant_id: params.applicant_id } : {}),
      ...(params.organization_id !== undefined
        ? { organization_id: params.organization_id }
        : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
      page: rawPage,
      page_size: APPROVAL_STEP_FETCH_SIZE,
    }
    const steps = await cachedGet<ApprovalInstanceStep[]>(
      '/approvals',
      rawParams as Record<string, unknown>,
      { force },
    )
    for (const step of steps) {
      if (partyInstanceIds.has(step.instance_id)) collected.push(step)
    }
    // 裸数组无 total：不足一页表示已到末尾；已收集够本页数据时提前结束
    if (steps.length < APPROVAL_STEP_FETCH_SIZE || collected.length >= targetEnd) break
    rawPage += 1
  }

  return collected.slice(targetOffset, targetEnd)
}

/**
 * PUT /api/party-scores/approvals/{id}/approve 审批通过，成功返回 200 无 body。
 * 403 表示无权访问，错误信息由调用方展示。
 * @param id 审批步骤 ID（必填）
 * @param data 审批通过请求体（comment 必填，reviewed_score 可选）
 * @returns Promise<void>
 */
export function approvePartyScore(id: number, data: PartyScoreApproveRequest): Promise<void> {
  return http.put(`/party-scores/approvals/${id}/approve`, data).then((res) => {
    invalidate('GET /party-scores')
    invalidate('GET /approvals?')
    return res.data
  })
}

/**
 * PUT /api/party-scores/approvals/{id}/reject 审批驳回，成功返回 200 无 body。
 * 403 表示无权访问，错误信息由调用方展示。
 * @param id 审批步骤 ID（必填）
 * @param data 驳回请求体（comment 必填）
 * @returns Promise<void>
 */
export function rejectPartyScore(id: number, data: PartyScoreRejectRequest): Promise<void> {
  return http.put(`/party-scores/approvals/${id}/reject`, data).then((res) => {
    invalidate('GET /party-scores')
    invalidate('GET /approvals?')
    return res.data
  })
}

/**
 * PUT /api/party-scores/approvals/{id}/transfer 审批转交，成功返回 200 无 body。
 * 403 表示无权访问，错误信息由调用方展示。
 * @param id 审批步骤 ID（必填）
 * @param data 转交请求体（transfer_to/comment 必填）
 * @returns Promise<void>
 */
export function transferPartyScore(id: number, data: PartyScoreTransferRequest): Promise<void> {
  return http.put(`/party-scores/approvals/${id}/transfer`, data).then((res) => {
    invalidate('GET /party-scores')
    invalidate('GET /approvals?')
    return res.data
  })
}
