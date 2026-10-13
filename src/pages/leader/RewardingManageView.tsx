/**
 * 领导端：奖学金及补助管理（分页查询 + 新增 + 查看详情 + 编辑 + 删除）。
 * 接口：
 * - GET    /api/rewardings  分页查询（权限 rewarding.read，支持 uid/project/keyword/金额区间/时间区间筛选）
 * - POST   /api/rewardings  创建（权限 rewarding.create）
 * - GET    /api/rewardings/{id}  详情（权限 rewarding.read）
 * - PATCH  /api/rewardings/{id}  更新（权限 rewarding.update）
 * - DELETE /api/rewardings/{id}  删除（权限 rewarding.delete）
 * 列表查询走会话缓存，手动刷新与增删改后使用 force 强制刷新（代码要求 5、13）。
 * 交互：工具栏支持关键词搜索、学号精确筛选、金额区间与创建时间区间筛选；
 * 点击表格任意一行或「详情」按钮查看详情，详情弹窗内可切换到编辑模式，
 * 编辑保存后弹窗回到详情态并刷新列表（代码要求 13、14）。
 * 表单弹窗为可复用组件 RewardingFormModal（新增/编辑/详情三模式共用）。
 */
import { DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  DatePicker,
  Input,
  InputNumber,
  Popconfirm,
  Table,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteRewarding, queryRewardings } from '../../api/rewardings'
import type { RewardingDto } from '../../api/types/rewardings'
import { extractError } from '../../api/common'
import RewardingFormModal, {
  type RewardingFormMode,
} from '../../components/RewardingFormModal'
import {
  REWARDING_AMOUNT_MAX_YUAN,
  REWARDING_AMOUNT_MIN_YUAN,
  REWARDING_AMOUNT_STEP_YUAN,
  REWARDING_PAGE_SIZE,
  REWARDING_UID_MIN,
} from '../../config/rewarding'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'
import { formatCentsAsYuan } from '../../utils/money'
import { useUserNames } from '../../composables/useUserNames'

const { RangePicker } = DatePicker

/** 弹窗状态：关闭 / 新增 / 编辑 / 查看详情（后两者携带记录 ID） */
interface ModalState {
  mode: RewardingFormMode
  rewardingId?: number
}

export default function RewardingManageView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()

  const [rows, setRows] = useState<RewardingDto[]>([])
  const pageUid = useMemo(() => rows.map((r) => r.uid), [rows])
  const userNames = useUserNames(pageUid)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [uidFilter, setUidFilter] = useState<number | null>(null)
  const [amountMin, setAmountMin] = useState<number | null>(null)
  const [amountMax, setAmountMax] = useState<number | null>(null)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  // 已应用的筛选条件（点击「搜索」后才提交，避免输入过程中频繁触发请求）
  const [applied, setApplied] = useState<{
    uid: number | null
    amountMin: number | null
    amountMax: number | null
    dateRange: [Dayjs, Dayjs] | null
  }>({ uid: null, amountMin: null, amountMax: null, dateRange: null })
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
      const res = await queryRewardings(
        {
          page,
          page_size: REWARDING_PAGE_SIZE,
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
          ...(applied.uid !== null ? { uid: applied.uid } : {}),
          ...(applied.amountMin !== null ? { amount_min: Math.round(applied.amountMin * 100) } : {}),
          ...(applied.amountMax !== null ? { amount_max: Math.round(applied.amountMax * 100) } : {}),
          ...(applied.dateRange
            ? {
                from_at: applied.dateRange[0].startOf('day').toISOString(),
                to_at: applied.dateRange[1].endOf('day').toISOString(),
              }
            : {}),
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
  }, [page, keyword, applied, reload.seq, reload.force])

  useEffect(() => {
    void load()
  }, [load])

  /** 点击「搜索」：把当前筛选输入提交为已应用条件并回到第一页 */
  const applyFilters = useCallback(() => {
    setApplied({
      uid: uidFilter,
      amountMin,
      amountMax,
      dateRange,
    })
    setPage(1)
  }, [uidFilter, amountMin, amountMax, dateRange])

  /** 删除记录：成功后失效列表缓存并强制刷新列表（代码要求 13） */
  const doDelete = useCallback(
    async (id: number) => {
      setDeletingId(id)
      try {
        await deleteRewarding(id)
        message.success(t('rewarding.deleteSuccess'))
        setReload((r) => ({ seq: r.seq + 1, force: false }))
      } catch (err) {
        showError(err)
      } finally {
        setDeletingId(null)
      }
    },
    [message, t, showError],
  )

  const columns = useMemo<ColumnsType<RewardingDto>>(
    () => [
      {
        title: t('common.id'),
        dataIndex: 'id',
        key: 'id',
        width: 90,
      },
      {
        title: t('rewarding.colUid'),
        dataIndex: 'uid',
        key: 'uid',
        width: 130,
      },
      {
        title: t('rewarding.colName'),
        key: 'name',
        width: 120,
        render: (_,record) => {
          const name = userNames.get(record.uid)
          if (name === undefined) return <span className="cell-sub">...</span>
          return name ?? <span className="cell-sub">-</span>
        }
      },
      {
        title: t('rewarding.colProject'),
        dataIndex: 'project',
        key: 'project',
        render: (project: string) => project || <span className="cell-sub">—</span>,
      },
      {
        title: t('rewarding.colAmount'),
        dataIndex: 'amount_cents',
        key: 'amount_cents',
        width: 150,
        align: 'right',
        render: (cents: number) => formatCentsAsYuan(cents, locale),
      },
      {
        title: t('rewarding.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 190,
        render: (value: string) => formatDateTime(value, locale),
      },
      {
        title: t('rewarding.colActions'),
        key: 'action',
        width: 190,
        render: (_, record) => (
          <div className="approval-actions">
            <Tooltip title={t('rewarding.view')}>
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setModal({ mode: 'view', rewardingId: record.id })}
              >
                {t('rewarding.view')}
              </Button>
            </Tooltip>
            <Tooltip title={t('rewarding.edit')}>
              <Button
                type="link"
                size="small"
                onClick={() => setModal({ mode: 'edit', rewardingId: record.id })}
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
              <Tooltip title={t('rewarding.delete')}>
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
      },
    ],
    [t, locale, deletingId, doDelete, userNames],
  )

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('rewarding.title')}</h3>
          <div className="approval-toolbar">
            <Input.Search
              allowClear
              className="admin-search"
              placeholder={t('rewarding.searchPlaceholder')}
              onSearch={(v: string) => {
                setPage(1)
                setKeyword(v)
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
              {t('rewarding.createTitle')}
            </Button>
          </div>
        </header>
        <div className="panel-card-body">
          <div
            className="approval-toolbar"
            style={{ flexWrap: 'wrap', rowGap: 10, marginBottom: 16 }}
          >
            <Tooltip title={t('rewarding.filterUidHint')}>
              <InputNumber
                style={{ width: 150 }}
                precision={0}
                min={REWARDING_UID_MIN}
                value={uidFilter}
                placeholder={t('rewarding.filterUidPlaceholder')}
                onChange={(v: number | null) => setUidFilter(v)}
              />
            </Tooltip>
            <Tooltip title={t('rewarding.filterAmountMinHint')}>
              <InputNumber
                style={{ width: 140 }}
                prefix="¥"
                step={REWARDING_AMOUNT_STEP_YUAN}
                precision={2}
                min={REWARDING_AMOUNT_MIN_YUAN}
                max={REWARDING_AMOUNT_MAX_YUAN}
                value={amountMin}
                placeholder={t('rewarding.filterAmountMin')}
                onChange={(v: number | null) => setAmountMin(v)}
              />
            </Tooltip>
            <Tooltip title={t('rewarding.filterAmountMaxHint')}>
              <InputNumber
                style={{ width: 140 }}
                prefix="¥"
                step={REWARDING_AMOUNT_STEP_YUAN}
                precision={2}
                min={REWARDING_AMOUNT_MIN_YUAN}
                max={REWARDING_AMOUNT_MAX_YUAN}
                value={amountMax}
                placeholder={t('rewarding.filterAmountMax')}
                onChange={(v: number | null) => setAmountMax(v)}
              />
            </Tooltip>
            <Tooltip title={t('rewarding.filterDateHint')}>
              <RangePicker
                style={{ width: 260 }}
                value={dateRange}
                onChange={(dates) =>
                  setDateRange(
                    dates && dates[0] && dates[1] ? [dates[0], dates[1]] : null,
                  )
                }
              />
            </Tooltip>
            <Tooltip title={t('rewarding.searchHint')}>
              <Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>
                {t('rewarding.search')}
              </Button>
            </Tooltip>
          </div>

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
            <Table<RewardingDto>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={rows}
              locale={{ emptyText: t('common.noData') }}
              onRow={(record: RewardingDto) => ({
                onClick: (e: React.MouseEvent) => {
                  // 点击按钮/气泡确认框时不触发行点击
                  const target = e.target as HTMLElement
                  if (target.closest('button') || target.closest('.ant-popover')) return
                  setModal({ mode: 'view', rewardingId: record.id })
                },
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize: REWARDING_PAGE_SIZE,
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

      <RewardingFormModal
        open={modal !== null}
        mode={modal?.mode ?? 'create'}
        rewardingId={modal?.rewardingId}
        onCancel={() => setModal(null)}
        onEdit={() =>
          setModal((m) =>
            m && m.rewardingId !== undefined
              ? { mode: 'edit', rewardingId: m.rewardingId }
              : m,
          )
        }
        onSaved={() => {
          // 由详情进入编辑并保存后，停留在弹窗内回显最新详情；新增则关闭
          setModal((m) =>
            m && m.mode === 'edit' && m.rewardingId !== undefined
              ? { mode: 'view', rewardingId: m.rewardingId }
              : null,
          )
          setReload((r) => ({ seq: r.seq + 1, force: false }))
        }}
      />
    </div>
  )
}
