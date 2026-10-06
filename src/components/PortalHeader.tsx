/** 门户系列页面共享顶栏：品牌 / 自定义左侧 / 语言 / 夜间模式 / 用户 / 登出 */
import {
  AppstoreOutlined,
  DownOutlined,
  LogoutOutlined,
  MoonOutlined,
  SafetyCertificateOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Dropdown, type MenuProps, Tooltip } from 'antd'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { invalidate } from '../api/cache'
import { getMyRoles } from '../api/auth'
import { getMyProfile } from '../api/users'
import { getAccessiblePortalKeys, getPortal, PORTALS, type PortalKey } from '../config/portals'
import { useT } from '../i18n'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'

interface PortalHeaderProps {
  /** 左侧自定义内容（如返回按钮、面包屑） */
  left?: ReactNode
}

/** 门户系列页面共享顶栏：品牌 / 自定义左侧 / 语言 / 夜间模式 / 用户 / 登出 */
export default function PortalHeader({ left }: PortalHeaderProps) {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const username = useAuthStore((s) => s.username) // 账户名（登录态自带，作为姓名的兜底展示）
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)

  // 真实姓名：登录态只带账户名，姓名需经 GET /api/users/me 获取（走会话缓存，不重复请求）
  const [realName, setRealName] = useState<string | null>(null)
  // 当前用户可访问的门户 key：由角色查询结果映射而来
  const [portalKeys, setPortalKeys] = useState<PortalKey[]>([])

  useEffect(() => {
    let cancelled = false
    getMyProfile()
      .then((me) => {
        if (!cancelled) setRealName(me.name)
      })
      .catch(() => {
        // 姓名仅用于顶栏展示，取不到时静默回退账户名，不打断用户（401 由全局拦截器处理）
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getMyRoles()
      .then((roles) => {
        if (cancelled) return
        // 无角色信息时与学生端默认入口保持一致（回退学生端）
        setPortalKeys(getAccessiblePortalKeys(roles.map((role) => role.code)))
      })
      .catch(() => {
        // 角色仅用于门户切换菜单；查询失败时保持空列表，不打断顶栏展示
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** 有真实姓名时优先展示姓名，否则回退账户名 */
  const displayName = realName?.trim() ? realName : username

  /** 从当前 URL 推导所在门户，用于下拉菜单高亮当前门户 */
  const currentPortalKey = useMemo<PortalKey | undefined>(() => {
    const match = location.pathname.match(/^\/portal\/([^/]+)/)
    return match ? (match[1] as PortalKey) : undefined
  }, [location.pathname])

  /** 当前门户定义与名称，供左上角门户切换按钮展示 */
  const currentPortal = useMemo(() => getPortal(currentPortalKey), [currentPortalKey])
  const currentPortalName = currentPortal ? t(`portal.${currentPortal.key}_name`) : t('portal.selectPortal')

  /** 左上角门户切换菜单：固定平铺列出全部门户端，不做角色可访问性过滤 */
  const portalSwitchItems = useMemo<MenuProps['items']>(() => {
    return PORTALS.map((portal) => ({
      key: `portal:${portal.key}`,
      icon: portal.icon,
      label: t(`portal.${portal.key}_name`),
    }))
  }, [t])

  /**
   * 右上角用户菜单：先展示「门户选择」一项，点击该项后再展开本次角色可访问的门户列表，
   * 避免点击头像就直接跳出一串门户（子菜单展开方式设为 click，见下方 Dropdown）。
   */
  const userMenuItems = useMemo<MenuProps['items']>(() => {
    const portalItems = portalKeys.map((portalKey) => ({
      key: `portal:${portalKey}`,
      icon: getPortal(portalKey)?.icon,
      label: t(`portal.${portalKey}_name`),
    }))
    return [
      {
        key: 'portal-select',
        icon: <AppstoreOutlined />,
        label: t('portal.selectPortal'),
        children:
          portalItems.length > 0
            ? portalItems
            : [{ key: 'no-portal', label: t('portal.noRole'), disabled: true }],
      },
    ]
  }, [portalKeys, t])

  /** 下拉展开时强制刷新角色，避免后端角色变更后仍显示旧菜单 */
  const refreshPortalKeys = async () => {
    try {
      const roles = await getMyRoles(true)
      setPortalKeys(getAccessiblePortalKeys(roles.map((role) => role.code)))
    } catch {
      // 刷新失败时保留原菜单，不打断用户操作
    }
  }

  const localeItems: MenuProps['items'] = [
    { key: 'zh', label: '中文' },
    { key: 'en', label: 'English' },
  ]

  const handleLogout = () => {
    // 代码要求 17：退出登录先清空接口会话缓存，避免下一个登录用户看到上一个用户的残留数据
    // （如 /credentials/me 被缓存时，会把上一位用户的 uid 带给新用户）
    invalidate()
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <header className="portal-header">
      <div className="portal-header-left">
        <div className="header-brand" onClick={() => navigate('/')}>
          <span className="sider-mark">
            <SafetyCertificateOutlined />
          </span>
          <span className="header-brand-name">{t('common.appName')}</span>
        </div>
        <Dropdown
          trigger={['click']}
          menu={{
            items: portalSwitchItems,
            selectable: true,
            selectedKeys: currentPortalKey ? [`portal:${currentPortalKey}`] : [],
            onClick: ({ key }: { key: string }) => {
              const portalKey = key.replace('portal:', '')
              if (getPortal(portalKey)) {
                navigate(`/portal/${portalKey}`)
              }
            },
          }}
        >
          <Button type="text" className="portal-switcher">
            <span className="portal-switcher-icon">{currentPortal?.icon}</span>
            <span className="portal-switcher-name">{currentPortalName}</span>
            <DownOutlined className="portal-switcher-arrow" />
          </Button>
        </Dropdown>
        {left}
      </div>

      <div className="header-right">
        <Tooltip title={theme === 'dark' ? 'Light' : 'Dark'}>
          <Button
            type="text"
            className="header-icon-btn"
            icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
          />
        </Tooltip>

        <Dropdown
          trigger={['click']}
          onOpenChange={(open) => {
            if (open) void refreshPortalKeys()
          }}
          menu={{
            items: localeItems,
            selectable: true,
            selectedKeys: [locale],
            onClick: ({ key }: { key: string }) => setLocale(key as 'zh' | 'en'),
          }}
        >
          <Button type="text" className="lang-btn">
            {locale === 'zh' ? '中' : 'EN'}
          </Button>
        </Dropdown>

        <Dropdown
          trigger={['click']}
          menu={{
            items: userMenuItems,
            /* 子菜单（门户选择）改为点击展开，而不是悬停即展开 */
            triggerSubMenuAction: 'click',
            selectedKeys: currentPortalKey ? [`portal:${currentPortalKey}`] : [],
            onClick: ({ key }: { key: string }) => {
              const portalKey = key.replace('portal:', '')
              if (getPortal(portalKey)) {
                navigate(`/portal/${portalKey}`)
              }
            },
          }}
        >
          <div className="header-user">
            <Avatar size="small" style={{ backgroundColor: '#2f54eb' }} icon={<UserOutlined />} />
            <Tooltip
              /* 悬停提示放慢出现速度（默认 0.1s 过快，鼠标扫过就弹出） */
              mouseEnterDelay={0.8}
              title={
                displayName === username
                  ? undefined
                  : t('common.accountNameHint', { name: username ?? '' })
              }
            >
              <span className="header-username">{displayName}</span>
            </Tooltip>
          </div>
        </Dropdown>

        <Tooltip title={t('common.logout')}>
          <Button
            type="text"
            danger
            className="header-icon-btn"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          />
        </Tooltip>
      </div>
    </header>
  )
}
