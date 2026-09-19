/** 领导端：公告编辑页（新建 / 编辑共用）。
 * - 新建：POST /api/announcements?no=leader_m4 —— 发布后直接进入 published 状态，保存后回列表
 * - 编辑：GET  /api/announcements/{id} 预填当前值 → PATCH /api/announcements/{id} 更新 → 回列表
 *
 * 复用与约定（ai 要求）：
 * - 表单字段与校验规则沿用原发布表单；正文用 RichTextEditor（所见即所得，存 Markdown）；
 * - 错误提示经 extractErrorWithStatus 附带 HTTP 状态码（ai 要求 9）；
 * - 可见组织（org_id）不可通过 PATCH 修改，编辑态隐藏该字段；
 * - 本页渲染在 PortalWorkspace 布局壳内，只输出内容区，不重复渲染顶栏/侧栏。
 */
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  DatePicker,
  Form,
  Input,
  Select,
} from 'antd'
import type { Dayjs } from 'dayjs'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import {
  createAnnouncement,
  getAnnouncement,
  updateAnnouncement,
  type AnnouncementPriority,
  type AnnouncementType,
} from '../../api/announcements'
import { queryOrganizations, type OrganizationInfo } from '../../api/organizations'
import { extractErrorWithStatus } from '../../api/common'
import RichTextEditor from '../../components/RichTextEditor'
import {
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_TYPES,
} from '../../config/announcement'
import { useT } from '../../i18n'
// dayjs 由 DatePicker 内部使用；这里显式引入以完成 ISO 字符串转换
import dayjs from 'dayjs'

interface EditorFormValues {
  title: string
  e_type: AnnouncementType
  priority: AnnouncementPriority
  expire_time?: Dayjs | null
  org_id: number[]
  content: string
}

/** 将后端 RFC3339 字符串转为 dayjs，用于编辑态回填失效时间 */
function toDayjs(value: string | null | undefined): Dayjs | null {
  if (!value) return null
  const d = dayjs(value)
  return d.isValid() ? d : null
}

export default function AnnouncementEditorPage() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const { portalKey, id } = useParams<{ portalKey: string; id?: string }>()
  const [form] = Form.useForm<EditorFormValues>()

  const editingId = id ? Number(id) : NaN
  const isEdit = Number.isFinite(editingId) && editingId > 0

  // 来源模块：返回公告列表时用（URL ?from=模块key）
  const fromModuleKey = new URLSearchParams(location.search).get('from')

  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgError, setOrgError] = useState(false)
  const [loading, setLoading] = useState(isEdit) // 编辑态先加载详情
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const backToList = () => navigate(`/portal/${portalKey}/${fromModuleKey ?? 'leader_m4'}`)

  const typeOptions = ANNOUNCEMENT_TYPES.map((v) => ({ value: v, label: t(`announcement.type_${v}`) }))
  const priorityOptions = ANNOUNCEMENT_PRIORITIES.map((v) => ({
    value: v,
    label: t(`announcement.priority_${v}`),
  }))
  const orgOptions = orgs.map((o) => ({ value: o.id, label: `${o.name}（${o.code}）` }))

  // 初次加载：编辑态拉公告详情回填（不需要组织列表，避免组织接口失败阻断编辑）；
  //           新建态只需可见组织列表，失败时告警并禁止提交
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (isEdit) {
        try {
          const detail = await getAnnouncement(editingId)
          if (cancelled) return
          form.setFieldsValue({
            title: detail.title,
            e_type: detail.e_type,
            priority: detail.priority,
            expire_time: toDayjs(detail.expire_time),
            content: detail.content,
          })
        } catch (err) {
          if (cancelled) return
          if (axios.isAxiosError(err) && err.response?.status === 401) return
          setLoadError(extractErrorWithStatus(err))
        } finally {
          if (!cancelled) setLoading(false)
        }
        return
      }

      try {
        const orgRes = await queryOrganizations({ page: 1, page_size: 100 })
        if (cancelled) return
        setOrgs(orgRes.data)
      } catch (err) {
        if (cancelled) return
        if (axios.isAxiosError(err) && err.response?.status === 401) return
        setOrgError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editingId])

  const onFinish = async (values: EditorFormValues) => {
    setSubmitting(true)
    try {
      const base = {
        title: values.title.trim(),
        content: values.content.trim(),
        e_type: values.e_type,
        priority: values.priority,
        expire_time: values.expire_time ? values.expire_time.toISOString() : null,
      }
      if (isEdit) {
        await updateAnnouncement(editingId, base)
        message.success(t('publish.updateSuccess'))
      } else {
        await createAnnouncement({ ...base, org_id: values.org_id })
        message.success(t('publish.createSuccess'))
      }
      backToList()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      message.error(extractErrorWithStatus(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="panel-card" style={{ width: '100%' }}>
      <div className="panel-card-body">
        <div className="announcement-detail-back">
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={backToList}>
            {t('announcement.backToList')}
          </Button>
        </div>

        {loadError ? (
          <Alert
            type="error"
            showIcon
            title={loadError}
            action={
              <Button size="small" onClick={backToList}>
                {t('announcement.backToList')}
              </Button>
            }
          />
        ) : (
          <>
            <h3 className="panel-card-title" style={{ marginBottom: 12 }}>
              {isEdit ? t('publish.editTitle') : t('publish.formTitle')}
            </h3>
            {orgError && (
              <Alert
                type="warning"
                showIcon
                title={t('publish.orgLoadFailed')}
                style={{ marginBottom: 12 }}
              />
            )}
            {isEdit && (
              <Alert
                type="info"
                showIcon
                title={t('publish.orgImmutableHint')}
                style={{ marginBottom: 12 }}
              />
            )}
            <Form<EditorFormValues>
              form={form}
              layout="vertical"
              requiredMark={false}
              initialValues={{ e_type: 'system', priority: 'normal', org_id: [] }}
              onFinish={(values) => void onFinish(values)}
            >
            <div className="leave-form-grid">
              <Form.Item
                name="title"
                label={t('publish.fieldTitle')}
                rules={[{ required: true, message: t('publish.titleRequired') }]}
              >
                <Input maxLength={200} showCount placeholder={t('publish.titlePlaceholder')} />
              </Form.Item>

              {!isEdit && (
                <Form.Item
                  name="org_id"
                  label={t('publish.fieldOrgs')}
                  rules={[{ required: true, message: t('publish.orgsRequired') }]}
                >
                  <Select
                    mode="multiple"
                    options={orgOptions}
                    placeholder={t('publish.orgsPlaceholder')}
                    optionFilterProp="label"
                    allowClear
                  />
                </Form.Item>
              )}

              <Form.Item
                name="e_type"
                label={t('announcement.colType')}
                rules={[{ required: true }]}
              >
                <Select options={typeOptions} />
              </Form.Item>

              <Form.Item
                name="priority"
                label={t('announcement.colPriority')}
                rules={[{ required: true }]}
              >
                <Select options={priorityOptions} />
              </Form.Item>

              <Form.Item name="expire_time" label={t('publish.fieldExpire')}>
                <DatePicker
                  showTime
                  style={{ width: '100%' }}
                  placeholder={t('publish.expirePlaceholder')}
                />
              </Form.Item>

              <Form.Item
                name="content"
                label={t('publish.fieldContent')}
                rules={[{ required: true, message: t('publish.contentRequired') }]}
                style={{ gridColumn: '1 / -1' }}
              >
                <RichTextEditor
                  maxLength={2000}
                  showCount
                  placeholder={t('publish.contentPlaceholder')}
                />
              </Form.Item>
            </div>

            <Form.Item className="leave-submit-item">
              <Button type="primary" htmlType="submit" loading={submitting} disabled={loading || orgError}>
                {isEdit ? t('publish.save') : t('publish.submit')}
              </Button>
            </Form.Item>
          </Form>
          </>
        )}
      </div>
    </section>
  )
}