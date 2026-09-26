/** 门户系列页面共享顶栏：品牌 / 自定义左侧 / 语言 / 夜间模式 / 用户 / 登出 */
import {
  LogoutOutlined,
  MoonOutlined,
  SafetyCertificateOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Dropdown, type MenuProps, Tooltip } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { invalidate } from '../api/cache'
import { getMyProfile } from '../api/users'
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
  const username = useAuthStore((s) => s.username) // 账户名（登录态自带，作为姓名的兜底展示）
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)

  // 真实姓名：登录态只带账户名，姓名需经 GET /api/users/me 获取（走会话缓存，不重复请求）
  const [realName, setRealName] = useState<string | null>(null)

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

  /** 有真实姓名时优先展示姓名，否则回退账户名 */
  const displayName = realName?.trim() ? realName : username

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
        <div className="header-brand" onClick={() => navigate('/home')}>
          <span className="sider-mark">
            <SafetyCertificateOutlined />
          </span>
          <span className="header-brand-name">{t('common.appName')}</span>
        </div>
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

        <div className="header-user">
          <Avatar size="small" style={{ backgroundColor: '#2f54eb' }} icon={<UserOutlined />} />
          {/* 展示真实姓名；鼠标悬停提示对应的账户名（代码要求 10） */}
          <Tooltip
            title={
              displayName === username
                ? undefined
                : t('common.accountNameHint', { name: username ?? '' })
            }
          >
            <span className="header-username">{displayName}</span>
          </Tooltip>
        </div>

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
