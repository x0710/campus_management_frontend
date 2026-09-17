/** 用户资料编辑弹窗 */
import { App as AntdApp, Alert, DatePicker, Form, Input, Modal, Select, Skeleton } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { getUser, updateUser, type Gender, type UserDetail } from '../api/users'
import { useT } from '../i18n'

interface ProfileFormValues {
  name?: string
  gender?: Gender
  email?: string
  phone?: string
  birthday?: Dayjs | null
  avatar?: string
}

interface Props {
  open: boolean
  uid: number
  onClose: () => void  // 关闭弹窗时调用的回调函数
  /** 保存成功后回调（父组件可用于刷新展示数据；用户缓存已被 updateUser 自动失效） */
  onSaved?: (detail: UserDetail) => void  // 保存成功后调用的回调函数
}

/**
 * 可复用的用户资料编辑弹窗：
 * 打开时拉取用户最新信息并回填表单，提交 PATCH /api/users/{id}。
 * 仅编辑资料字段（姓名/性别/邮箱/电话/生日/格言），角色与组织任职不在此处理。
 */
export default function UserProfileEditModal({ open, uid, onClose, onSaved }: Props) {
  const t = useT()
  const { message } = AntdApp.useApp()  // 引入 message 组件，用于显示提示信息
  const [form] = Form.useForm<ProfileFormValues>()  // 引入表单实例，用于校验和提交表单数据

  const [loading, setLoading] = useState(false)  // 加载状态，用于显示加载中提示
  const [saving, setSaving] = useState(false)  // 保存状态，用于显示保存中提示
  const [errorText, setErrorText] = useState<string | null>(null)  // 错误提示文本，用于显示 API 错误信息
  // 构建错误提示文本，包含 HTTP 状态码和错误信息
  const buildErrorText = useCallback(
    (err: unknown): string => {  
      // 错误提示需包含 HTTP 状态码（如 400、404、500），便于调试
      if (axios.isAxiosError(err) && err.response) {  //当错误是 axios 错误且后端有响应时
        const body =
          typeof err.response.data === 'string' && err.response.data.trim()  //判断响应数据是否是字符串且非空
            ? err.response.data.trim()  //返回响应数据的非空字符串
            : err.response.statusText  //返回响应状态文本
        return body ? `${err.response.status} ${body}` : String(err.response.status)
      }
      if (axios.isAxiosError(err) && !err.response) return t('common.networkError')  //返回网络错误提示
      // 其他错误，返回加载失败提示
      return t('common.loadFailed')
    },
    [t],
  )

  const fillForm = useCallback(async () => {
    setLoading(true)
    setErrorText(null)
    form.resetFields()
    try {
      const d = await getUser(uid)
      form.setFieldsValue({
        name: d.name ?? '',
        gender: (d.gender as Gender | null) ?? undefined,
        email: d.email ?? '',
        phone: d.phone ?? '',
        birthday: d.birthday ? dayjs(d.birthday) : null,
        avatar: d.avatar ?? '',
      })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      setErrorText(buildErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [uid, form, buildErrorText])

  useEffect(() => {
    if (open) void fillForm()
  }, [open, fillForm])

  const handleOk = async () => {
    let values: ProfileFormValues
    try {
      values = await form.validateFields()
    } catch {
      // 表单校验未通过（errorFields），antd 已自动提示
      return
    }
    setSaving(true)
    setErrorText(null)
    try {
      await updateUser(uid, {
        name: values.name?.trim() || undefined,
        gender: values.gender,
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : undefined,
        avatar: values.avatar?.trim() || undefined,
      })
      message.success(t('profile.saveSuccess'))
      onSaved?.(await getUser(uid))
      onClose()
    } catch (err) {
      setErrorText(buildErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('profile.editTitle')}
      onCancel={onClose}
      onOk={() => void handleOk()}
      confirmLoading={saving}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      destroyOnHidden
      width={560}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {errorText ? (
            <Alert type="error" showIcon title={errorText} style={{ marginBottom: 12 }} />
          ) : null}
          <Form.Item name="name" label={t('profile.name')}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="gender" label={t('profile.gender')}>
            <Select
              allowClear
              options={[
                { value: 'male', label: t('profile.male') },
                { value: 'female', label: t('profile.female') },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="email"
            label={t('profile.email')}
            rules={[
              { type: 'email', message: t('profile.emailInvalid') },
            ]}
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="phone" label={t('profile.phone')}>
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item name="birthday" label={t('profile.birthday')}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="avatar" label={t('profile.avatar')}>
            <Input.TextArea rows={3} maxLength={512} showCount />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
