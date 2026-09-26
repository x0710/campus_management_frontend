/**
 * 管理端：职位管理
 * - 职位 CRUD（GET/POST /positions，PATCH/DELETE /positions/management/{code}）
 * - 支持按编码/名称关键字搜索、手动刷新（绕过会话缓存）
 * - 点击表格行查看职位详情（GET /positions/management/{code}）
 * code 为主键，创建时指定、创建后不可修改。
 */
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createPosition,
  deletePosition,
  getPosition,
  queryPositions,
  updatePosition,
} from '../../api/positions'
import type { PositionDetail } from '../../api/types/positions'
import { extractErrorWithStatus } from '../../api/common'
import {
  POSITION_CODE_MAX_LENGTH,
  POSITION_DESC_MAX_LENGTH,
  POSITION_NAME_MAX_LENGTH,
  POSITION_PAGE_SIZE,
} from '../../config/position'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'
import { useT } from '../../i18n'

type PositionFormValues = {
  code: string
  name: string
  description?: string
}

export default function PositionsAdminView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()

  // ---- 列表 ----
  const [positions, setPositions] = useState<PositionDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  // 重载令牌：seq 变化触发重新加载，force=true 时绕过会话缓存（手动刷新）
  const [reload, setReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  // ---- 表单弹窗 ----
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; position?: PositionDetail } | null>(
    null,
  )
  const [saving, setSaving] = useState(false)
  const [actingCode, setActingCode] = useState<string | null>(null)
  const [form] = Form.useForm<PositionFormValues>()

  // ---- 详情弹窗 ----
  const [detailCode, setDetailCode] = useState<string | null>(null)
  const [detail, setDetail] = useState<PositionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  /** 统一错误提示：带 HTTP 状态码（代码要求 9） */
  const showError = useCallback(
    (err: unknown) => {
      const code = extractErrorWithStatus(err)
      message.error(
        code === 'network'
          ? t('common.networkError')
          : code === 'failed'
            ? t('common.loadFailed')
            : code,
      )
    },
    [message, t],
  )

  /** 把内部错误码映射为可展示文案 */
  const errorText = useCallback(
    (code: string) =>
      code === 'network'
        ? t('common.networkError')
        : code === 'failed'
          ? t('common.loadFailed')
          : code,
    [t],
  )

  // ============ 列表加载 ============
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await queryPositions(
        {
          page,
          page_size: POSITION_PAGE_SIZE,
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
        },
        reload.force,
      )
      setPositions(res.data)
      setTotal(res.total)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorWithStatus(err))
      }
    } finally {
      setLoading(false)
    }
  }, [page, keyword, reload.seq, reload.force]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

  // ============ 详情 ============
  const openDetail = async (code: string) => {
    setDetailCode(code)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      setDetail(await getPosition(code))
    } catch (err) {
      setDetailError(extractErrorWithStatus(err))
    } finally {
      setDetailLoading(false)
    }
  }

  // ============ 新建 / 编辑 ============
  const openCreate = () => {
    setModal({ mode: 'create' })
    form.resetFields()
  }

  const openEdit = (position: PositionDetail) => {
    setModal({ mode: 'edit', position })
    form.setFieldsValue({
      code: position.code,
      name: position.name,
      description: position.description ?? undefined,
    })
  }

  const submit = async () => {
    const values = await form.validateFields()
    if (!modal) return
    setSaving(true)
    try {
      if (modal.mode === 'create') {
        await createPosition({
          code: values.code.trim(),
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
        })
        message.success(t('adminPositions.createSuccess'))
      } else {
        // description 为空时省略该字段：后端将 None 视为「保留原值」
        await updatePosition(modal.position!.code, {
          name: values.name.trim(),
          ...(values.description?.trim() ? { description: values.description.trim() } : {}),
        })
        message.success(t('adminPositions.updateSuccess'))
      }
      setModal(null)
      setReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      showError(err)
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async (position: PositionDetail) => {
    setActingCode(position.code)
    try {
      await deletePosition(position.code)
      message.success(t('adminPositions.deleteSuccess'))
      setReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      showError(err)
    } finally {
      setActingCode(null)
    }
  }

  // ============ 列定义 ============
  const columns = useMemo<ColumnsType<PositionDetail>>(
    () => [
      {
        title: t('adminPositions.fieldCode'),
        dataIndex: 'code',
        key: 'code',
        width: 180,
        render: (v: string) => <Tag color="geekblue">{v}</Tag>,
      },
      { title: t('adminPositions.fieldName'), dataIndex: 'name', key: 'name', width: 180 },
      {
        title: t('adminPositions.fieldDesc'),
        dataIndex: 'description',
        key: 'description',
        render: (v: string | null) => v || '—',
      },
      {
        title: t('adminPositions.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 170,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 180,
        render: (_, record) => (
          <div className="approval-actions">
            <Tooltip title={t('adminPositions.editHint')}>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(record)}
              >
                {t('adminPositions.edit')}
              </Button>
            </Tooltip>
            <Popconfirm
              title={t('adminPositions.deleteConfirm')}
              okText={t('adminPositions.delete')}
              cancelText={t('approval.cancel')}
              okButtonProps={{ danger: true, loading: actingCode === record.code }}
              onConfirm={() => void doDelete(record)}
            >
              <Tooltip title={t('adminPositions.deleteHint')}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  {t('adminPositions.delete')}
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, actingCode],
  )

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('adminPositions.title')}</h3>
        </header>
        <div className="panel-card-body">
          <div className="approval-toolbar" style={{ marginBottom: 12 }}>
            <Input.Search
              allowClear
              className="admin-search"
              placeholder={t('adminPositions.searchPlaceholder')}
              onSearch={(v: string) => {
                setPage(1)
                setKeyword(v)
              }}
            />
            <Tooltip title={t('adminPositions.refreshHint')}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
              >
                {t('common.refresh')}
              </Button>
            </Tooltip>
            <Tooltip title={t('adminPositions.newHint')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                {t('adminPositions.newPosition')}
              </Button>
            </Tooltip>
          </div>

          {error ? (
            <Alert
              type="error"
              showIcon
              title={errorText(error)}
              action={
                <Button
                  size="small"
                  onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
                >
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <Table<PositionDetail>
              rowKey="code"
              loading={loading}
              columns={columns}
              dataSource={positions}
              locale={{ emptyText: t('common.noData') }}
              onRow={(record: PositionDetail) => ({
                onClick: (e: React.MouseEvent) => {
                  // 点击按钮/链接/气泡时不触发行点击
                  const target = e.target as HTMLElement
                  if (target.closest('button') || target.closest('.ant-popover')) return
                  void openDetail(record.code)
                },
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize: POSITION_PAGE_SIZE,
                total,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
                onChange: (p: number) => setPage(p),
              }}
            />
          )}
        </div>
      </section>

      {/* 新建 / 编辑 */}
      <Modal
        open={modal !== null}
        title={
          modal?.mode === 'create'
            ? t('adminPositions.newPosition')
            : t('adminPositions.editPosition')
        }
        okText={t('adminPositions.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setModal(null)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="code"
            label={t('adminPositions.fieldCode')}
            rules={[{ required: true, message: t('adminPositions.codeRequired') }]}
            extra={modal?.mode === 'edit' ? t('adminPositions.codeImmutableHint') : undefined}
          >
            <Input
              maxLength={POSITION_CODE_MAX_LENGTH}
              disabled={modal?.mode === 'edit'}
              placeholder={t('adminPositions.codePlaceholder')}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('adminPositions.fieldName')}
            rules={[{ required: true, message: t('adminPositions.nameRequired') }]}
          >
            <Input maxLength={POSITION_NAME_MAX_LENGTH} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('adminPositions.fieldDesc')}
            extra={t('adminPositions.descKeepHint')}
          >
            <Input.TextArea rows={3} maxLength={POSITION_DESC_MAX_LENGTH} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情 */}
      <Modal
        open={detailCode !== null}
        title={t('adminPositions.detailTitle')}
        footer={
          <Button onClick={() => setDetailCode(null)}>{t('common.close')}</Button>
        }
        onCancel={() => setDetailCode(null)}
        destroyOnHidden
      >
        {detailError ? (
          <Alert type="error" showIcon title={errorText(detailError)} />
        ) : (
          <Spin spinning={detailLoading}>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                {
                  key: 'code',
                  label: t('adminPositions.fieldCode'),
                  children: detail?.code ?? '—',
                },
                {
                  key: 'name',
                  label: t('adminPositions.fieldName'),
                  children: detail?.name ?? '—',
                },
                {
                  key: 'description',
                  label: t('adminPositions.fieldDesc'),
                  children: detail?.description || '—',
                },
                {
                  key: 'created_at',
                  label: t('adminPositions.colCreatedAt'),
                  children: detail ? formatDateTime(detail.created_at, locale) : '—',
                },
                {
                  key: 'updated_at',
                  label: t('adminPositions.colUpdatedAt'),
                  children: detail ? formatDateTime(detail.updated_at, locale) : '—',
                },
              ]}
            />
          </Spin>
        )}
      </Modal>
    </div>
  )
}
