/**
 * 登录后的门户解析页：
 * 获取当前登录用户的角色列表，按角色分流并以 replace 方式跳转到 /portal/:portalKey：
 * - 支部书记 → 党委支部端；书记 → 党委学院端；其余（含无角色信息）→ 党员端（DEFAULT_PORTAL_KEY）；
 * - 角色信息获取失败（后端未启动、网络不通、登录态失效等）时不显示空白错误页，
 *   而是清空会话缓存与登录态并回到登录页，同时通过路由 state 携带失败原因（含状态码）在登录页提示。
 * 加载过程中显示 Spin。
 */

import { SafetyCertificateOutlined } from '@ant-design/icons'
import { Spin } from 'antd'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { getMyRoles } from '../../api/auth'
import { invalidate } from '../../api/cache'
import { extractErrorReason } from '../../api/common'
import { resolveDefaultPortalKey } from '../../config/portals'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'

/**
 * 门户解析组件。
 * 无入参；根据当前用户角色跳转到对应门户；失败时回到登录页并携带失败原因。
 */
export default function PortalRedirect() {
  const t = useT()
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  useEffect(() => {
    let cancelled = false
    getMyRoles()
      .then((roles) => {
        if (cancelled) return
        // 按角色分流：支部书记 → 支部端；书记 → 学院端；其余默认党员端
        const portalKey = resolveDefaultPortalKey(roles)
        navigate(`/portal/${portalKey}`, { replace: true })
      })
      .catch((err) => {
        if (cancelled) return
        // 先清空接口会话缓存再清登录态，避免下一位用户看到上一位用户的数据（代码要求 17）
        invalidate()
        clearAuth()
        navigate('/login', {
          replace: true,
          // 登录页读取该 state 展示失败原因（含状态码与中文说明，代码要求 9）
          state: { loginError: extractErrorReason(err, t) },
        })
      })

    return () => {
      cancelled = true
    }
  }, [navigate, clearAuth, t])

  return (
    <div className="portal-redirect">
      <div className="portal-redirect-content">
        <span className="portal-redirect-logo">
          <SafetyCertificateOutlined />
        </span>
        <Spin size="large" />
        <span className="portal-redirect-text">{t('common.loading')}</span>
      </div>
    </div>
  )
}