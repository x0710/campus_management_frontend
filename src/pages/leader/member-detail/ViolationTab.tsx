import { isEntryActionTarget } from '../../../utils/entryInteraction'
import { useRequestSequence } from '../../../composables/useRequestSequence'
import { EditOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractErrorReason } from '../../../api/common'
import { getViolation, queryViolations, updateViolation } from '../../../api/violations'
import type { ViolationDto, ViolationSeverity } from '../../../api/types/violations'
import { useErrorFeedback } from '../../../composables/useErrorFeedback'
import {
  VIOLATION_CATEGORY_MAX_LENGTH,
  VIOLATION_DESC_MAX_LENGTH,
  VIOLATION_LOCATION_MAX_LENGTH,
  VIOLATION_PAGE_SIZE,
  VIOLATION_SEVERITY_COLOR,
  VIOLATION_SEVERITY_ORDER,
  VIOLATION_TITLE_MAX_LENGTH,
} from '../../../config/violation'
import { type TranslateFn } from '../../../i18n'
import { useSettingsStore } from '../../../store/settings'
import { formatDateTime } from '../../../utils/datetime'
import ErrorState from '../../../components/ErrorState'

/** 违规编辑表单值 */
interface ViolationFormValues {
  title: string
  category: string
  description?: string
  location?: string
  occurred_at: Dayjs
  severity: ViolationSeverity
}

/**
 * 违规信息 Tab：分页展示成员违规记录，双击行查看详细，支持编辑（PATCH /api/violations/{id}）。
 * readOnly=true（如老师端班级管理进入）时隐藏编辑入口，仅可查看详情（代码要求 14）。
 */
export default function ViolationTab({ uid, t, readOnly }: { uid: number; t: TranslateFn; readOnly: boolean }) {
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const locale = useSettingsStore((s) => s.locale)

  const [list, setList] = useState<ViolationDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [reload, setReload] = useState({ seq: 0, force: false })

  const [detail, setDetail] = useState<ViolationDto | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editTarget, setEditTarget] = useState<ViolationDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<ViolationFormValues>()

  const requests = useRequestSequence()
  const load = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    try {
      const res = await queryViolations(
        { user_id: uid, page, page_size: VIOLATION_PAGE_SIZE },
        reload.force,
      )
      if (!isCurrent()) return
      setList(res.data)
      setTotal(res.total)
    } catch (err) {
      if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [uid, page, reload.force, t, requests])

  useEffect(() => {
    void load()
    return () => requests.invalidate()
  }, [load, requests, reload.seq])

  /** 双击行：拉取该条违规详情（GET /api/violations/{id}） */
  const openDetail = useCallback(async (id: number) => {
    setDetailLoading(true)
    try {
      setDetail(await getViolation(id, true))
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        reportError(err)
      }
    } finally {
      setDetailLoading(false)
    }
  }, [reportError])

  /** 打开编辑弹窗（列表项即完整详情，直接回填） */
  const openEdit = useCallback(
    (record: ViolationDto) => {
      setEditTarget(record)
      form.setFieldsValue({
        title: record.title,
        category: record.category,
        description: record.description ?? undefined,
        location: record.location ?? undefined,
        occurred_at: dayjs(record.occurred_at),
        severity: record.severity,
      })
    },
    [form],
  )

  const submit = async () => {
    const values = await form.validateFields()
    if (!editTarget) return
    setSaving(true)
    try {
      await updateViolation(editTarget.id, {
        title: values.title.trim(),
        category: values.category.trim(),
        description: values.description ?? '',
        location: values.location ?? '',
        occurred_at: values.occurred_at.toISOString(),
        severity: values.severity,
      })
      message.success(t('memberDetail.violationUpdateSuccess'))
      setEditTarget(null)
      // 保存后强制刷新，展示最新数据（代码要求 13）
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ColumnsType<ViolationDto>>(() => {
    const cols: ColumnsType<ViolationDto> = [
      { title: t('memberDetail.colCategory'), dataIndex: 'category', key: 'category', width: 130 },
      {
        title: t('memberDetail.colTitle'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
        render: (v: string) => <span title={v}>{v}</span>,
      },
      {
        title: t('memberDetail.colSeverity'),
        dataIndex: 'severity',
        key: 'severity',
        width: 120,
        render: (v: ViolationSeverity) => (
          <Tag color={VIOLATION_SEVERITY_COLOR[v]}>{t(`memberDetail.severity_${v}`)}</Tag>
        ),
      },
      {
        title: t('memberDetail.colOccurredAt'),
        dataIndex: 'occurred_at',
        key: 'occurred_at',
        width: 170,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('memberDetail.colLocation'),
        dataIndex: 'location',
        key: 'location',
        width: 160,
        render: (v: string | null) => v || '—',
      },
      ]
    // 只读来源（老师端班级管理）不展示违规编辑入口
    if (!readOnly) {
      cols.push({
        title: t('approval.colAction'),
        key: 'action',
        width: 100,
        render: (_: unknown, record: ViolationDto) => (
          <Tooltip title={t('memberDetail.editViolation')}>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            >
              {t('memberDetail.edit')}
            </Button>
          </Tooltip>
        ),
      })
    }
    return cols
  }, [t, locale, openEdit, readOnly])

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.violationRefreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
        />
      ) : (
        <Table<ViolationDto>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={list}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onDoubleClick: (e: React.MouseEvent) => {
              if (isEntryActionTarget(e.target)) return
              const target = e.target as HTMLElement
              if (target.closest('button')) return
              void openDetail(record.id)
            },
            title: t('memberDetail.violationRowClickHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: VIOLATION_PAGE_SIZE,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      {/* 违规详情：双击行查看（代码要求 14） */}
      <Modal
        open={detail !== null}
        title={t('memberDetail.violationDetailTitle')}
        onCancel={() => setDetail(null)}
        footer={[
          // 只读来源（老师端班级管理）仅提供关闭按钮
          ...(readOnly
            ? []
            : [
                <Button
                  key="edit"
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => {
                    if (detail) openEdit(detail)
                    setDetail(null)
                  }}
                >
                  {t('memberDetail.edit')}
                </Button>,
              ]),
          <Button key="close" onClick={() => setDetail(null)}>
            {t('common.close')}
          </Button>,
        ]}
        destroyOnHidden
      >
        {detailLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : detail ? (
          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              { key: 'id', label: t('common.id'), children: detail.id },
              { key: 'category', label: t('memberDetail.colCategory'), children: detail.category },
              { key: 'title', label: t('memberDetail.colTitle'), children: detail.title },
              {
                key: 'severity',
                label: t('memberDetail.colSeverity'),
                children: (
                  <Tag color={VIOLATION_SEVERITY_COLOR[detail.severity]}>
                    {t(`memberDetail.severity_${detail.severity}`)}
                  </Tag>
                ),
              },
              {
                key: 'occurred_at',
                label: t('memberDetail.colOccurredAt'),
                children: formatDateTime(detail.occurred_at, locale),
              },
              {
                key: 'location',
                label: t('memberDetail.colLocation'),
                children: detail.location || '—',
              },
              {
                key: 'description',
                label: t('memberDetail.colDescription'),
                children: detail.description || '—',
              },
              {
                key: 'recorder',
                label: t('memberDetail.fieldRecorder'),
                children: detail.recorder_id,
              },
              {
                key: 'updated_at',
                label: t('memberDetail.fieldUpdatedAt'),
                children: formatDateTime(detail.updated_at, locale),
              },
            ]}
          />
        ) : null}
      </Modal>

      {/* 违规编辑 */}
      <Modal
        open={editTarget !== null}
        title={t('memberDetail.editViolation')}
        okText={t('memberDetail.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setEditTarget(null)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="title"
            label={t('memberDetail.fieldTitle')}
            rules={[{ required: true, message: t('memberDetail.titleRequired') }]}
          >
            <Input maxLength={VIOLATION_TITLE_MAX_LENGTH} showCount />
          </Form.Item>
          <Form.Item
            name="category"
            label={t('memberDetail.fieldCategory')}
            rules={[{ required: true, message: t('memberDetail.categoryRequired') }]}
          >
            <Input maxLength={VIOLATION_CATEGORY_MAX_LENGTH} />
          </Form.Item>
          <Form.Item
            name="severity"
            label={t('memberDetail.colSeverity')}
            rules={[{ required: true }]}
          >
            <Select
              options={VIOLATION_SEVERITY_ORDER.map((v) => ({
                value: v,
                label: t(`memberDetail.severity_${v}`),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="occurred_at"
            label={t('memberDetail.fieldOccurredAt')}
            rules={[{ required: true, message: t('memberDetail.occurredAtRequired') }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label={t('memberDetail.fieldLocation')}>
            <Input maxLength={VIOLATION_LOCATION_MAX_LENGTH} />
          </Form.Item>
          <Form.Item name="description" label={t('memberDetail.fieldDescription')}>
            <Input.TextArea rows={3} maxLength={VIOLATION_DESC_MAX_LENGTH} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
