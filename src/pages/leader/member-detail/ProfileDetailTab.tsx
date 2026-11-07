/** 成员详情 - 档案信息页签：档案字段维护。 */

import { useRequestSequence } from '../../../composables/useRequestSequence'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Skeleton,
  Tooltip,
} from 'antd'
import axios from 'axios'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { extractErrorReason } from '../../../api/common'
import {
  deleteProfileDetail,
  queryProfileDetails,
  saveProfileDetail,
} from '../../../api/profileDetails'
import type { ProfileDetail } from '../../../api/types/profileDetails'
import { useErrorFeedback } from '../../../composables/useErrorFeedback'
import { type TranslateFn } from '../../../i18n'
import { formatDateOnly, formatDateTime } from '../../../utils/datetime'
import ErrorState from '../../../components/ErrorState'

/** 详细信息新增/编辑表单值（user_id 由当前成员固定，不参与用户输入） */
interface ProfileFormValues {
  user_id: number
  id_card: string
  ethnic: string
  birth_date: Dayjs
  native_place?: string
  household_location?: string
  household_type?: string
  phone?: string
  email?: string
  father_name?: string
  father_phone?: string
  father_company?: string
  mother_name?: string
  mother_phone?: string
  mother_company?: string
}

/**
 * 详细信息面板：读取 /api/profile-details 中该用户的档案详情。
 * 非只读来源（管理端 / 党委学校端）支持新增（无档案时）、编辑与删除档案；
 * readOnly=true（如老师端班级管理进入）时隐藏以上入口，仅作查询。
 * @param { uid, locale, t, readOnly, } 类型：{ uid: number locale: 'zh' | 'en' t: TranslateFn readOnly: boolean }；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function ProfileDetailTab({
  uid,
  locale,
  t,
  readOnly,
}: {
  uid: number
  locale: 'zh' | 'en'
  t: TranslateFn
  readOnly: boolean
}) {
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const [profile, setProfile] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState({ seq: 0, force: false })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProfileDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form] = Form.useForm<ProfileFormValues>()

  const requests = useRequestSequence()
  const loadProfile = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    try {
      const res = await queryProfileDetails(
        { user_id: uid, page: 1, page_size: 20 },
        reload.force,
      )
      if (!isCurrent()) return
      setProfile(res.data[0] ?? null)
    } catch (err) {
      if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [uid, reload.force, t, requests])

  useEffect(() => {
    void loadProfile()
    return () => requests.invalidate()
  }, [loadProfile, requests, reload.seq])

  /** 打开「新增」弹窗：user_id 固定为当前成员 */
  const openCreate = useCallback(() => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ user_id: uid })
    setModalOpen(true)
  }, [form, uid])

  /** 打开「编辑」弹窗：回填已有档案 */
  const openEdit = useCallback(
    (record: ProfileDetail) => {
      setEditing(record)
      form.setFieldsValue({
        user_id: record.user_id,
        id_card: record.id_card ?? '',
        ethnic: record.ethnic ?? '',
        birth_date: dayjs(record.birth_date),
        native_place: record.native_place ?? undefined,
        household_location: record.household_location ?? undefined,
        household_type: record.household_type ?? undefined,
        phone: record.phone ?? undefined,
        email: record.email ?? undefined,
        father_name: record.father_name ?? undefined,
        father_phone: record.father_phone ?? undefined,
        father_company: record.father_company ?? undefined,
        mother_name: record.mother_name ?? undefined,
        mother_phone: record.mother_phone ?? undefined,
        mother_company: record.mother_company ?? undefined,
      })
      setModalOpen(true)
    },
    [form],
  )

  /** 由表单值构造请求体（可选字段空串统一转 null） */
  const buildBody = (values: ProfileFormValues) => ({
    id_card: values.id_card.trim(),
    ethnic: values.ethnic.trim(),
    birth_date: values.birth_date.format('YYYY-MM-DD'),
    native_place: values.native_place?.trim() || null,
    household_location: values.household_location?.trim() || null,
    household_type: values.household_type?.trim() || null,
    phone: values.phone?.trim() || null,
    email: values.email?.trim() || null,
    father_name: values.father_name?.trim() || null,
    father_phone: values.father_phone?.trim() || null,
    father_company: values.father_company?.trim() || null,
    mother_name: values.mother_name?.trim() || null,
    mother_phone: values.mother_phone?.trim() || null,
    mother_company: values.mother_company?.trim() || null,
  })

  /** 按 user_id 保存，由后端决定创建或更新。 */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const body = buildBody(values)
      await saveProfileDetail({ user_id: uid, ...body })
      message.success(t(editing ? 'memberDetail.profileUpdateSuccess' : 'memberDetail.profileCreateSuccess'))
      setModalOpen(false)
      // 保存后强制刷新，展示最新档案
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  /** 删除档案：成功后强制刷新（无档案则回到「新增」入口） */
  const doDelete = async () => {
    if (!profile) return
    setDeleting(true)
    try {
      await deleteProfileDetail(profile.id)
      message.success(t('memberDetail.profileDeleteSuccess'))
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      reportError(err)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => void loadProfile()}
      />
    )
  }

  return (
    <>
      {/* 非只读来源提供入口：有档案 → 编辑 + 删除；无档案 → 新增 */}
      {!readOnly && (
        <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
          {profile ? (
            <>
              <Tooltip title={t('memberDetail.profileEditHint')}>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(profile)}
                >
                  {t('memberDetail.edit')}
                </Button>
              </Tooltip>
              <Popconfirm
                title={t('memberDetail.profileDeleteConfirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true, loading: deleting }}
                onConfirm={() => void doDelete()}
              >
                <Tooltip title={t('memberDetail.profileDeleteHint')}>
                  <Button danger icon={<DeleteOutlined />} loading={deleting}>
                    {t('memberDetail.delete')}
                  </Button>
                </Tooltip>
              </Popconfirm>
            </>
          ) : (
            <Tooltip title={t('memberDetail.profileCreateHint')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                {t('memberDetail.create')}
              </Button>
            </Tooltip>
          )}
        </div>
      )}

      {profile ? (
        <Descriptions
          bordered
          size="small"
          column={2}
          items={[
            { key: 'id_card', label: t('memberDetail.fieldIdCard'), children: profile.id_card ?? t('profile.noData') },
            { key: 'ethnic', label: t('memberDetail.fieldEthnic'), children: profile.ethnic ?? t('profile.noData') },
            {
              key: 'birth_date',
              label: t('memberDetail.fieldBirthDate'),
              children: profile.birth_date
                ? formatDateOnly(profile.birth_date)
                : t('profile.noData'),
            },
            {
              key: 'native_place',
              label: t('memberDetail.fieldNativePlace'),
              children: profile.native_place ?? t('profile.noData'),
            },
            {
              key: 'household_location',
              label: t('memberDetail.fieldHouseholdLocation'),
              children: profile.household_location ?? t('profile.noData'),
            },
            {
              key: 'household_type',
              label: t('memberDetail.fieldHouseholdType'),
              children: profile.household_type ?? t('profile.noData'),
            },
            {
              key: 'phone',
              label: t('profile.phone'),
              children: profile.phone ?? t('profile.noData'),
            },
            {
              key: 'email',
              label: t('profile.email'),
              children: profile.email ?? t('profile.noData'),
            },
            {
              key: 'father_name',
              label: t('memberDetail.fieldFatherName'),
              children: profile.father_name ?? t('profile.noData'),
            },
            {
              key: 'father_phone',
              label: t('memberDetail.fieldFatherPhone'),
              children: profile.father_phone ?? t('profile.noData'),
            },
            {
              key: 'father_company',
              label: t('memberDetail.fieldFatherCompany'),
              children: profile.father_company ?? t('profile.noData'),
            },
            {
              key: 'mother_name',
              label: t('memberDetail.fieldMotherName'),
              children: profile.mother_name ?? t('profile.noData'),
            },
            {
              key: 'mother_phone',
              label: t('memberDetail.fieldMotherPhone'),
              children: profile.mother_phone ?? t('profile.noData'),
            },
            {
              key: 'mother_company',
              label: t('memberDetail.fieldMotherCompany'),
              children: profile.mother_company ?? t('profile.noData'),
            },
            {
              key: 'created_at',
              label: t('memberDetail.fieldProfileCreatedAt'),
              children: profile.created_at
                ? formatDateTime(profile.created_at, locale)
                : t('profile.noData'),
            },
            {
              key: 'updated_at',
              label: t('memberDetail.fieldProfileUpdatedAt'),
              children: profile.updated_at
                ? formatDateTime(profile.updated_at, locale)
                : t('profile.noData'),
            },
          ]}
        />
      ) : (
        <Alert type="info" showIcon title={t('memberDetail.profileEmpty')} />
      )}

      {/* 新增 / 编辑共用弹窗：字段覆盖 /api/profile-details 允许修改的全部字段 */}
      <Modal
        open={modalOpen}
        title={
          editing ? t('memberDetail.profileEditTitle') : t('memberDetail.profileCreateTitle')
        }
        okText={t('memberDetail.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {/* user_id 固定为当前成员，隐藏保存 */}
          <Form.Item name="user_id" hidden>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16 }}>
            <Form.Item
              name="id_card"
              label={t('memberDetail.fieldIdCard')}
              rules={[{ required: true, message: t('memberDetail.fieldRequired') }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="ethnic"
              label={t('memberDetail.fieldEthnic')}
              rules={[{ required: true, message: t('memberDetail.fieldRequired') }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="birth_date"
              label={t('memberDetail.fieldBirthDate')}
              rules={[{ required: true, message: t('memberDetail.fieldRequired') }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="native_place" label={t('memberDetail.fieldNativePlace')}>
              <Input />
            </Form.Item>
            <Form.Item name="household_location" label={t('memberDetail.fieldHouseholdLocation')}>
              <Input />
            </Form.Item>
            <Form.Item name="household_type" label={t('memberDetail.fieldHouseholdType')}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label={t('profile.phone')}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label={t('profile.email')}>
              <Input />
            </Form.Item>
            <Form.Item name="father_name" label={t('memberDetail.fieldFatherName')}>
              <Input />
            </Form.Item>
            <Form.Item name="father_phone" label={t('memberDetail.fieldFatherPhone')}>
              <Input />
            </Form.Item>
            <Form.Item name="father_company" label={t('memberDetail.fieldFatherCompany')}>
              <Input />
            </Form.Item>
            <Form.Item name="mother_name" label={t('memberDetail.fieldMotherName')}>
              <Input />
            </Form.Item>
            <Form.Item name="mother_phone" label={t('memberDetail.fieldMotherPhone')}>
              <Input />
            </Form.Item>
            <Form.Item name="mother_company" label={t('memberDetail.fieldMotherCompany')}>
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  )
}
