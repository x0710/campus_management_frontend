/**
 * 登录后的门户解析页：
 * 获取当前登录用户的角色列表，按角色映射到对应门户，并以 replace 方式跳转到 /portal/:portalKey。
 * 无角色信息（查不到可匹配的角色）时默认进入学生端（DEFAULT_PORTAL_KEY）；
 * 角色请求失败时显示错误提示；加载中显示 Spin。
 */

import { SafetyCertificateOutlined } from '@ant-design/icons'
import { Alert, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { getMyRoles } from '../../api/auth'
import { DEFAULT_PORTAL_KEY, getPortalKeyByRoleCodes } from '../../config/portals'
import { useT } from '../../i18n'

/**
 * 门户解析组件。
 * 无入参；渲染结果根据当前用户角色跳转门户，或显示错误/加载状态。
 */

export default function PortalRedirect() {
  const t = useT()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getMyRoles()
      .then((roles) => {
        if (cancelled) return
        // 无角色信息时默认进入学生端，保证登录后一定有一个可用工作端
        const portalKey =
          getPortalKeyByRoleCodes(roles.map((role) => role.code)) ?? DEFAULT_PORTAL_KEY
        navigate(`/portal/${portalKey}`, { replace: true })
      })
      .catch(() => {
        if (!cancelled) setError(t('common.loadFailed'))
      })

    return () => {
      cancelled = true
    }
  }, [navigate, t])

  if (error) {
    return (
      <div className="portal-redirect">
        <Alert className="portal-redirect-error" type="error" showIcon message={error} />
      </div>
    )
  }

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
