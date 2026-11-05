import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import axios from 'axios'
import { impersonateUser } from '../api/auth'
import { invalidate } from '../api/cache'
import { useAuthStore } from '../store/auth'
import { useAccountSwitchHistory } from '../store/accountSwitchHistory'
import { useErrorFeedback } from './useErrorFeedback'

/** 列表和顶部快捷入口共用切换逻辑，成功后记录历史并保留管理员的返回位置。 */
export function useAccountSwitch() {
  const [switchingUid, setSwitchingUid] = useState<number | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const reportError = useErrorFeedback()
  const switchAccount = useCallback(async (uid: number, name?: string | null) => {
    setSwitchingUid(uid)
    try {
      const auth = useAuthStore.getState()
      const result = await impersonateUser(uid, auth.originalAuth?.token)
      if (useAuthStore.getState().token !== auth.token) return
      const owner = auth.originalAuth?.username ?? auth.username
      if (owner) useAccountSwitchHistory.getState().remember(owner, {
        uid, username: result.user, name: name ?? null,
      })
      invalidate()
      useAuthStore.getState().impersonate({
        token: result.token, username: result.user, lastLoginAt: result.last_login_at,
      }, `${location.pathname}${location.search}${location.hash}`)
      navigate('/', { replace: true })
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) reportError(err)
    } finally {
      setSwitchingUid(null)
    }
  }, [navigate, reportError, location.pathname, location.search, location.hash])

  return { switchAccount, switchingUid }
}
