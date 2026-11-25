import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'

import { useT } from '../i18n'
import type { ThemeMode } from '../store/settings'
import { useSettingsStore } from '../store/settings'

interface ThemeModeDropdownProps {
  className?: string
  size?: 'small' | 'middle' | 'large'
}

/** 主题模式下拉：跟随系统 / 浅色 / 深色。图标展示当前偏好。 */
export default function ThemeModeDropdown({ className, size = 'middle' }: ThemeModeDropdownProps) {
  const t = useT()
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)

  const items: MenuProps['items'] = [
    { key: 'system', icon: <DesktopOutlined />, label: t('common.themeFollowSystem') },
    { key: 'light', icon: <SunOutlined />, label: t('common.themeLight') },
    { key: 'dark', icon: <MoonOutlined />, label: t('common.themeDark') },
  ]

  const icon =
    theme === 'system' ? <DesktopOutlined /> : theme === 'dark' ? <MoonOutlined /> : <SunOutlined />

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items,
        selectable: true,
        selectedKeys: [theme],
        onClick: ({ key }: { key: string }) => setTheme(key as ThemeMode),
      }}
    >
      <Button
        type="text"
        size={size}
        className={className}
        title={t('common.themeMode')}
        aria-label={t('common.themeMode')}
        icon={icon}
      />
    </Dropdown>
  )
}
