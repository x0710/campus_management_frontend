/**
 * 党建活动加分接口层（后端 /api/party-scores）。
 *
 * 提供加分申请的查询/详情/创建，以及审批待办列表与通过/驳回/转交处理：
 *   GET    /api/party-scores                                        分页查询加分申请
 *   GET    /api/party/scores/organization-average                   查询指定组织党建活动加分平均分
 *   GET    /api/party/scores                                        批量查询用户党建活动加分总计
 *   POST   /api/party-scores                                        创建加分申请
 *   GET    /api/party-scores/{id}                                   加分申请详情
 *   PUT    /api/party-scores/approvals/{id}/approve                 审批通过（必须提交核定分数）
 *   PUT    /api/party-scores/approvals/{id}/reject                  审批驳回
 *   PUT    /api/party-scores/approvals/{id}/transfer                审批转交
 *
 * 查询类统一走会话缓存 cachedGet（代码要求 5）：相同查询条件只请求一次，手动刷新传 force=true 绕过缓存。
 * 写操作后失效 'GET /party-scores' 前缀缓存（含列表 / 详情 / 审批列表），保证下次读取拿到最新数据（代码要求 13）。
 *
 * 注意：后端把 /api/party-scores/{id} 注册在 /api/party-scores/approvals 之前，
 * GET /api/party-scores/approvals 会被误解析成 id="approvals" 并返回 404。
 * 因此审批列表改为：先按当前审批人取 GET /api/approvals（审批步骤），
 * 再按每个步骤的实例 ID 精确反查 GET /api/party-scores?approval_instance_id=… 判定是否属于加分业务。
 * 不能再用「拉取全部加分申请的实例 ID 集合做交集」的做法：该列表受调用者数据范围/分页影响，
 * 会让别人发起的申请被静默过滤掉（表现为审核列表只剩自己发起的申请）。
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
  PartyScoreDetail,
  PartyOrganizationScoreAverage,
  PartyOrganizationScoreAverageQuery,
  PartyScoreTotalItem,
  PartyScoreQuery,
  PartyScoreRejectRequest,
  PartyScoreTransferRequest,
} from './types/partyScores'

/** 分页拉取通用审批步骤时的单页条数（后端允许的最大值） */
const APPROVAL_STEP_FETCH_SIZE = 100

/** 审批步骤查询未传 page_size 时的默认条数 */
const PARTY_SCORE_APPROVAL_DEFAULT_SIZE = 20

/** 反查审批实例所属业务时的并发上限（避免一次性打出上百个请求） */
const PARTY_SCORE_LOOKUP_CONCURRENCY = 10

/** 列表摘要补齐详情字段时的并发上限（避免一次性打出上百个详情请求） */
const PARTY_SCORE_DETAIL_CONCURRENCY = 10

/**
 * 判断某个审批实例是否属于党建加分申请。
 * 审批步骤本身不返回业务类型，只能按实例 ID 精确反查加分申请：
 * 查到即属于加分审批，查不到说明是其他业务（如请假）的审批步骤。
 * @param instanceId 审批实例 ID（必填）
 * @param force 是否绕过缓存重新请求，默认 false
 * @returns Promise<boolean> 是否为党建加分审批实例
 */
async function isPartyScoreInstance(instanceId: number, force?: boolean): Promise<boolean> {
  const res = await queryPartyScores(
    { approval_instance_id: instanceId, page: 1, page_size: 1 },
    force,
  )
  return res.data.length > 0
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
 * 详情返回 file_urls（附件下载地址列表），可直接用于附件下载。
 * @param id 加分申请 ID（必填）
 * @param force 是否强制绕过缓存重新请求（用于手动刷新），默认 false
 * @returns Promise<PartyScoreDetail> 加分申请详情（含 file_urls）
 */
export function getPartyScore(id: number, force?: boolean) {
  return cachedGet<PartyScoreDetail>(`/party-scores/${id}`, undefined, { force })
}

/**
 * GET /api/party/scores/organization-average 查询指定组织党建活动加分平均分（会话缓存）。
 * 支持递归汇总下级组织；返回结果含组织名称、去重成员数与平均分（平均分无数据时为 null）。
 * @param params organization_id 必填，recursive 可选（默认 false）
 * @param force 是否强制绕过缓存重新请求（用于手动刷新），默认 false
 * @returns Promise<PartyOrganizationScoreAverage> 组织平均分统计
 */
export function getPartyScoreOrganizationAverage(
  params: PartyOrganizationScoreAverageQuery,
  force?: boolean,
) {
  return cachedGet<PartyOrganizationScoreAverage>(
    '/party/scores/organization-average',
    params as unknown as Record<string, unknown>,
    { force },
  )
}

/**
 * GET /api/party/scores 批量查询用户党建活动加分总计（会话缓存）。
 * 后端按 `uids=1,2,3` 逗号分隔查询，返回 `Vec<(uid, score_text)>`；
 * score_text 为 DecimalText 字符串，未返回的用户按 0 分处理。
 * @param uids 用户 ID 数组（必填；为空时直接返回空数组，不发请求）
 * @param force 是否强制绕过缓存重新请求（用于手动刷新），默认 false
 * @returns Promise<PartyScoreTotalItem[]> 用户加分总计数组
 */
export function getPartyScoreTotals(
  uids: number[],
  force?: boolean,
): Promise<PartyScoreTotalItem[]> {
  if (uids.length === 0) return Promise.resolve([])
  return cachedGet<PartyScoreTotalItem[]>(
    '/party/scores',
    { uids: uids.join(',') },
    { force },
  )
}

/**
 * 把分页返回的加分申请摘要补齐为可直接展示的完整字段。
 * 后端列表摘要可能不返回 template_id / created_at / updated_at，详情接口才会返回这些字段；
 * 这里仅对缺少任一展示字段的行调用 GET /api/party-scores/{id} 补齐（详情走会话缓存），
 * 单个详情失败时保留原始摘要，避免整页因某一行失败而不可用。
 * @param rows 列表摘要数组（必填）
 * @param force 是否绕过缓存重新请求详情（可选，默认 false；手动刷新时与列表保持同一 force）
 * @returns Promise<PartyScore[]> 补齐后的记录数组（顺序与入参一致）
 */
export async function hydratePartyScoreRows(
  rows: PartyScore[],
  force?: boolean,
): Promise<PartyScore[]> {
  const hydrated: PartyScore[] = []

  for (let start = 0; start < rows.length; start += PARTY_SCORE_DETAIL_CONCURRENCY) {
    const chunk = rows.slice(start, start + PARTY_SCORE_DETAIL_CONCURRENCY)
    const enriched = await Promise.all(
      chunk.map(async (row) => {
        if (row.template_id !== undefined && row.created_at && row.updated_at) return row
        try {
          const detail = await getPartyScore(row.id, force)
          return { ...row, ...detail }
        } catch {
          return row
        }
      }),
    )
    hydrated.push(...enriched)
  }

  return hydrated
}

/**
 * POST /api/party-scores 创建党建活动加分申请。
 * 201 返回新建申请 ID 与审批实例 ID；400 表示参数错误，403 表示无权访问，错误信息由调用方展示。
 * 如需上传附件：先调用 api/file.ts 的 uploadFiles 上传文件，再把返回的文件 ID 列表填入 files 字段（必填，无附件传空数组）。
 * @param data 创建请求体（template_id/requested_score/files 必填；申请人由后端按登录身份确定）
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
 * 实现：分页取 GET /api/approvals（审批步骤），再按每个步骤的实例 ID 精确反查加分申请，
 * 仅保留属于党建加分业务的步骤；裸数组无 total，按筛选后的结果在前端分页。
 * 调用方应显式传 approver_id（当前登录用户），不依赖后端「缺省即本人待办」的隐式行为，
 * 同时让缓存键包含审批人，避免不同用户之间串用缓存。
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
    APPROVAL_STEP_FETCH_SIZE,
  )
  const targetOffset = (page - 1) * pageSize
  const targetEnd = targetOffset + pageSize

  const collected: ApprovalInstanceStep[] = []
  /** 本次调用内已反查过的实例归属，避免同一实例重复请求 */
  const verified = new Map<number, boolean>()
  let rawPage = 1

  while (collected.length < targetEnd) {
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

    // 分批并发反查实例归属：既保证「别人的申请不被误过滤」，也避免一次性打出上百个请求
    for (let start = 0; start < steps.length; start += PARTY_SCORE_LOOKUP_CONCURRENCY) {
      const chunk = steps.slice(
        start,
        start + PARTY_SCORE_LOOKUP_CONCURRENCY,
      )
      const uniqueIds = [...new Set(chunk.map((step) => step.instance_id))]
      const flags = await Promise.all(
        uniqueIds.map(async (id) => {
          let owned = verified.get(id)
          if (owned === undefined) {
            owned = await isPartyScoreInstance(id, force)
            verified.set(id, owned)
          }
          return [id, owned] as const
        }),
      )
      const flagMap = new Map(flags)
      for (const step of chunk) {
        if (flagMap.get(step.instance_id)) collected.push(step)
      }
      // 已收集够本页所需数据即可停止，不再扫描后续步骤
      if (collected.length >= targetEnd) break
    }

    // 裸数组无 total：不足一页表示已到末尾
    if (steps.length < APPROVAL_STEP_FETCH_SIZE) break
    rawPage += 1
  }

  return collected.slice(targetOffset, targetEnd)
}

/**
 * PUT /api/party-scores/approvals/{id}/approve 审批通过，成功返回 200 无 body。
 * 403 表示无权访问，错误信息由调用方展示。
 * @param id 审批步骤 ID（必填）
 * @param data 审批通过请求体（comment 必填；reviewed_score 为必填 Decimal 字符串，对应后端 DecimalText）
 * @returns Promise<void>
 */
export function approvePartyScore(id: number, data: PartyScoreApproveRequest): Promise<void> {
  return http.put(`/party-scores/approvals/${id}/approve`, data).then((res) => {
    invalidate('GET /party-scores')
    invalidate('GET /approvals?')
    // 审批意见记录（GET /api/approvals/{id}/records）随操作变化，同步失效
    invalidate('GET /approvals/')
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
    // 审批意见记录（GET /api/approvals/{id}/records）随操作变化，同步失效
    invalidate('GET /approvals/')
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
    // 审批意见记录（GET /api/approvals/{id}/records）随操作变化，同步失效
    invalidate('GET /approvals/')
    return res.data
  })
}
