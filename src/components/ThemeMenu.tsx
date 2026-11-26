import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Button, Dropdown } from 'antd'
import { useT } from '../i18n'
import { useSettingsStore, type ThemeMode } from '../store/settings'

export default function ThemeMenu({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const items = [
    { key: 'system', label: t('common.systemTheme'), icon: <DesktopOutlined /> },
    { key: 'light', label: t('common.lightTheme'), icon: <SunOutlined /> },
    { key: 'dark', label: t('common.darkTheme'), icon: <MoonOutlined /> },
  ]
  return (
    <Dropdown trigger={['click']} menu={{ items, selectable: true, selectedKeys: [theme],
      onClick: ({ key }) => setTheme(key as ThemeMode) }}>
      <Button type="text" size={compact ? 'small' : 'middle'} className={compact ? undefined : 'header-icon-btn'}
        aria-label={t('common.theme')} title={t('common.theme')} icon={items.find((item) => item.key === theme)?.icon} />
    </Dropdown>
  )
}
