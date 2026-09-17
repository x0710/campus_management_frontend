import { ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  DatePicker,
  Form,
  Input,
  Popconfirm,
  Select,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import {
  createAnnouncement,
  deleteAnnouncement,
  queryAnnouncements,
  updateAnnouncement,
  type AnnouncementListItem,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AnnouncementType,
} from '../../api/announcements'
import { queryOrganizations, type OrganizationInfo } from '../../api/organizations'
import { getCurrentUser } from '../../api/auth'
import type { PageQuery } from '../../api/common'
import MarkdownEditor from '../../components/MarkdownEditor'
import {
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_PRIORITY_COLOR,
  ANNOUNCEMENT_STATUS_COLOR,
  ANNOUNCEMENT_TYPE_COLOR,
  ANNOUNCEMENT_TYPES,
} from '../../config/announcement'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

interface PublishFormValues {
  title: string
  e_type: AnnouncementType
  priority: AnnouncementPriority
  expire_time?: Dayjs | null
  org_id: number[]
  content: string
}

interface PublishListQuery extends PageQuery {
  publisher_id?: number
  status?: AnnouncementStatus
}

/** 领导端：发布通知（POST /api/announcements）+ 本人通知管理（GET/PATCH/DELETE） */
export default function PublishAnnouncementView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm<PublishFormValues>()

  const [uid, setUid] = useState<number | null>(null)
  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgError, setOrgError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'all'>('all')
  const [actingId, setActingId] = useState<number | null>(null)

  const listQuery = useMemo(
    () => (uid === null ? {} : { publisher_id: uid, ...(statusFilter === 'all' ? {} : { status: statusFilter }) }),
    [uid, statusFilter],
  )
  const { data, total, loading, error, page, setPage, pageSize, setPageSize, refresh } =
    usePaginated<AnnouncementListItem, PublishListQuery>(queryAnnouncements, listQuery)

  // 初次加载：当前用户（用于按发布人过滤）+ 可见组织选项
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [me, orgRes] = await Promise.all([
          getCurrentUser(),
          queryOrganizations({ page: 1, page_size: 100 }),
        ])
        if (cancelled) return
        setUid(me.uid)
        setOrgs(orgRes.data)
      } catch (err) {
        if (cancelled) return
        if (axios.isAxiosError(err) && err.response?.status === 401) return
        setOrgError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // uid / 状态筛选就绪或变化后重新拉列表
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, statusFilter])

  const typeOptions = useMemo(
    () => ANNOUNCEMENT_TYPES.map((v) => ({ value: v, label: t(`announcement.type_${v}`) })),
    [t],
  )
  const priorityOptions = useMemo(
    () => ANNOUNCEMENT_PRIORITIES.map((v) => ({ value: v, label: t(`announcement.priority_${v}`) })),
    [t],
  )
  const statusOptions = useMemo(
    () =>
      (['all', 'published', 'withdrawn', 'draft'] as const).map((v) => ({
        value: v,
        label: v === 'all' ? t('publish.filterAll') : t(`announcement.status_${v}`),
      })),
    [t],
  )
  const orgOptions = useMemo(
    () => orgs.map((o) => ({ value: o.id, label: `${o.name}（${o.code}）` })),
    [orgs],
  )

  const onFinish = async (values: PublishFormValues) => {
    setSubmitting(true)
    try {
      await createAnnouncement({
        title: values.title.trim(),
        content: values.content.trim(),
        e_type: values.e_type,
        priority: values.priority,
        expire_time: values.expire_time ? values.expire_time.toISOString() : null,
        org_id: values.org_id,
      })
      message.success(t('publish.createSuccess'))
      form.resetFields()
      setPage(1)
      refresh()
    } catch (err) {
      const data = axios.isAxiosError(err) ? err.response?.data : null
      const detail = typeof data === 'string' && data.trim() ? data.trim() : null
      if (detail) message.error(detail)
      else if (axios.isAxiosError(err) && !err.response) message.error(t('common.networkError'))
      else message.error(t('common.loadFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const changeStatus = async (record: AnnouncementListItem, status: AnnouncementStatus) => {
    setActingId(record.id)
    try {
      await updateAnnouncement(record.id, { status })
      message.success(
        status === 'published' ? t('publish.republishSuccess') : t('publish.withdrawSuccess'),
      )
      refresh()
    } catch (err) {
      const data = axios.isAxiosError(err) ? err.response?.data : null
      const detail = typeof data === 'string' && data.trim() ? data.trim() : null
      if (detail) message.error(detail)
      else if (axios.isAxiosError(err) && !err.response) message.error(t('common.networkError'))
      else message.error(t('common.loadFailed'))
    } finally {
      setActingId(null)
    }
  }

  const remove = async (record: AnnouncementListItem) => {
    setActingId(record.id)
    try {
      await deleteAnnouncement(record.id)
      message.success(t('publish.deleteSuccess'))
      refresh()
    } catch (err) {
      const data = axios.isAxiosError(err) ? err.response?.data : null
      const detail = typeof data === 'string' && data.trim() ? data.trim() : null
      if (detail) message.error(detail)
      else if (axios.isAxiosError(err) && !err.response) message.error(t('common.networkError'))
      else message.error(t('common.loadFailed'))
    } finally {
      setActingId(null)
    }
  }

  const columns = useMemo<ColumnsType<AnnouncementListItem>>(
    () => [
      {
        title: t('announcement.colTitle'),
        dataIndex: 'title',
        key: 'title',
        width: 220,
        ellipsis: true,
      },
      {
        title: t('announcement.colType'),
        dataIndex: 'e_type',
        key: 'e_type',
        width: 92,
        render: (v: AnnouncementType) => (
          <Tag color={ANNOUNCEMENT_TYPE_COLOR[v]}>{t(`announcement.type_${v}`)}</Tag>
        ),
      },
      {
        title: t('announcement.colPriority'),
        dataIndex: 'priority',
        key: 'priority',
        width: 84,
        render: (v: AnnouncementPriority) => (
          <Tag color={ANNOUNCEMENT_PRIORITY_COLOR[v]}>{t(`announcement.priority_${v}`)}</Tag>
        ),
      },
      {
        title: t('announcement.colStatus'),
        dataIndex: 'status',
        key: 'status',
        width: 88,
        render: (v: AnnouncementStatus) => (
          <Tag color={ANNOUNCEMENT_STATUS_COLOR[v]}>{t(`announcement.status_${v}`)}</Tag>
        ),
      },
      {
        title: t('publish.colExpire'),
        dataIndex: 'expire_time',
        key: 'expire_time',
        width: 150,
        render: (v: string | null) => (v ? formatDateTime(v, locale) : '—'),
      },
      {
        title: t('announcement.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 150,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 150,
        render: (_, record) => (
          <div className="approval-actions">
            {record.status === 'published' && (
              <Popconfirm
                title={t('publish.withdrawConfirm')}
                okText={t('publish.withdraw')}
                cancelText={t('approval.cancel')}
                okButtonProps={{ loading: actingId === record.id }}
                onConfirm={() => void changeStatus(record, 'withdrawn')}
              >
                <Button type="link" size="small">
                  {t('publish.withdraw')}
                </Button>
              </Popconfirm>
            )}
            {record.status === 'withdrawn' && (
              <Button
                type="link"
                size="small"
                loading={actingId === record.id}
                onClick={() => void changeStatus(record, 'published')}
              >
                {t('publish.republish')}
              </Button>
            )}
            <Popconfirm
              title={t('publish.deleteConfirm')}
              okText={t('publish.delete')}
              cancelText={t('approval.cancel')}
              okButtonProps={{ danger: true, loading: actingId === record.id }}
              onConfirm={() => void remove(record)}
            >
              <Button type="link" size="small" danger>
                {t('publish.delete')}
              </Button>
            </Popconfirm>
          </div>
        ),
      },
    ],
    [t, locale, actingId],
  )

  return (
    <div className="student-view">
      <section className="panel-card student-form-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('publish.formTitle')}</h3>
        </header>
        <div className="panel-card-body">
          {orgError && (
            <Alert
              type="warning"
              showIcon
              title={t('publish.orgLoadFailed')}
              style={{ marginBottom: 12 }}
            />
          )}
          <Form<PublishFormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ e_type: 'system', priority: 'normal', org_id: [] }}
            onFinish={(values: PublishFormValues) => void onFinish(values)}
          >
            <div className="leave-form-grid">
              <Form.Item
                name="title"
                label={t('publish.fieldTitle')}
                rules={[{ required: true, message: t('publish.titleRequired') }]}
              >
                <Input maxLength={200} showCount placeholder={t('publish.titlePlaceholder')} />
              </Form.Item>

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
                <MarkdownEditor
                  rows={10}
                  maxLength={2000}
                  showCount
                  placeholder={t('publish.contentPlaceholder')}
                />
              </Form.Item>
            </div>

            <Form.Item className="leave-submit-item">
              <Button type="primary" htmlType="submit" loading={submitting} disabled={orgError}>
                {t('publish.submit')}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </section>

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('publish.myNotices')}</h3>
          <div className="approval-toolbar">
            <Select
              value={statusFilter}
              options={statusOptions}
              style={{ width: 140 }}
              onChange={(v: AnnouncementStatus | 'all') => {
                setPage(1)
                setStatusFilter(v)
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={refresh}>
              {t('common.refresh')}
            </Button>
          </div>
        </header>
        <div className="panel-card-body">
          {error ? (
            <Alert
              type="error"
              showIcon
              title={error === 'network' ? t('common.networkError') : t('common.loadFailed')}
              action={
                <Button size="small" onClick={refresh}>
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <Table<AnnouncementListItem>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={data}
              locale={{ emptyText: t('common.noData') }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
                onChange: (nextPage: number, nextSize: number) => {
                  if (nextSize !== pageSize) setPageSize(nextSize)
                  else setPage(nextPage)
                },
              }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
