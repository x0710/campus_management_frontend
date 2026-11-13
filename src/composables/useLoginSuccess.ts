import { App as AntdApp } from 'antd'
import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { CAMPUS_PATH } from '../config/routes'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime, formatElapsed } from '../utils/datetime'
import { saveLoginSession } from '../utils/loginSession'

/** 密码和 CAS 登录共用登录态保存、欢迎通知与门户跳转。 */
export function useLoginSuccess() {
  const t = useT()
  const navigate = useNavigate()
  const { notification } = AntdApp.useApp()
  const locale = useSettingsStore((state) => state.locale)
  return useCallback((data: unknown, method: 'password' | 'cas' = 'password', password?: string) => {
    const response = saveLoginSession(data, method, password)
    const elapsed = response.last_login_at ? formatElapsed(response.last_login_at, locale) : null
    notification.open({
      placement: 'top',
      duration: 4,
      message: t('login.welcomeBack'),
      description: response.last_login_at
        ? `${t('login.lastLoginAt')}：${formatDateTime(response.last_login_at, locale)}${elapsed ? `\n${t('login.elapsed')}：${elapsed}` : ''}`
        : t('login.firstLogin'),
    })
    navigate(CAMPUS_PATH, { replace: true })
  }, [t, navigate, notification, locale])
}
