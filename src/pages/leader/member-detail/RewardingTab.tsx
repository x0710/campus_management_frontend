import { isEntryActionTarget } from '../../../utils/entryInteraction'
import { useRequestSequence } from '../../../composables/useRequestSequence'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Table,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractErrorReason } from '../../../api/common'
import { createRewarding, deleteRewarding, queryRewardings, updateRewarding } from '../../../api/rewardings'
import type { RewardingDto } from '../../../api/types/rewardings'
import { useErrorFeedback } from '../../../composables/useErrorFeedback'
import { MEMBER_DETAIL_PAGE_SIZE } from '../../../config/leaderOrg'
import {
  REWARDING_AMOUNT_MAX_YUAN,
  REWARDING_AMOUNT_MIN_YUAN,
  REWARDING_AMOUNT_STEP_YUAN,
  REWARDING_PROJECT_MAX_LENGTH,
} from '../../../config/rewarding'
import { type TranslateFn } from '../../../i18n'
import { formatDateTime } from '../../../utils/datetime'
import { formatCentsAsYuan, yuanToCents } from '../../../utils/money'
import ErrorState from '../../../components/ErrorState'

/** 奖学金及补助新增/编辑表单值（uid 固定为当前成员；金额以「元」输入） */
interface RewardingFormValues {
  project: string
  amount_yuan: number
}

/**
 * 奖学金及补助 Tab：分页展示该成员的奖学金/补助记录，双击行查看详情。
 * 非只读来源（管理端 / 党委学校端）支持新增、编辑（金额以元输入、提交转分）与删除；
 * readOnly=true（如老师端班级管理进入）时隐藏以上入口，仅作查询。
 */
export default function RewardingTab({
  uid,
  t,
  locale,
  readOnly,
}: {
  uid: number
  t: TranslateFn
  locale: 'zh' | 'en'
  readOnly: boolean
}) {
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const [rows, setRows] = useState<RewardingDto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState({ seq: 0, force: false })
  const [detail, setDetail] = useState<RewardingDto | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RewardingDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form] = Form.useForm<RewardingFormValues>()

  const requests = useRequestSequence()
  const load = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    try {
      const res = await queryRewardings(
        { page, page_size: MEMBER_DETAIL_PAGE_SIZE, uid },
        reload.force,
      )
      if (!isCurrent()) return
      setRows(res.data)
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

  /** 打开「新增」弹窗：uid 固定为当前成员 */
  const openCreate = useCallback(() => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }, [form])

  /** 打开「编辑」弹窗：回填项目名称与金额（分 → 元） */
  const openEdit = useCallback(
    (record: RewardingDto) => {
      setEditing(record)
      form.setFieldsValue({
        project: record.project,
        amount_yuan: record.amount_cents / 100,
      })
      setModalOpen(true)
    },
    [form],
  )

  /** 提交：新增 → POST；编辑 → PATCH（金额「元」转换为后端「分」） */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        uid,
        project: values.project.trim(),
        amount_cents: yuanToCents(values.amount_yuan),
      }
      if (editing) {
        await updateRewarding(editing.id, payload)
        message.success(t('rewarding.updateSuccess'))
      } else {
        await createRewarding(payload)
        message.success(t('rewarding.createSuccess'))
      }
      setModalOpen(false)
      // 保存后强制刷新，展示最新记录
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  /** 删除记录：成功后强制刷新 */
  const doDelete = useCallback(
    async (id: number) => {
      setDeletingId(id)
      try {
        await deleteRewarding(id)
        message.success(t('rewarding.deleteSuccess'))
        setReload((r) => ({ seq: r.seq + 1, force: true }))
      } catch (err) {
        reportError(err)
      } finally {
        setDeletingId(null)
      }
    },
    [reportError, message, t],
  )

  const columns = useMemo<ColumnsType<RewardingDto>>(() => {
    const cols: ColumnsType<RewardingDto> = [
      {
        title: t('rewarding.colProject'),
        dataIndex: 'project',
        key: 'project',
        ellipsis: true,
        render: (v: string) => <span title={v}>{v || '—'}</span>,
      },
      {
        title: t('rewarding.colAmount'),
        dataIndex: 'amount_cents',
        key: 'amount_cents',
        width: 160,
        align: 'right',
        render: (cents: number) => formatCentsAsYuan(cents, locale),
      },
      {
        title: t('rewarding.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 190,
        render: (v: string) => formatDateTime(v, locale),
      },
    ]
    // 只读来源（老师端班级管理）不展示编辑/删除入口
    if (!readOnly) {
      cols.push({
        title: t('approval.colAction'),
        key: 'action',
        width: 170,
        render: (_: unknown, record: RewardingDto) => (
          <div className="approval-actions">
            <Tooltip title={t('memberDetail.rewardingEditHint')}>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(record)}
              >
                {t('rewarding.edit')}
              </Button>
            </Tooltip>
            <Popconfirm
              title={t('rewarding.deleteConfirm')}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true, loading: deletingId === record.id }}
              onConfirm={() => void doDelete(record.id)}
            >
              <Tooltip title={t('memberDetail.rewardingDeleteHint')}>
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingId === record.id}
                >
                  {t('rewarding.delete')}
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
        ),
      })
    }
    return cols
  }, [t, locale, openEdit, readOnly, deletingId, doDelete])

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.rewardingRefreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
        {/* 非只读来源提供新增入口 */}
        {!readOnly && (
          <Tooltip title={t('memberDetail.rewardingCreateHint')}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('rewarding.createTitle')}
            </Button>
          </Tooltip>
        )}
      </div>

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
        />
      ) : (
        <Table<RewardingDto>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 890 }}
          onRow={(record) => ({
            onDoubleClick: (e: React.MouseEvent) => {
              if (isEntryActionTarget(e.target)) return
              const target = e.target as HTMLElement
              // 点击操作按钮或气泡确认框时不触发行详情
              if (target.closest('button') || target.closest('.ant-popover')) return
              setDetail(record)
            },
            title: t('memberDetail.rewardingRowClickHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: MEMBER_DETAIL_PAGE_SIZE,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      <Modal
        open={detail !== null}
        title={t('rewarding.detailTitle')}
        footer={<Button onClick={() => setDetail(null)}>{t('common.close')}</Button>}
        onCancel={() => setDetail(null)}
        destroyOnHidden
      >
        {detail && (
          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              { key: 'id', label: t('common.id'), children: detail.id },
              { key: 'uid', label: t('rewarding.colUid'), children: detail.uid },
              {
                key: 'project',
                label: t('rewarding.colProject'),
                children: detail.project || '—',
              },
              {
                key: 'amount',
                label: t('rewarding.colAmount'),
                children: formatCentsAsYuan(detail.amount_cents, locale),
              },
              {
                key: 'created_at',
                label: t('rewarding.colCreatedAt'),
                children: formatDateTime(detail.created_at, locale),
              },
            ]}
          />
        )}
      </Modal>

      {/* 新增 / 编辑共用弹窗：uid 固定为当前成员，金额以元输入 */}
      <Modal
        open={modalOpen}
        title={editing ? t('rewarding.editTitle') : t('rewarding.createTitle')}
        okText={t('memberDetail.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="project"
            label={t('rewarding.fieldProject')}
            rules={[{ required: true, message: t('rewarding.projectRequired') }]}
          >
            <Input maxLength={REWARDING_PROJECT_MAX_LENGTH} showCount />
          </Form.Item>
          <Form.Item
            name="amount_yuan"
            label={t('rewarding.fieldAmount')}
            rules={[{ required: true, message: t('rewarding.amountRequired') }]}
            extra={t('rewarding.amountHint')}
          >
            <InputNumber
              style={{ width: '100%' }}
              prefix="¥"
              step={REWARDING_AMOUNT_STEP_YUAN}
              precision={2}
              min={REWARDING_AMOUNT_MIN_YUAN}
              max={REWARDING_AMOUNT_MAX_YUAN}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
