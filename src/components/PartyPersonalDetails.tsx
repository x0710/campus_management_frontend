import { EditOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Descriptions, Form, Input, Modal, Skeleton } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { extractErrorReason } from '../api/common'
import { queryProfileDetails, saveProfileDetail } from '../api/profileDetails'
import type { ProfileDetail } from '../api/types/profileDetails'
import { useRequestSequence } from '../composables/useRequestSequence'
import { useT } from '../i18n'
import ErrorState from './ErrorState'

// 党员只维护本人适用的个人资料，不提交家庭成员、班级等学生档案字段。
const fields = [
  ['ethnic', 'fieldEthnic'],
  ['native_place', 'fieldNativePlace'],
  ['household_location', 'fieldHouseholdLocation'],
  ['household_type', 'fieldHouseholdType'],
] as const
type Values = Record<(typeof fields)[number][0], string>

/**
 * 党员「我的」页 / 成员详情中的个人资料卡片（民族、籍贯、户口所在地、户口性质）。
 * @param userId 目标用户 ID（必填）
 * @param readOnly 只读展示（成员详情中支部 / 学院 / 学校等上级组织可编辑，默认 false）
 */
export default function PartyPersonalDetails({
  userId,
  readOnly = false,
}: {
  userId: number
  readOnly?: boolean
}) {
  const t = useT()
  const { message } = App.useApp()
  const requests = useRequestSequence()
  const [profile, setProfile] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<Values>()

  const load = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    setProfile(null)
    setOpen(false)
    try {
      const result = await queryProfileDetails({ user_id: userId, page: 1, page_size: 1 }, true)
      if (isCurrent()) setProfile(result.data[0] ?? null)
    } catch (err) {
      if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [requests, t, userId])

  useEffect(() => {
    void load()
    return () => requests.invalidate()
  }, [load, requests])

  const save = async () => {
    if (saving) return
    let values: Values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    // 只提交本页维护的字段；空字符串用于清空原值。
    const changes = {
      ethnic: (values.ethnic ?? '').trim(),
      native_place: (values.native_place ?? '').trim(),
      household_location: (values.household_location ?? '').trim(),
      household_type: (values.household_type ?? '').trim(),
    }
    setSaving(true)
    try {
      // PUT 按 user_id 保存：无档案时后端创建，有档案时更新。
      const saved = await saveProfileDetail({ user_id: userId, ...changes })
      setProfile(saved)
      setOpen(false)
      message.success(t('profile.saveSuccess'))
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        message.error(extractErrorReason(err, t))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card size="small" title={t('partyProfile.personalDetailsTitle')} extra={readOnly ? undefined : (
      <Button size="small" icon={<EditOutlined />} disabled={loading || !!error || saving} onClick={() => {
        form.setFieldsValue(Object.fromEntries(fields.map(([key]) => [key, profile?.[key] ?? ''])))
        setOpen(true)
      }}>{t('common.edit')}</Button>
    )}>
      {loading ? <Skeleton active paragraph={{ rows: 2 }} /> : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : <>
        {!profile && <Alert type="info" showIcon title={readOnly ? t('partyProfile.personalDetailsMissingReadOnly') : t('partyProfile.personalDetailsMissing')} style={{ marginBottom: 12 }} />}
        <Descriptions bordered size="small" column={2}>
          {fields.map(([key, label]) => <Descriptions.Item key={key} label={t(`memberDetail.${label}`)}>
            {profile?.[key]?.trim() || '-'}
          </Descriptions.Item>)}
        </Descriptions>
      </>}
      {!readOnly && (
        <Modal open={open} title={t('partyProfile.personalDetailsTitle')} okText={t('common.save')}
          cancelText={t('common.cancel')} confirmLoading={saving} onOk={() => void save()}
          onCancel={() => { if (!saving) setOpen(false) }} closable={!saving} mask={{ closable: !saving }} destroyOnHidden forceRender>
          <Form form={form} layout="vertical" autoComplete="off" disabled={saving}>
            {fields.map(([key, label]) => <Form.Item key={key} name={key} label={t(`memberDetail.${label}`)}>
              <Input />
            </Form.Item>)}
          </Form>
        </Modal>
      )}
    </Card>
  )
}
