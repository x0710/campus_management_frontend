import { Alert, Button } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { getCurrentUser } from '../api/auth'
import { queryPartyScoreApprovals } from '../api/partyScores'
import { useT } from '../i18n'

/** 首页只对确有本人待办的党员展示审批入口。 */
export default function PartyApprovalEntry() {
  const t = useT()
  const navigate = useNavigate()
  const [hasPending, setHasPending] = useState(false)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const me = await getCurrentUser()
        if (cancelled) return
        const steps = await queryPartyScoreApprovals({ approver_id: me.uid, status: 'pending', page: 1, page_size: 1 }, true)
        if (!cancelled) setHasPending(steps.length > 0)
      } catch {
        // 不影响首页；通知中的审批入口仍然可用。
      }
    }
    void load()
    window.addEventListener('focus', load)
    return () => { cancelled = true; window.removeEventListener('focus', load) }
  }, [])
  if (!hasPending) return null
  return <Alert type="info" showIcon title={t('partyProfile.pendingApprovalHint')}
    action={<Button type="primary" onClick={() => navigate('/portal/party/party_m5')}>
      {t('portal.party_m5')}
    </Button>} />
}
