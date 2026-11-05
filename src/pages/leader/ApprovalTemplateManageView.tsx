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
 * 交互：工具栏可按名称、启用状态筛选；双击表格任意一行或「详情」按钮进入独立详情页
 * （/portal/:portalKey/approval-templates/:id?from=<moduleKey>），不再弹窗；新增仍使用弹窗。
 */
import { DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Input, Popconfirm, Select, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { deleteApprovalTemplate, queryApprovalTemplates } from '../../api/approvalmodel'
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
import { formatDateTime } from '../../utils/datetime'

/** 启用状态筛选值：'all' 表示不限状态 */
type EnabledFilter = 'all' | 'on' | 'off'

export default function ApprovalTemplateManageView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey, moduleKey } = useParams<{
    portalKey?: string
    moduleKey?: string
  }>()

  const [allRows, setAllRows] = useState<ApprovalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>('all')
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
        `/portal/${portalKey}/approval-templates/${templateId}?from=${moduleKey ?? 'academy_m2'}`,
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

  /** 前端筛选：关键词 + 启用状态（代码要求 18） */
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return allRows.filter((row) => {
      if (
        kw &&
        !row.name.toLowerCase().includes(kw)
      ) {
        return false
      }
      const enabled = row.enabled
      if (enabledFilter === 'on' && !enabled) return false
      if (enabledFilter === 'off' && enabled) return false
      return true
    })
  }, [allRows, keyword, enabledFilter])

  /** 前端分页切片（代码要求 12：每页最多 20 行） */
  const totalPages = Math.max(1, Math.ceil(filtered.length / APPROVAL_TEMPLATE_PAGE_SIZE))
  const paged = useMemo(
    () =>
      filtered.slice(
        (page - 1) * APPROVAL_TEMPLATE_PAGE_SIZE,
        page * APPROVAL_TEMPLATE_PAGE_SIZE,
      ),
    [filtered, page],
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
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('approvalTemplate.colActions'),
        key: 'action',
        width: 190,
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
    [t, locale, deletingId, doDelete, openDetail],
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
              onSearch={(v: string) => {
                setPage(1)
                setKeyword(v)
              }}
            />
            <Select<EnabledFilter>
              value={enabledFilter}
              style={{ width: 140 }}
              options={[
                { value: 'all', label: t('approvalTemplate.filterEnabledAll') },
                { value: 'on', label: t('approvalTemplate.filterEnabledOn') },
                { value: 'off', label: t('approvalTemplate.filterEnabledOff') },
              ]}
              onChange={(v: EnabledFilter) => {
                setPage(1)
                setEnabledFilter(v)
              }}
            />
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
              pagination={{
                current: page,
                pageSize: APPROVAL_TEMPLATE_PAGE_SIZE,
                total: filtered.length,
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
        onSaved={() => {
          setCreateOpen(false)
          setReload((r) => ({ seq: r.seq + 1, force: false }))
        }}
      />
    </div>
  )
}
