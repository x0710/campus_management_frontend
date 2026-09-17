/** 门户系列页面共享顶栏：品牌 / 自定义左侧 / 语言 / 夜间模式 / 用户 / 登出 */
import {
  LogoutOutlined,
  MoonOutlined,
  SafetyCertificateOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Dropdown, type MenuProps, Tooltip } from 'antd'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
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
  const username = useAuthStore((s) => s.username)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)

  const localeItems: MenuProps['items'] = [
    { key: 'zh', label: '中文' },
    { key: 'en', label: 'English' },
  ]

  const handleLogout = () => {
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
          <span className="header-username">{username}</span>
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
