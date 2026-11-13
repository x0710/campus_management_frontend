import { getPortalPath, getPortalKeyFromPathname, CAMPUS_PATH, LOGIN_PATH, migrateLegacyPath } from '../config/routes'
/** 门户系列页面共享顶栏：品牌 / 自定义左侧 / 语言 / 夜间模式 / 用户 / 登出 */
import {
  DownOutlined,
  KeyOutlined,
  LogoutOutlined,
  MoonOutlined,
  QuestionCircleOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Alert,
  Avatar,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Tooltip,
  type MenuProps,
} from 'antd'
import axios from 'axios'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { invalidate } from '../api/cache'
import { changeMyPassword, getCurrentUser } from '../api/auth'
import { getMyProfile } from '../api/users'
import { useErrorFeedback } from '../composables/useErrorFeedback'
import {
  getAccessiblePortalKeys,
  getPortal,
  isPortalDisabled,
  isSuperAdminRole,
  PARTY_PORTAL_KEY,
  PORTAL_PROFILE_MODULE_KEYS,
  PORTALS,
  type PortalKey,
} from '../config/portals'
import { useT } from '../i18n'
import { useAuthStore } from '../store/auth'
import { useSharedResource } from '../composables/useSharedResource'
import { myRolesResource, myPortalPositionsResource } from '../store/referenceData'
import { useSettingsStore } from '../store/settings'
import PortalNoticeBell from './PortalNoticeBell'

interface PortalHeaderProps {
  /** 左侧自定义内容（如返回按钮、面包屑） */
  left?: ReactNode
}

/** 「重置密码」弹窗表单字段：本人改密需提供旧密码校验（PATCH /api/credentials） */
interface ResetPasswordForm {
  old_password: string
  new_password: string
  confirm_password: string
}

/**
 * 门户系列页面共享顶栏：品牌 / 自定义左侧 / 语言 / 夜间模式 / 用户 / 登出
 * @param { left } 类型：PortalHeaderProps；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function PortalHeader({ left }: PortalHeaderProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const navigate = useNavigate()
  const location = useLocation()
  const username = useAuthStore((s) => s.username) // 账户名（登录态自带，作为姓名的兜底展示）
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const originalAuth = useAuthStore((s) => s.originalAuth)
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)

  // 真实姓名：登录态只带账户名，姓名需经 GET /api/users/me 获取（走会话缓存，不重复请求）
  const [realName, setRealName] = useState<string | null>(null)
  // 当前用户可访问的门户：管理端取系统角色，党委门户取组织任职职位
  const { data: roles } = useSharedResource(myRolesResource)
  const { data: positions } = useSharedResource(myPortalPositionsResource)
  const portalKeys = useMemo(() => getAccessiblePortalKeys(roles, positions), [roles, positions])
  // 是否为超级管理员：保留全部门户切换入口。
  const isSuperAdmin = roles.some(isSuperAdminRole)
  // 「重置密码」弹窗：本人改密（需旧密码校验）
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetForm] = Form.useForm<ResetPasswordForm>()

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

  /** 从当前 URL 推导所在门户，用于下拉菜单高亮当前门户 */
  const currentPortalKey = getPortalKeyFromPathname(location.pathname)

  /** 当前门户定义与名称，供左上角门户切换按钮展示 */
  const currentPortal = useMemo(() => getPortal(currentPortalKey), [currentPortalKey])
  const currentPortalName = currentPortal ? t(`portal.${currentPortal.key}_name`) : t('portal.selectPortal')

  /**
   * 左上角门户切换入口的可选门户：
   * - 超级管理员保留全部门户（与原先的左上角切换行为一致）；
   * - 普通用户只列出角色可访问的门户（与原先头像菜单一致）。
   */
  const switcherPortalKeys = useMemo<PortalKey[]>(
    () =>
      isSuperAdmin
        ? PORTALS.filter((portal) => !isPortalDisabled(portal.key)).map(
            (portal) => portal.key,
          )
        : portalKeys,
    [isSuperAdmin, portalKeys],
  )
  /** 左上角门户切换菜单：只列可选门户 */
  const portalSwitchItems = useMemo<MenuProps['items']>(
    () =>
      switcherPortalKeys.map((portalKey) => ({
        key: `portal:${portalKey}`,
        icon: getPortal(portalKey)?.icon,
        label: t(`portal.${portalKey}_name`),
      })),
    [switcherPortalKeys, t],
  )
  /** 可切换门户达到 2 个时才展示切换入口（只有 1 个门户无需展示） */
  const showPortalSwitcher = switcherPortalKeys.length > 1

  /** 当前门户的「我的」模块：存在时在头像菜单中提供入口 */
  const profileModuleKey = currentPortalKey ? PORTAL_PROFILE_MODULE_KEYS[currentPortalKey] : undefined
  const profilePath =
    currentPortalKey && profileModuleKey
      ? `${getPortalPath(currentPortalKey)}/${profileModuleKey}`
      : undefined

  /**
   * 右上角用户菜单：仅保留「我的」与「重置密码」；
   * 门户切换统一由左上角门户选择完成，不再在头像菜单中重复提供。
   */
  const userMenuItems = useMemo<MenuProps['items']>(() => {
    // 「我的」不再占用侧栏入口，改从头像菜单进入
    const myProfileItems: NonNullable<MenuProps['items']> =
      profileModuleKey
        ? [
            {
              key: 'my-profile',
              icon: <UserOutlined />,
              label: t(`portal.${profileModuleKey}`),
            },
            { type: 'divider' },
          ]
        : []
    return [
      ...myProfileItems,
      {
        key: 'reset-password',
        icon: <KeyOutlined />,
        label: t('password.menuLabel'),
      },
    ]
  }, [t, profileModuleKey])

  /** 展开时复用共享缓存和在途请求；过期或角色/任职变更失效后再查询。 */
  const refreshPortalKeys = () => {
    void myRolesResource.load().catch(() => {})
    void myPortalPositionsResource.load().catch(() => {})
  }

  /** 打开「重置密码」弹窗并清空上次输入 */
  const openResetPassword = () => {
    resetForm.resetFields()
    setResetOpen(true)
  }

  /**
   * 提交本人改密：校验旧密码后调用 PATCH /api/credentials。
   * 旧密码错误时后端返回 403，经 extractErrorReason 展示为「403 …：旧密码错误」。
   */
  const submitResetPassword = async () => {
    let values: ResetPasswordForm
    try {
      values = await resetForm.validateFields()
    } catch {
      // 表单校验未通过，错误已由 Form.Item 就地展示
      return
    }
    setResetting(true)
    try {
      const me = await getCurrentUser()
      await changeMyPassword(me.uid, values.old_password, values.new_password)
      message.success(t('password.success'))
      setResetOpen(false)
      resetForm.resetFields()
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        reportError(err)
      }
    } finally {
      setResetting(false)
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
    navigate(LOGIN_PATH, { replace: true })
  }

  return (
    <header className="portal-header">
      <div className="portal-header-left">
        <div className="header-brand" onClick={() => navigate(CAMPUS_PATH)}>
          {/* 界面壳左上角品牌标识：校徽使用 public/logo2.svg */}
          <img
            className="header-school-logo"
            src={`${import.meta.env.BASE_URL}logo2.svg`}
            alt="井冈山大学"
          />
          <span className="header-brand-name">{t('common.appName')}</span>
        </div>
        {showPortalSwitcher && (
          <Dropdown
            trigger={['click']}
            onOpenChange={(open) => {
              // 展开时刷新角色，避免后端角色变更后门户列表仍是旧数据
              if (open) void refreshPortalKeys()
            }}
            menu={{
              items: portalSwitchItems,
              selectable: true,
              selectedKeys: currentPortalKey ? [`portal:${currentPortalKey}`] : [],
              onClick: ({ key }: { key: string }) => {
                const portalKey = key.replace('portal:', '')
                if (getPortal(portalKey)) {
                  navigate(getPortalPath(portalKey))
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
        )}
        {left}
      </div>

      <div className="header-right">
        <Tooltip title={t('common.reportIssueHint')}>
          <Button
            type="primary"
            className="feedback-nav-btn"
            aria-label={t('common.reportIssue')}
            icon={<QuestionCircleOutlined />}
            onClick={() => navigate(`${getPortalPath(currentPortalKey ?? PARTY_PORTAL_KEY)}/feedback`)}
          >
            {t('common.reportIssue')}
          </Button>
        </Tooltip>
        <Tooltip title={theme === 'dark' ? 'Light' : 'Dark'}>
          <Button
            type="text"
            className="header-icon-btn"
            icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
          />
        </Tooltip>
        <PortalNoticeBell />

        {originalAuth && (
          <Button onClick={() => {
            invalidate()
            useAuthStore.getState().restoreAuth()
            navigate(migrateLegacyPath(originalAuth.returnTo ?? CAMPUS_PATH), { replace: true })
          }}>
            {t('adminUsers.restoreAccount', { name: originalAuth.username })}
          </Button>
        )}
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

        <Dropdown
          trigger={['click']}
          menu={{
            items: userMenuItems,
            selectedKeys:
              profilePath && location.pathname === profilePath ? ['my-profile'] : [],
            onClick: ({ key }: { key: string }) => {
              if (key === 'my-profile') {
                if (profilePath) navigate(profilePath)
                return
              }
              if (key === 'reset-password') {
                openResetPassword()
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

      <Modal
        open={resetOpen}
        title={t('password.title')}
        width={420}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={resetting}
        onCancel={() => setResetOpen(false)}
        onOk={() => void submitResetPassword()}
        destroyOnHidden
      >
        <Form form={resetForm} layout="vertical" autoComplete="off">
          <Alert
            type="info"
            showIcon
            title={t('password.hint')}
            style={{ marginBottom: 12 }}
          />
          <Form.Item name="old_password" label={t('password.oldLabel')} rules={[{ required: true, message: t('password.oldRequired') }]}>
            <Input.Password maxLength={64} autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="new_password" label={t('password.newLabel')} rules={[{ required: true, message: t('password.newRequired') }]}>
            <Input.Password maxLength={64} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label={t('password.confirmLabel')}
            dependencies={['new_password']}
            rules={[
              { required: true, message: t('password.confirmRequired') },
              ({ getFieldValue }) => ({
                validator(_rule, value: string) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error(t('password.mismatch')))
                },
              }),
            ]}
          >
            <Input.Password maxLength={64} autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </header>
  )
}
