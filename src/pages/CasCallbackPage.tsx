import { Button, Space, Spin } from 'antd'
import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { exchangeCasTicket, InvalidCasCallbackError } from '../api/cas'
import { extractErrorReason } from '../api/common'
import type { LoginResponse } from '../api/types/auth'
import ErrorState from '../components/ErrorState'
import { useLoginSuccess } from '../composables/useLoginSuccess'
import { LOGIN_PATH } from '../config/routes'
import { useT } from '../i18n'
import { useAuthStore } from '../store/auth'

/** 公开回调页：CAS 返回 ticket 后，由前端请求验票并接收登录 JSON。 */
export default function CasCallbackPage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const completeLogin = useLoginSuccess()
  // 清除地址栏中的票据后，仍保留本次流程的原始参数。
  const [search] = useState(location.search)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<{ token: string | null; promise: Promise<LoginResponse> } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.history.replaceState(window.history.state, '', location.pathname)
    // StrictMode 重跑 effect 时复用同一个 Promise，不重复消费一次性 ticket。
    request.current ??= {
      token: useAuthStore.getState().token,
      promise: exchangeCasTicket(search),
    }
    const current = request.current
    void current.promise.then((response) => {
      if (cancelled) return
      if (useAuthStore.getState().token !== current.token) {
        setError(t('login.casSessionChanged'))
        return
      }
      completeLogin(response, 'cas')
    }).catch((reason: unknown) => {
      if (cancelled) return
      setError(reason instanceof InvalidCasCallbackError
        ? t('login.casInvalidCallback')
        : axios.isAxiosError(reason) ? extractErrorReason(reason, t) : t('login.casFailed'))
    })
    return () => { cancelled = true }
  }, [search, location.pathname, completeLogin, t])

  return (
    <div className="portal-redirect">
      <Space orientation="vertical" size="large" style={{ maxWidth: 560, padding: 24 }}>
        {error ? <>
          <ErrorState message={error} />
          <Button type="primary" onClick={() => navigate(LOGIN_PATH, { replace: true })}>
            {t('login.backToLogin')}
          </Button>
        </> : <>
          <Spin size="large" />
          <span>{t('login.casVerifying')}</span>
        </>}
      </Space>
    </div>
  )
}
