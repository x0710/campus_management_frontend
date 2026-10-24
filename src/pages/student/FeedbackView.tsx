/**
 * 学生端：意见反馈（提交、查看、编辑、删除本人反馈）。
 *
 * 接口：
 * - GET    /api/feedbacks?user_id=本人   分页查询本人反馈（权限 feedback.read）
 * - POST   /api/feedbacks                提交反馈（权限 feedback.create）
 * - PATCH  /api/feedbacks/{id}           更新本人反馈（权限 feedback.update）
 * - DELETE /api/feedbacks/{id}           删除本人反馈（权限 feedback.delete）
 *
 * 交互：按关键词/分类筛选、服务器分页、手动刷新（force 绕过缓存）、
 * 新增/查看/编辑使用同一表单弹窗，删除前二次确认。
 */
import {
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { App as AntdApp, Button, Input, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import {
  deleteFeedback,
  queryFeedbacks,
} from '../../api/feedbacks'
import type {
  FeedbackCategory,
  FeedbackDto,
} from '../../api/types/feedbacks'
import ErrorState from '../../components/ErrorState'
import FeedbackFormModal, {
  type FeedbackFormMode,
} from '../../components/FeedbackFormModal'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import {
  FEEDBACK_CATEGORY_COLOR,
  FEEDBACK_CATEGORY_ORDER,
  FEEDBACK_PAGE_SIZE,
  getFeedbackCategoryLabel,
} from '../../config/feedback'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

interface FeedbackModalState {
  open: boolean
  mode: FeedbackFormMode
  feedbackId?: number
}

export default function FeedbackView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message, modal } = AntdApp.useApp()
  const reportError = useErrorFeedback()

  const [rows, setRows] = useState<FeedbackDto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [category, setCategory] = useState<FeedbackCategory | undefined>()
  const [modalState, setModalState] = useState<FeedbackModalState>({
    open: false,
    mode: 'create',
  })
  // 列表重载令牌：seq 变化触发重新加载；force=true 时绕过会话缓存（手动刷新/写操作后）
  const [reload, setReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  /** 重新加载本人反馈（force=true 绕过会话缓存，代码要求 5） */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 只用登录态 uid 查询，学生无法指定他人
      const me = await getCurrentUser()
      const res = await queryFeedbacks(
        {
          user_id: me.uid,
          page,
          page_size: FEEDBACK_PAGE_SIZE,
          keyword: appliedKeyword.trim() || undefined,
          category,
        },
        reload.force,
      )
      setRows(res.data)
      setTotal(res.total)
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
  }, [page, appliedKeyword, category, reload.seq, reload.force, t])

  useEffect(() => {
    void load()
  }, [load])

  const categoryOptions = useMemo(
    () =>
      FEEDBACK_CATEGORY_ORDER.map((value) => ({
        value,
        label: getFeedbackCategoryLabel(value, t),
      })),
    [t],
  )

  const openModal = (mode: FeedbackFormMode, feedbackId?: number) => {
    setModalState({ open: true, mode, feedbackId })
  }

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, open: false }))
  }

  const handleSaved = () => {
    closeModal()
    setReload((r) => ({ seq: r.seq + 1, force: true }))
  }

  const handleDelete = (row: FeedbackDto) => {
    modal.confirm({
      title: t('feedback.deleteConfirm'),
      content: row.title,
      okText: t('feedback.delete'),
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteFeedback(row.id)
          message.success(t('feedback.deleteSuccess'))
          setReload((r) => ({ seq: r.seq + 1, force: true }))
        } catch (err) {
          reportError(err)
        }
      },
    })
  }

  const columns = useMemo<ColumnsType<FeedbackDto>>(
    () => [
      {
        title: t('common.id'),
        dataIndex: 'id',
        key: 'id',
        width: 72,
      },
      {
        title: t('feedback.fieldCategory'),
        dataIndex: 'category',
        key: 'category',
        width: 120,
        render: (value: FeedbackCategory) => (
          <Tag color={FEEDBACK_CATEGORY_COLOR[value]}>
            {getFeedbackCategoryLabel(value, t)}
          </Tag>
        ),
      },
      {
        title: t('feedback.fieldTitle'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
      },
      {
        title: t('feedback.fieldContent'),
        dataIndex: 'content',
        key: 'content',
        ellipsis: true,
      },
      {
        title: t('feedback.fieldContact'),
        dataIndex: 'contact',
        key: 'contact',
        width: 170,
        render: (value: string | null) => value || '—',
      },
      {
        title: t('feedback.createdAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 170,
        render: (value: string) => formatDateTime(value, locale),
      },
      {
        title: t('feedback.colActions'),
        key: 'actions',
        width: 168,
        fixed: 'right',
        render: (_, row) => (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => openModal('view', row.id)}>
              {t('feedback.view')}
            </Button>
            <Button type="link" size="small" onClick={() => openModal('edit', row.id)}>
              {t('feedback.edit')}
            </Button>
            <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
              {t('feedback.delete')}
            </Button>
          </Space>
        ),
      },
    ],
    [t, locale], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div className="data-page-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('feedback.title')}</h3>
          <div className="student-toolbar">
            <Input.Search
              allowClear
              className="admin-search"
              style={{ width: 240 }}
              placeholder={t('feedback.searchPlaceholder')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={() => {
                setPage(1)
                setAppliedKeyword(keyword.trim())
              }}
            />
            <Tooltip title={t('feedback.filterCategoryHint')}>
              <Select
                allowClear
                size="middle"
                style={{ width: 180 }}
                value={category}
                placeholder={t('feedback.filterCategoryPlaceholder')}
                options={categoryOptions}
                onChange={(value: FeedbackCategory | undefined) => {
                  setPage(1)
                  setCategory(value)
                }}
              />
            </Tooltip>
            <Tooltip title={t('feedback.refreshHint')}>
              <Button
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
              >
                {t('common.refresh')}
              </Button>
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openModal('create')}
            >
              {t('feedback.createTitle')}
            </Button>
          </div>
        </header>
        <div className="panel-card-body">
          {error ? (
            <ErrorState
              message={error}
              onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
            />
          ) : (
            <Table<FeedbackDto>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={rows}
              locale={{ emptyText: t('common.noData') }}
              scroll={{ x: 920 }}
              pagination={{
                current: page,
                pageSize: FEEDBACK_PAGE_SIZE,
                total,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) =>
                  `${t('common.total')} ${n} ${t('common.items')}`,
                onChange: (p: number) => setPage(p),
              }}
            />
          )}
        </div>
      </section>

      <FeedbackFormModal
        open={modalState.open}
        mode={modalState.mode}
        feedbackId={modalState.feedbackId}
        onCancel={closeModal}
        onSaved={handleSaved}
        onEdit={modalState.feedbackId === undefined ? undefined : () => openModal('edit', modalState.feedbackId)}
      />
    </div>
  )
}
