import { getPortalPath } from '../../config/routes'
import { usePortalParams } from '../../hooks/usePortalParams'
import { isEntryActionTarget } from '../../utils/entryInteraction'
/**
 * 领导端：审批指标（审批模板）管理（查询 + 新增 + 查看详情 + 编辑 + 删除 + 审批步骤增删改）。
 * 接口：
 * - GET    /api/approvals/templates   分页查询（权限 approval.read）
 * - POST   /api/approvals/templates   创建（权限 approval.create）
 * - GET    /api/approvals/templates/{id}   详情（权限 approval.read）
 * - PATCH  /api/approvals/templates/{id}   更新（权限 approval.update）
 * - DELETE /api/approvals/templates/{id}   删除（权限 approval.delete）
 * 步骤相关接口在详情页内使用（见 ApprovalTemplateDetailPage 与 ApprovalTemplateStepModal）。
 *
 * 说明：后端 business_type 筛选仅支持单值，无法承载代码要求 18 的「类型多选」，
 * 因此本页一次性取回（page_size = APPROVAL_TEMPLATE_FETCH_SIZE）后在前端完成多选筛选与分页；
 * 列表查询走会话缓存，手动刷新与增删改后使用 force 强制刷新（代码要求 5、13）。
 * 交互：工具栏保留名称搜索、导出、刷新/新增；启用状态筛选与更新时间排序放在表头，
 * 操作列提供启用/停用按钮；双击表格任意一行或「详情」按钮进入独立详情页
 * （<门户路径>/approval-templates/:id?from=<moduleKey>），不再弹窗；新增仍使用弹窗。
 * 搜索/筛选/排序/页码保存在 sessionStorage，从详情页返回后仍保持原列表视图。
 */
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { App as AntdApp, Button, Input, Popconfirm, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  deleteApprovalTemplate,
  listAllApprovalTemplates,
  queryApprovalTemplates,
  updateApprovalTemplate,
} from '../../api/approvalmodel'
import type { ApprovalTemplate } from '../../api/types/approvalmodel'
import { extractErrorReason } from '../../api/common'
import ApprovalTemplateFormModal from '../../components/ApprovalTemplateFormModal'
import ErrorState from '../../components/ErrorState'
import OrganizationName from '../../components/OrganizationName'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import {
  APPROVAL_TEMPLATE_FETCH_SIZE,
  APPROVAL_TEMPLATE_PAGE_SIZE,
} from '../../config/approvalTemplate'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { exportApprovalTemplatesXlsx } from '../../utils/approvalTemplateExport'
import { formatDateTime } from '../../utils/datetime'

/** 表头启用状态筛选值：'on' 启用 / 'off' 停用（可多选） */
type EnabledFilterValue = 'on' | 'off'

/** 表头排序方向：'ascend' 正序 / 'descend' 逆序 / null 不排序 */
type UpdatedAtSortOrder = 'ascend' | 'descend' | null

/** 列表筛选状态：会话内保存，从详情页返回或刷新后恢复 */
interface ListFilterState {
  keyword: string
  enabledFilter: EnabledFilterValue[] | null
  sortOrder: UpdatedAtSortOrder
  page: number
}

/** sessionStorage 中列表筛选状态的键前缀（按门户 + 模块区分） */
const LIST_FILTER_STATE_PREFIX = 'approval-templates:filter-state:'

/** ApprovalTemplateManageView 组件。
 * @returns 类型：Element
 */
export default function ApprovalTemplateManageView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey, moduleKey } = usePortalParams<{
    portalKey?: string
    moduleKey?: string
  }>()

  /** 上次保存的筛选状态：用于初始化列表，保证搜索后进入详情再返回仍是搜索结果 */
  const [initialFilterState] = useState<ListFilterState | null>(() => {
    try {
      const raw = sessionStorage.getItem(
        `${LIST_FILTER_STATE_PREFIX}${portalKey ?? ''}:${moduleKey ?? ''}`,
      )
      return raw ? (JSON.parse(raw) as ListFilterState) : null
    } catch {
      return null
    }
  })

  const [allRows, setAllRows] = useState<ApprovalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(initialFilterState?.page ?? 1)
  const [keyword, setKeyword] = useState(initialFilterState?.keyword ?? '')
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilterValue[] | null>(
    initialFilterState?.enabledFilter ?? null,
  )
  const [sortOrder, setSortOrder] = useState<UpdatedAtSortOrder>(
    initialFilterState?.sortOrder ?? null,
  )
  /** 正在切换启用状态的行 ID（避免重复点击，按钮显示 loading） */
  const [togglingId, setTogglingId] = useState<number | null>(null)
  /** 导出进行中（导出需要拉取全量数据与逐条详情，按钮显示 loading） */
  const [exporting, setExporting] = useState(false)
  // 列表重载令牌：seq 变化触发重新加载，force=true 时绕过会话缓存（手动刷新）
  const [reload, setReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  /** 新增指标弹窗：查看详情已改为独立页面，弹窗仅保留新增场景 */
  const [createOpen, setCreateOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  /** 统一错误提示：带 HTTP 状态码与中文原因（代码要求 9） */
  const reportError = useErrorFeedback()

  /** 打开指标详情页：携带来源模块，返回时回到本列表并保持侧栏高亮 */
  const openDetail = useCallback(
    (templateId: number) => {
      if (!portalKey) return
      navigate(
        `${getPortalPath(portalKey)}/approval-templates/${templateId}?from=${moduleKey ?? 'academy_m2'}`,
      )
    },
    [portalKey, moduleKey, navigate],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await queryApprovalTemplates(
        { page: 1, page_size: APPROVAL_TEMPLATE_FETCH_SIZE },
        reload.force,
      )
      setAllRows(res.data)
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
  }, [reload.seq, reload.force, t]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

  /** 保存筛选状态：从详情页返回或刷新后恢复搜索/筛选/排序/页码 */
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${LIST_FILTER_STATE_PREFIX}${portalKey ?? ''}:${moduleKey ?? ''}`,
        JSON.stringify({ keyword, enabledFilter, sortOrder, page }),
      )
    } catch {
      // sessionStorage 不可用时忽略，列表仍可正常使用
    }
  }, [portalKey, moduleKey, keyword, enabledFilter, sortOrder, page])

  /** 按关键词 + 表头启用状态筛选（列表展示与导出共用） */
  const applyFilters = useCallback(
    (source: ApprovalTemplate[]) => {
      const kw = keyword.trim().toLowerCase()
      return source.filter((row) => {
        if (kw && !row.name.toLowerCase().includes(kw)) return false
        if (enabledFilter?.length) {
          const enabled = Boolean(row.enabled)
          if (enabledFilter.includes('on') && !enabled) return false
          if (enabledFilter.includes('off') && enabled) return false
        }
        return true
      })
    },
    [keyword, enabledFilter],
  )

  const filtered = useMemo(() => applyFilters(allRows), [applyFilters, allRows])

  /** 按更新时间正序/逆序（表头排序，作用于全部筛选结果而非当前页） */
  const applySort = useCallback(
    (source: ApprovalTemplate[]) => {
      if (!sortOrder) return source
      const direction = sortOrder === 'ascend' ? 1 : -1
      return [...source].sort(
        (a, b) => (Date.parse(a.updated_at) - Date.parse(b.updated_at)) * direction,
      )
    },
    [sortOrder],
  )

  const sorted = useMemo(() => applySort(filtered), [applySort, filtered])

  /** 前端分页切片（代码要求 12：每页最多 20 行） */
  const totalPages = Math.max(1, Math.ceil(sorted.length / APPROVAL_TEMPLATE_PAGE_SIZE))
  const paged = useMemo(
    () =>
      sorted.slice(
        (page - 1) * APPROVAL_TEMPLATE_PAGE_SIZE,
        page * APPROVAL_TEMPLATE_PAGE_SIZE,
      ),
    [sorted, page],
  )

  /** 删除模板：成功后失效模板缓存并重新加载列表（代码要求 13） */
  const doDelete = useCallback(
    async (id: number) => {
      setDeletingId(id)
      try {
        await deleteApprovalTemplate(id)
        message.success(t('approvalTemplate.deleteSuccess'))
        setReload((r) => ({ seq: r.seq + 1, force: false }))
      } catch (err) {
        reportError(err)
      } finally {
        setDeletingId(null)
      }
    },
    [message, t, reportError],
  )

  /** 启用/停用指标：PATCH 后重新加载列表（写操作已失效列表缓存） */
  const doToggleEnabled = useCallback(
    async (record: ApprovalTemplate) => {
      setTogglingId(record.id)
      try {
        await updateApprovalTemplate(record.id, { enabled: !record.enabled })
        message.success(
          t(record.enabled ? 'approvalTemplate.disableSuccess' : 'approvalTemplate.enableSuccess'),
        )
        setReload((r) => ({ seq: r.seq + 1, force: false }))
      } catch (err) {
        reportError(err)
      } finally {
        setTogglingId(null)
      }
    },
    [message, t, reportError],
  )

  /**
   * 导出当前筛选条件下的全部指标（含审批步骤）。
   * 后端无按 ID 批量查询与批量详情接口：列表按页取全，步骤逐条拉取（由导出工具限并发）。
   */
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const all = await listAllApprovalTemplates(true)
      const rows = applySort(applyFilters(all))
      if (rows.length === 0) {
        message.warning(t('approvalTemplate.exportEmpty'))
        return
      }
      await exportApprovalTemplatesXlsx(rows, {
        locale,
        t,
        fileName: `${t('approvalTemplate.exportFileName')}.xlsx`,
      })
      message.success(t('approvalTemplate.exportSuccess', { count: rows.length }))
    } catch (err) {
      reportError(err)
    } finally {
      setExporting(false)
    }
  }, [applyFilters, applySort, locale, t, message, reportError])

  const columns = useMemo<ColumnsType<ApprovalTemplate>>(
    () => [
      {
        title: t('approvalTemplate.colName'),
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: t('approvalTemplate.fieldOrganization'),
        dataIndex: 'organization_id',
        key: 'organization_id',
        render: (id: number) => <OrganizationName id={id} showTree />,
      },
      {
        title: t('approvalTemplate.colEnabled'),
        dataIndex: 'enabled',
        key: 'enabled',
        width: 100,
        /** 表头筛选启用/停用（可多选；配合前端过滤，作用于全部数据） */
        filters: [
          { text: t('approvalTemplate.enabled_yes'), value: 'on' },
          { text: t('approvalTemplate.enabled_no'), value: 'off' },
        ],
        filteredValue: enabledFilter,
        // 后端 enabled 为 i8（1/0），按真值渲染
        render: (enabled: number) => (
          <Tag color={enabled ? 'green' : 'default'}>
            {enabled
              ? t('approvalTemplate.enabled_yes')
              : t('approvalTemplate.enabled_no')}
          </Tag>
        ),
      },
      {
        title: t('approvalTemplate.colUpdatedAt'),
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 170,
        // 表头排序作用于全部筛选结果（在 sorted 中实现，而非仅当前页）
        sorter: true,
        sortOrder,
        sortDirections: ['descend', 'ascend'],
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('approvalTemplate.colActions'),
        key: 'action',
        width: 260,
        render: (_, record) => (
          <div className="approval-actions">
            <Tooltip title={t('approvalTemplate.view')}>
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => openDetail(record.id)}
              >
                {t('approvalTemplate.view')}
              </Button>
            </Tooltip>
            <Tooltip
              title={
                record.enabled
                  ? t('approvalTemplate.disableHint')
                  : t('approvalTemplate.enableHint')
              }
            >
              <Button
                type="link"
                size="small"
                danger={Boolean(record.enabled)}
                icon={record.enabled ? <StopOutlined /> : <CheckCircleOutlined />}
                loading={togglingId === record.id}
                onClick={() => void doToggleEnabled(record)}
              >
                {record.enabled
                  ? t('approvalTemplate.disableAction')
                  : t('approvalTemplate.enableAction')}
              </Button>
            </Tooltip>
            <Popconfirm
              title={t('approvalTemplate.deleteConfirm')}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true, loading: deletingId === record.id }}
              onConfirm={() => void doDelete(record.id)}
            >
              <Tooltip title={t('approvalTemplate.delete')}>
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingId === record.id}
                >
                  {t('approvalTemplate.delete')}
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
        ),
      },
    ],
    [
      t,
      locale,
      enabledFilter,
      sortOrder,
      togglingId,
      deletingId,
      doDelete,
      doToggleEnabled,
      openDetail,
    ],
  )

  return (
    <div className="data-page-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('approvalTemplate.title')}</h3>
          <div className="approval-toolbar">
            <Input.Search
              allowClear
              className="admin-search"
              placeholder={t('approvalTemplate.searchPlaceholder')}
              defaultValue={keyword}
              onSearch={(v: string) => {
                setPage(1)
                setKeyword(v)
              }}
            />
            <Tooltip title={t('approvalTemplate.exportHint')}>
              <Button
                icon={<DownloadOutlined />}
                loading={exporting}
                onClick={() => void handleExport()}
              >
                {t('approvalTemplate.exportButton')}
              </Button>
            </Tooltip>
            <Tooltip title={t('approvalTemplate.refreshHint')}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
              >
                {t('common.refresh')}
              </Button>
            </Tooltip>
            <Tooltip title={t('approvalTemplate.newHint')}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateOpen(true)}
              >
                {t('approvalTemplate.createTitle')}
              </Button>
            </Tooltip>
          </div>
        </header>
        <div className="panel-card-body">
          {error ? (
            <ErrorState
              message={error}
              onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
            />
          ) : (
            <Table<ApprovalTemplate>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={paged}
              locale={{ emptyText: t('common.noData') }}
              /** 已停用的指标整行灰显，便于与启用项快速区分 */
              rowClassName={(record: ApprovalTemplate) =>
                record.enabled ? '' : 'approval-row-disabled'
              }
              onRow={(record: ApprovalTemplate) => ({
                onDoubleClick: (e: React.MouseEvent) => {
                  if (isEntryActionTarget(e.target)) return
                  // 点击按钮/气泡确认框时不触发行点击
                  const target = e.target as HTMLElement
                  if (target.closest('button') || target.closest('.ant-popover')) return
                  openDetail(record.id)
                },
                title: t('approvalTemplate.rowClickHint'),
                style: { cursor: 'pointer' },
              })}
              /** 表头筛选/排序变化：回到第一页，并同步受控状态 */
              onChange={(_, filters, sorter, extra) => {
                if (extra.action === 'filter') {
                  setPage(1)
                  const values = filters.enabled as EnabledFilterValue[] | null | undefined
                  setEnabledFilter(values?.length ? values : null)
                } else if (extra.action === 'sort') {
                  setPage(1)
                  const order = Array.isArray(sorter) ? sorter[0]?.order : sorter.order
                  setSortOrder(order ?? null)
                }
              }}
              pagination={{
                current: page,
                pageSize: APPROVAL_TEMPLATE_PAGE_SIZE,
                total: sorted.length,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) =>
                  `${t('common.total')} ${n} ${t('common.items')} · ${t('common.totalPages', {
                    n: totalPages,
                  })}`,
                onChange: (p: number) => setPage(p),
              }}
            />
          )}
        </div>
      </section>

      <ApprovalTemplateFormModal
        open={createOpen}
        mode="create"
        onCancel={() => setCreateOpen(false)}
        onSaved={(createdId) => {
          setCreateOpen(false)
          if (createdId !== undefined) {
            const query = new URLSearchParams({ action: 'add-step' })
            if (moduleKey) query.set('from', moduleKey)
            navigate(`${getPortalPath(portalKey)}/approval-templates/${createdId}?${query}`)
          } else {
            setReload((r) => ({ seq: r.seq + 1, force: false }))
          }
        }}
      />
    </div>
  )
}
