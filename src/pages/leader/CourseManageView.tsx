/**
 * 领导端：课程管理（分页查询 + 新增 + 查看详情 + 编辑 + 删除）。
 * 接口：
 * - GET    /api/courses?page&page_size&keyword&course_type  分页查询（权限 course.select）
 * - POST   /api/courses                                     创建（权限 course.create）
 * - GET    /api/courses/{id}                                详情（权限 course.select）
 * - PATCH  /api/courses/{id}                                更新（权限 course.update）
 * - DELETE /api/courses/{id}                                删除（权限 course.delete）
 * 列表查询走会话缓存，手动刷新与增删改后使用 force 强制刷新（代码要求 5、13）。
 * 交互：工具栏可按课程类型筛选；点击表格任意一行或「详情」按钮查看课程详情，
 * 详情弹窗内可切换到编辑模式，编辑保存后弹窗回到详情态并刷新列表（代码要求 13）。
 * 表单弹窗为可复用组件 CourseFormModal（新增/编辑/详情三模式共用）。
 */
import { DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Input, Popconfirm, Select, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteCourse, queryCourses } from '../../api/courses'
import type { CourseInfo, CourseType } from '../../api/types/courses'
import { extractError } from '../../api/common'
import CourseFormModal, { type CourseFormMode } from '../../components/CourseFormModal'
import { COURSE_PAGE_SIZE, COURSE_TYPE_COLOR, COURSE_TYPE_OPTIONS } from '../../config/course'
import { useT } from '../../i18n'

/** 课程类型筛选值：'all' 表示不限类型 */
type TypeFilter = CourseType | 'all'

/** 弹窗状态：关闭 / 新增 / 编辑 / 查看详情（后两者携带课程 ID） */
interface ModalState {
  mode: CourseFormMode
  courseId?: number
}

export default function CourseManageView() {
  const t = useT()
  const { message } = AntdApp.useApp()

  const [rows, setRows] = useState<CourseInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  // 列表重载令牌：seq 变化触发重新加载，force=true 时绕过会话缓存（手动刷新）
  const [reload, setReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  const [modal, setModal] = useState<ModalState | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  /** 统一错误提示：网络错误走文案，其余回显后端状态码/信息（代码要求 9） */
  const showError = useCallback(
    (err: unknown) => {
      const code = extractError(err)
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await queryCourses(
        {
          page,
          page_size: COURSE_PAGE_SIZE,
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
          ...(typeFilter === 'all' ? {} : { course_type: typeFilter }),
        },
        reload.force,
      )
      setRows(res.data)
      setTotal(res.total)
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractError(err))
      }
    } finally {
      setLoading(false)
    }
  }, [page, keyword, typeFilter, reload.seq, reload.force])

  useEffect(() => {
    void load()
  }, [load])

  /** 删除课程：成功后失效课程缓存并强制刷新列表（代码要求 13） */
  const doDelete = useCallback(
    async (id: number) => {
      setDeletingId(id)
      try {
        await deleteCourse(id)
        message.success(t('course.deleteSuccess'))
        setReload((r) => ({ seq: r.seq + 1, force: false }))
      } catch (err) {
        showError(err)
      } finally {
        setDeletingId(null)
      }
    },
    [message, t, showError],
  )

  const columns = useMemo<ColumnsType<CourseInfo>>(
    () => [
      {
        title: t('course.colCode'),
        dataIndex: 'course_code',
        key: 'course_code',
        width: 140,
        render: (code: string | null) => code || <span className="cell-sub">—</span>,
      },
      {
        title: t('course.colName'),
        dataIndex: 'course_name',
        key: 'course_name',
      },
      {
        title: t('course.colType'),
        dataIndex: 'course_type',
        key: 'course_type',
        width: 110,
        render: (type: CourseType) => (
          <Tooltip title={t(`course.type_${type}`)}>
            <Tag color={COURSE_TYPE_COLOR[type]}>{t(`course.type_${type}`)}</Tag>
          </Tooltip>
        ),
      },
      {
        title: t('course.colCredit'),
        dataIndex: 'credit',
        key: 'credit',
        width: 100,
      },
      {
        title: t('course.colActions'),
        key: 'action',
        width: 190,
        render: (_, record) => (
          <div className="approval-actions">
            <Tooltip title={t('course.view')}>
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setModal({ mode: 'view', courseId: record.id })}
              >
                {t('course.view')}
              </Button>
            </Tooltip>
            <Popconfirm
              title={t('course.deleteConfirm')}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true, loading: deletingId === record.id }}
              onConfirm={() => void doDelete(record.id)}
            >
              <Tooltip title={t('course.delete')}>
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingId === record.id}
                >
                  {t('course.delete')}
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
        ),
      },
    ],
    [t, deletingId, doDelete],
  )

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('course.title')}</h3>
          <div className="approval-toolbar">
            <Input.Search
              allowClear
              className="admin-search"
              placeholder={t('course.searchPlaceholder')}
              onSearch={(v: string) => {
                setPage(1)
                setKeyword(v)
              }}
            />
            <Select
              value={typeFilter}
              style={{ width: 140 }}
              options={[
                { value: 'all', label: t('course.filterAll') },
                ...COURSE_TYPE_OPTIONS.map((type) => ({
                  value: type,
                  label: t(`course.type_${type}`),
                })),
              ]}
              onChange={(v: TypeFilter) => {
                setPage(1)
                setTypeFilter(v)
              }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
            >
              {t('common.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModal({ mode: 'create' })}
            >
              {t('course.createTitle')}
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
                <Button
                  size="small"
                  onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
                >
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <Table<CourseInfo>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={rows}
              locale={{ emptyText: t('common.noData') }}
              onRow={(record: CourseInfo) => ({
                onClick: (e: React.MouseEvent) => {
                  // 点击按钮/气泡确认框时不触发行点击
                  const target = e.target as HTMLElement
                  if (target.closest('button') || target.closest('.ant-popover')) return
                  setModal({ mode: 'view', courseId: record.id })
                },
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize: COURSE_PAGE_SIZE,
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

      <CourseFormModal
        open={modal !== null}
        mode={modal?.mode ?? 'create'}
        courseId={modal?.courseId}
        onCancel={() => setModal(null)}
        onEdit={() =>
          setModal((m) =>
            m && m.courseId !== undefined ? { mode: 'edit', courseId: m.courseId } : m,
          )
        }
        onSaved={() => {
          // 由详情进入编辑并保存后，停留在弹窗内回显最新详情；新增则关闭
          setModal((m) =>
            m && m.mode === 'edit' && m.courseId !== undefined
              ? { mode: 'view', courseId: m.courseId }
              : null,
          )
          setReload((r) => ({ seq: r.seq + 1, force: false }))
        }}
      />
    </div>
  )
}