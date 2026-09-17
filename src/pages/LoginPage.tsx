import {
  ApartmentOutlined,
  AuditOutlined,
  LockOutlined,
  MoonOutlined,
  NotificationOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Alert, Button, Checkbox, Dropdown, Form, Input } from 'antd'
import type { MenuProps } from 'antd'
import axios from 'axios'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { login } from '../api/auth'
import { useT } from '../i18n'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'

interface LoginFormValues {
  username: string
  password: string
  remember: boolean
}

const REMEMBER_KEY = 'campus-remembered-user'

const FEATURE_ICONS: ReactNode[] = [
  <ApartmentOutlined key="org" />,
  <AuditOutlined key="approval" />,
  <NotificationOutlined key="notice" />,
  <SolutionOutlined key="record" />,
]

export default function LoginPage() {
  const t = useT()
  const [form] = Form.useForm<LoginFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)
  const theme = useSettingsStore((s) => s.theme)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)

  // 已登录用户访问 /login 时直接进入主页
  if (token) {
    return <Navigate to="/home" replace />
  }

  const features = [1, 2, 3, 4].map((i) => ({
    icon: FEATURE_ICONS[i - 1],
    title: t(`login.feature${i}Title`),
    desc: t(`login.feature${i}Desc`),
  }))

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
      if (values.remember) {
        localStorage.setItem(REMEMBER_KEY, res.user)
      } else {
        localStorage.removeItem(REMEMBER_KEY)
      }
      // 登录成功：先进入账户信息过渡页，3 秒后自动进入主页面
      navigate('/welcome', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 401) {
          setErrorMsg(t('login.errBadCredentials'))
        } else if (status === 403) {
          setErrorMsg(t('login.errDisabled'))
        } else if (!err.response) {
          setErrorMsg(t('common.networkError'))
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

  const rememberedUser = localStorage.getItem(REMEMBER_KEY)

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

      {/* 左侧品牌区 */}
      <aside className="login-brand">
        <div className="brand-inner">
          <div className="brand-logo">
            <SafetyCertificateOutlined />
          </div>
          <h1 className="brand-title">{t('common.appName')}</h1>
          <p className="brand-subtitle">Campus Manager · {t('login.subtitle')}</p>

          <ul className="brand-features">
            {features.map((item) => (
              <li key={item.title}>
                <span className="feature-icon">{item.icon}</span>
                <div>
                  <div className="feature-title">{item.title}</div>
                  <div className="feature-desc">{item.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="brand-decoration brand-decoration-a" />
        <div className="brand-decoration brand-decoration-b" />
      </aside>

      {/* 右侧登录区 */}
      <main className="login-panel">
        <div className="login-panel-inner">
          <div className="brand-logo brand-logo-mobile">
            <SafetyCertificateOutlined />
          </div>

          <div className="login-heading">
            <h2>{t('login.welcome')}</h2>
            <p>{t('login.hint')}</p>
          </div>

          {errorMsg && (
            <Alert className="login-alert" type="error" showIcon title={errorMsg} />
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

        <footer className="login-footer">
          © {new Date().getFullYear()} CampusManager
        </footer>
      </main>
    </div>
  )
}
