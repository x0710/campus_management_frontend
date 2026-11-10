/**
 * 登录页：
 * 提供用户名密码登录、记住用户名、语言切换和主题切换。
 * 整屏以 login-background.jpg 作背景，登录表单收进靠右的卡片（登录小窗），避免遮挡背景主体。
 * 登录成功后写入登录态，并跳转到 / 角色解析页；
 * 已登录用户访问本页时直接重定向到 /。
 * 由其他页面（如角色解析页在后端未启动时）跳转而来时，读取路由 state 中的 loginError
 * 并展示失败原因（含状态码），便于定位问题。
 */
import {
  LockOutlined,
  MoonOutlined,
  SafetyCertificateOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { App as AntdApp, Button, Checkbox, Dropdown, Form, Input } from 'antd'
import type { MenuProps } from 'antd'
import axios from 'axios'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import ErrorState from '../components/ErrorState'
import { login } from '../api/auth'
import { extractErrorReason } from '../api/common'
import { REMEMBERED_USERNAME_KEY } from '../config/auth'
import { useT } from '../i18n'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'
import { formatDateTime, formatElapsed } from '../utils/datetime'

interface LoginFormValues {
  username: string
  password: string
  remember: boolean
}

/** LoginPage 组件。
 * @returns 类型：Element
 */
export default function LoginPage() {
  const t = useT()
  const { notification } = AntdApp.useApp()
  const [form] = Form.useForm<LoginFormValues>()
  const navigate = useNavigate()
  const location = useLocation()
  // 其他页面跳转过来时携带的失败原因（如角色解析页遇到后端未启动）
  const routeError = (location.state as { loginError?: string } | null)?.loginError ?? null
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(routeError)

  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)

  // 已登录用户访问 /login 时直接进入角色解析页
  if (token) {
    return <Navigate to="/" replace />
  }

  const localeItems: MenuProps['items'] = [
    { key: 'zh', label: '中文' },
    { key: 'en', label: 'English' },
  ]

  const onFinish = async (values: LoginFormValues) => {
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const res = await login({ username: values.username.trim(), password: values.password })
      setAuth({ token: res.token, username: res.user, lastLoginAt: res.last_login_at })
      try {
        if (values.remember) {
          localStorage.setItem(REMEMBERED_USERNAME_KEY, res.user)
        } else {
          localStorage.removeItem(REMEMBERED_USERNAME_KEY)
        }
      } catch {
        // 浏览器禁止本地存储时仍允许登录。
      }
      // 登录成功：顶部弹窗欢迎；有上次登录时间则附带「上次登录 + 已过去」，首次登录走欢迎语
      if (res.last_login_at) {
        const elapsed = formatElapsed(res.last_login_at, locale)
        notification.open({
          placement: 'top',
          duration: 4,
          message: t('login.welcomeBack'),
          description: `${t('login.lastLoginAt')}：${formatDateTime(res.last_login_at, locale)}${elapsed ? `\n${t('login.elapsed')}：${elapsed}` : ''}`,
        })
      } else {
        notification.open({
          placement: 'top',
          duration: 4,
          message: t('login.welcomeBack'),
          description: t('login.firstLogin'),
        })
      }
      // 登录成功：进入 /，由 PortalRedirect 请求角色并跳转到对应门户
      navigate('/', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 401) {
          setErrorMsg(t('login.errBadCredentials'))
        } else if (status === 403) {
          setErrorMsg(t('login.errDisabled'))
        } else if (!err.response) {
          // 网络不可达：展示含后端不可达说明的完整提示
          setErrorMsg(extractErrorReason(err, t))
        } else {
          setErrorMsg(`${t('login.errGeneric')}（HTTP ${status}）`)
        }
      } else {
        setErrorMsg(t('login.errGeneric'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  let rememberedUser: string | null = null
  try {
    rememberedUser = localStorage.getItem(REMEMBERED_USERNAME_KEY)
  } catch {
    // 无法读取时使用空用户名。
  }

  return (
    <div className="login-page">
      <div className="login-top-actions">
        <Dropdown
          trigger={['click']}
          menu={{
            items: localeItems,
            selectable: true,
            selectedKeys: [locale],
            onClick: ({ key }: { key: string }) => setLocale(key as 'zh' | 'en'),
          }}
        >
          <Button type="text" size="small">
            {locale === 'zh' ? '中' : 'EN'}
          </Button>
        </Dropdown>
        <Button
          type="text"
          size="small"
          icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          onClick={toggleTheme}
        />
      </div>

      {/* 登录小窗：靠右显示，留出背景板主体区域 */}
      <main className="login-panel">
        <div className="login-panel-inner">
          <div className="login-logo">
            <SafetyCertificateOutlined />
          </div>

          <div className="login-heading">
            <h2>{t('login.welcome')}</h2>
            <p>{t('login.hint')}</p>
          </div>

          {errorMsg && (
            <ErrorState message={errorMsg} className="login-alert" />
          )}

          <Form<LoginFormValues>
            form={form}
            layout="vertical"
            size="large"
            requiredMark={false}
            initialValues={{ username: rememberedUser ?? '', password: '', remember: true }}
            onFinish={onFinish}
            onValuesChange={() => setErrorMsg(null)}
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, whitespace: true, message: t('login.userRequired') },
                { max: 64, message: t('login.userTooLong') },
              ]}
            >
              <Input
                prefix={<UserOutlined className="field-icon" />}
                placeholder={t('login.username')}
                autoComplete="username"
                allowClear
              />
            </Form.Item>

            <Form.Item name="password" rules={[{ required: true, message: t('login.passRequired') }]}>
              <Input.Password
                prefix={<LockOutlined className="field-icon" />}
                placeholder={t('login.password')}
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item name="remember" valuePropName="checked" className="remember-item">
              <Checkbox>{t('login.remember')}</Checkbox>
            </Form.Item>

            <Form.Item className="submit-item">
              <Button type="primary" htmlType="submit" block loading={submitting}>
                {submitting ? t('login.submitting') : t('login.submit')}
              </Button>
            </Form.Item>
          </Form>

          <p className="login-tips">{t('login.tips')}</p>
        </div>
      </main>

      <footer className="login-footer">
        © {new Date().getFullYear()} CampusManager
      </footer>
    </div>
  )
}
