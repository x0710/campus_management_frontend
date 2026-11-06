import { queryPartyScores } from './partyScores'
import type { Notice } from './types/notices'
import { parseApprovalNotice } from '../utils/noticeApproval'

export async function resolveApprovalNoticePath(notice: Notice, portalKey?: string): Promise<string | null> {
  const target = parseApprovalNotice(notice)
  if (!target) return null
  const portal = portalKey === 'branch' || portalKey === 'academy' ? portalKey : 'party'
  const module = portal === 'party' ? 'party_m5' : `${portal}_m3`
  const base = `/portal/${portal}`
  if (target.stepId) return `${base}/party-score-approvals/${target.stepId}?from=${module}`
  if (target.instanceId) {
    try {
      const result = await queryPartyScores({ approval_instance_id: target.instanceId, page: 1, page_size: 1 }, true)
      const score = result.data[0]
      if (score) return `/portal/party/party-scores/${score.id}?from=party_m4`
    } catch {
      // 旧通知或关联申请不可访问时，回退到本人审批列表。
    }
  }
  return `${base}/${module}`
}
