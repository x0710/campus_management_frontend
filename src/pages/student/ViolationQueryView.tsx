/**
 * 学生端：违规记录查询（仅本人违规记录）。
 *
 * 接口：
 * - GET /api/violations?user_id=本人   分页查询（权限 violation.read，后端按数据权限限制范围）
 * - GET /api/violations/{id}           单条违规详情
 * 数据源头：当前登录用户 uid（GET /api/credentials/me，会话缓存）→ 违规列表（会话缓存）。
 * 说明：本页不提供任何用户 ID 输入，只用登录态 uid 查询，因此学生只能看到本人记录；
 * 后端 severity / category 筛选仅支持单值，无法承载代码要求 18 的「类型多选」，
 * 因此一次性取回（page_size = VIOLATION_FETCH_SIZE）后在前端完成多选筛选与分页。
 *
 * 交互：关键词搜索、严重程度多选、类别多选、手动刷新（force 绕过缓存）、
 * 表格每页 20 行（支持上下页 + 输入页码跳转 + 显示总页数），点击任意一行查看该条违规详情（代码要求 14）。
 */
import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Input, Modal, Select, Spin, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { getViolation, queryViolations } from '../../api/violations'
import type { ViolationDto, ViolationSeverity } from '../../api/types/violations'
import {
  VIOLATION_FETCH_SIZE,
  VIOLATION_PAGE_SIZE,
  VIOLATION_SEVERITY_COLOR,
  VIOLATION_SEVERITY_ORDER,
  getViolationSeverityLabel,
} from '../../config/violation'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

export default function ViolationQueryView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  const [rows, setRows] = useState<ViolationDto[]>([])
  const [loading, setLoading] = useState(true)
  // 错误文案已含 HTTP 状态码与中文原因（代码要求 9）
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [severityFilter, setSeverityFilter] = useState<ViolationSeverity[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  // 列表重载令牌：seq 变化触发重新加载，force=true 时绕过会话缓存（手动刷新）
  const [reload, setReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  // ---- 单条违规详情弹窗 ----
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<ViolationDto | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  /** 重新加载本人违规记录（force=true 绕过会话缓存，代码要求 5） */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 只使用登录态 uid 查询，学生无法指定他人
      const me = await getCurrentUser()
      const res = await queryViolations(
        { user_id: me.uid, page_size: VIOLATION_FETCH_SIZE },
        reload.force,
      )
      setRows(res.data)
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

  /** 类别多选选项：来自本人违规记录中实际出现的类别（非硬编码，代码要求 8） */
  const categoryOptions = useMemo(() => {
    const values = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort()
    return values.map((v) => ({
      value: v,
      label: v || t('studentViolation.uncategorized'),
    }))
  }, [rows, t])

  /** 严重程度多选选项 */
  const severityOptions = useMemo(
    () =>
      VIOLATION_SEVERITY_ORDER.map((v) => ({
        value: v,
        label: getViolationSeverityLabel(v, t),
      })),
    [t],
  )

  /** 前端筛选：关键词 + 严重程度多选 + 类别多选（代码要求 18） */
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return rows.filter((row) => {
      if (
        kw &&
        !row.title.toLowerCase().includes(kw) &&
        !(row.description ?? '').toLowerCase().includes(kw) &&
        !row.category.toLowerCase().includes(kw)
      ) {
        return false
      }
      if (severityFilter.length > 0 && !severityFilter.includes(row.severity)) return false
      if (categoryFilter.length > 0 && !categoryFilter.includes(row.category)) return false
      return true
    })
  }, [rows, keyword, severityFilter, categoryFilter])

  /** 前端分页切片（代码要求 12：每页最多 20 行） */
  const totalPages = Math.max(1, Math.ceil(filtered.length / VIOLATION_PAGE_SIZE))
  const paged = useMemo(
    () =>
      filtered.slice((page - 1) * VIOLATION_PAGE_SIZE, page * VIOLATION_PAGE_SIZE),
    [filtered, page],
  )

  /** 点击行：拉取该条违规详情（GET /api/violations/{id}，代码要求 14） */
  const openDetail = useCallback(
    async (id: number) => {
      setDetailOpen(true)
      setDetail(null)
      setDetailLoading(true)
      try {
        setDetail(await getViolation(id, true))
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setError(extractErrorReason(err, t))
          setDetailOpen(false)
        }
      } finally {
        setDetailLoading(false)
      }
    },
    [t],
  )

  const columns = useMemo<ColumnsType<ViolationDto>>(
    () => [
      {
        title: t('memberDetail.colTitle'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
        render: (v: string) => <span title={v}>{v}</span>,
      },
      {
        title: t('memberDetail.colCategory'),
        dataIndex: 'category',
        key: 'category',
        width: 130,
        render: (v: string) => v || '—',
      },
      {
        title: t('memberDetail.colSeverity'),
        dataIndex: 'severity',
        key: 'severity',
        width: 120,
        render: (v: ViolationSeverity) => (
          <Tooltip title={getViolationSeverityLabel(v, t)}>
            <Tag color={VIOLATION_SEVERITY_COLOR[v]}>{getViolationSeverityLabel(v, t)}</Tag>
          </Tooltip>
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
    ],
    [t, locale],
  )

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('studentViolation.title')}</h3>
          <div className="student-toolbar">
            <Input.Search
              allowClear
              className="admin-search"
              placeholder={t('studentViolation.searchPlaceholder')}
              onSearch={(v: string) => {
                setPage(1)
                setKeyword(v)
              }}
            />
            <Tooltip title={t('studentViolation.filterSeverityHint')}>
              <Select<ViolationSeverity[]>
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                size="small"
                style={{ width: 190 }}
                value={severityFilter}
                placeholder={t('studentViolation.filterSeverityPlaceholder')}
                options={severityOptions}
                onChange={(v: ViolationSeverity[]) => {
                  setPage(1)
                  setSeverityFilter(v)
                }}
              />
            </Tooltip>
            <Tooltip title={t('studentViolation.filterCategoryHint')}>
              <Select<string[]>
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                size="small"
                style={{ width: 190 }}
                value={categoryFilter}
                placeholder={t('studentViolation.filterCategoryPlaceholder')}
                options={categoryOptions}
                onChange={(v: string[]) => {
                  setPage(1)
                  setCategoryFilter(v)
                }}
              />
            </Tooltip>
            <Tooltip title={t('studentViolation.refreshHint')}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
                loading={loading}
              >
                {t('common.refresh')}
              </Button>
            </Tooltip>
          </div>
        </header>
        <div className="panel-card-body">
          {error ? (
            <Alert
              type="error"
              showIcon
              title={error}
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
            <Table<ViolationDto>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={paged}
              locale={{ emptyText: t('common.noData') }}
              scroll={{ x: 780 }}
              onRow={(record: ViolationDto) => ({
                onClick: () => void openDetail(record.id),
                title: t('studentViolation.rowClickHint'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize: VIOLATION_PAGE_SIZE,
                total: filtered.length,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) =>
                  `${t('common.total')} ${n} ${t('common.items')}，${t('common.totalPages', { n: totalPages })}`,
                onChange: (p: number) => setPage(p),
              }}
            />
          )}
        </div>
      </section>

      {/* 违规详情：点击行查看（代码要求 14） */}
      <Modal
        open={detailOpen}
        title={t('studentViolation.detailTitle')}
        footer={<Button onClick={() => setDetailOpen(false)}>{t('common.close')}</Button>}
        onCancel={() => setDetailOpen(false)}
        destroyOnHidden
      >
        <Spin spinning={detailLoading}>
          <Descriptions
            bordered
            column={1}
            size="small"
            items={[
              { key: 'id', label: t('common.id'), children: detail?.id ?? '—' },
              { key: 'title', label: t('memberDetail.colTitle'), children: detail?.title || '—' },
              {
                key: 'category',
                label: t('memberDetail.colCategory'),
                children: detail?.category || '—',
              },
              {
                key: 'severity',
                label: t('memberDetail.colSeverity'),
                children: detail ? (
                  <Tag color={VIOLATION_SEVERITY_COLOR[detail.severity]}>
                    {getViolationSeverityLabel(detail.severity, t)}
                  </Tag>
                ) : (
                  '—'
                ),
              },
              {
                key: 'occurred_at',
                label: t('memberDetail.colOccurredAt'),
                children: detail ? formatDateTime(detail.occurred_at, locale) : '—',
              },
              {
                key: 'location',
                label: t('memberDetail.colLocation'),
                children: detail?.location || '—',
              },
              {
                key: 'description',
                label: t('memberDetail.colDescription'),
                children: detail?.description || '—',
              },
              {
                key: 'recorder',
                label: t('memberDetail.fieldRecorder'),
                children: detail?.recorder_id ?? '—',
              },
              {
                key: 'updated_at',
                label: t('memberDetail.fieldUpdatedAt'),
                children: detail ? formatDateTime(detail.updated_at, locale) : '—',
              },
            ]}
          />
        </Spin>
      </Modal>
    </div>
  )
}