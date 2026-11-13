/**
 * 首次登录强制修改密码弹窗。
 *
 * 登录响应 last_login_at 为 null 表示首次登录（见 api/types/auth.ts），
 * auth store 据此把 mustChangePassword 置为 true（并持久化），本组件在 App 根级常驻渲染：
 * 只要该标记为 true，弹窗就强制显示且无法关闭（无取消按钮、遮罩不可点、禁用 ESC），
 * 用户必须改密成功（PATCH /api/credentials 返回成功）后才会解除拦截。
 *
 * 旧密码栏默认填入内存中暂存的登录密码，用户可编辑；刷新后需补填旧密码。
 */
import { LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Form, Input, Modal } from 'antd'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { changeMyPassword, getCurrentUser } from '../api/auth'
import { useErrorFeedback } from '../composables/useErrorFeedback'
import { useT } from '../i18n'
import { useAuthStore } from '../store/auth'

/** 强制改密表单字段。 */
interface ForcePasswordForm {
  old_password: string
  new_password: string
  confirm_password: string
}

/** ForcePasswordChangeModal 组件。
 * @returns 类型：Element
 */
export default function ForcePasswordChangeModal() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  // 登录时由 setAuth 依据 last_login_at 判定，跨刷新持久化
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword)
  const pendingPassword = useAuthStore((s) => s.pendingPassword)
  const finishPasswordChange = useAuthStore((s) => s.finishPasswordChange)
  const [form] = Form.useForm<ForcePasswordForm>()
  const [submitting, setSubmitting] = useState(false)

  // 每次弹出时重置表单，并默认填入本次登录密码。
  useEffect(() => {
    if (mustChangePassword) {
      form.resetFields()
      form.setFieldsValue({ old_password: pendingPassword ?? '' })
    }
  }, [mustChangePassword, pendingPassword, form])

  /** 提交改密时携带登录密码，成功后解除强制弹窗并清除暂存密码。 */
  const submit = async () => {
    let values: ForcePasswordForm
    try {
      values = await form.validateFields()
    } catch {
      // 表单校验未通过，错误已由 Form.Item 就地展示
      return
    }
    setSubmitting(true)
    try {
      const me = await getCurrentUser()
      await changeMyPassword(me.uid, values.old_password, values.new_password)
      message.success(t('password.forceSuccess'))
      finishPasswordChange()
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        reportError(err)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={mustChangePassword}
      title={t('password.forceTitle')}
      width={440}
      /* 强制弹窗：不可关闭，必须完成改密 */
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      destroyOnHidden
      footer={
        <Button type="primary" loading={submitting} onClick={() => void submit()}>
          {t('password.forceSubmit')}
        </Button>
      }
    >
      <Alert
        type="warning"
        showIcon
        icon={<SafetyCertificateOutlined />}
        title={t('password.forceHint')}
        style={{ marginBottom: 12 }}
      />
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          name="old_password"
          label={t('password.oldLabel')}
          rules={[{ required: true, message: t('password.oldRequired') }]}
        >
          <Input.Password
            prefix={<LockOutlined className="field-icon" />}
            autoComplete="current-password"
          />
        </Form.Item>
        <Form.Item
          name="new_password"
          label={t('password.newLabel')}
          rules={[{ required: true, message: t('password.newRequired') }]}
        >
          <Input.Password
            prefix={<LockOutlined className="field-icon" />}
            maxLength={64}
            autoComplete="new-password"
          />
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
          <Input.Password
            prefix={<LockOutlined className="field-icon" />}
            maxLength={64}
            autoComplete="new-password"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
