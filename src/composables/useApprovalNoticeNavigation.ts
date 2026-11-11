import { usePortalParams } from '../hooks/usePortalParams'
import { useNavigate } from 'react-router'
import { resolveApprovalNoticePath } from '../api/noticeApprovals'
import type { Notice } from '../api/types/notices'

export function useApprovalNoticeNavigation() {
  const navigate = useNavigate()
  const { portalKey } = usePortalParams<{ portalKey: string }>()
  return async (notice: Notice) => {
    const path = await resolveApprovalNoticePath(notice, portalKey)
    if (path) navigate(path)
  }
}
