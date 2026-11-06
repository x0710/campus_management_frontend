import { useNavigate, useParams } from 'react-router'
import { resolveApprovalNoticePath } from '../api/noticeApprovals'
import type { Notice } from '../api/types/notices'

export function useApprovalNoticeNavigation() {
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()
  return async (notice: Notice) => {
    const path = await resolveApprovalNoticePath(notice, portalKey)
    if (path) navigate(path)
  }
}
