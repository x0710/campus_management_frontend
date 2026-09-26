/**
 * 「校园公告」列表，学生/教师端只读浏览，领导端复用为「公告管理」：
 * - 一次性拉取全量公告（走会话缓存），类型/等级/展示态多选筛选与分页均在前端完成；
 * - 整行点击进入公告详情页；
 * - 状态列按 expire_time 推导为「已发布 / 已过期」；
 * - manage=true（领导端）时追加操作列：任意公告可删除（后端仅校验 announcement.delete 权限），
 *   编辑仅限本人发布的公告（后端无归属校验与审计，改他人已发布内容会造成内容归属错乱，
 *   故非本人公告的「编辑」按钮置灰并悬停说明原因）。
 */
import { ReloadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Popconfirm, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue } from 'antd/es/table/interface'
import axios from 'axios'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  deleteAnnouncement,
  listAllAnnouncements,
} from '../../api/announcements'
import type {
  AnnouncementListItem,
  AnnouncementPriority,
  AnnouncementType,
} from '../../api/types/announcements'
import { getCurrentUser } from '../../api/auth'
import { extractErrorWithStatus } from '../../api/common'
import {
  ANNOUNCEMENT_DISPLAY_STATUS_COLOR,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_PRIORITY_COLOR,
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_TYPE_COLOR,
  getAnnouncementDisplayStatus,
  type AnnouncementDisplayStatus,
} from '../../config/announcement'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'
import { useUserNames } from '../../composables/useUserNames'

const { Text } = Typography

/** 前端分页默认每页条数 */
const DEFAULT_PAGE_SIZE = 10

/** 表头多选筛选项（value 为字符串，onFilter 时还原类型） */
type TypeFilterValue = AnnouncementType
type PriorityFilterValue = AnnouncementPriority

export default function AnnouncementsView({ manage = false }: { manage?: boolean }) {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey, moduleKey } = useParams<{
    portalKey: string  // 门户键名，来源：/home/portal/:key，必填
    moduleKey?: string  // 模块键名，来源：/home/portal/:key/:moduleKey，可选
  }>()

  const [items, setItems] = useState<AnnouncementListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState<string | null>(null)

  // 当前用户 uid：管理模式下用于判断某条公告是否本人发布（决定「编辑」是否可用）
  const [myUid, setMyUid] = useState<number | null>(null)
  // 正在删除的公告 id，用于 Popconfirm 确认按钮的 loading 态
  const [actingId, setActingId] = useState<number | null>(null)

  // 当前时间戳：每分钟刷新一次，使「已过期」状态随时间自动翻转
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // 管理模式下获取当前用户（走会话缓存）；401 由 http 拦截器统一处理，这里静默跳过
  useEffect(() => {
    if (!manage) return
    let cancelled = false
    void (async () => {
      try {
        const me = await getCurrentUser()
        if (!cancelled) setMyUid(me.uid)
      } catch {
        // 获取失败时 myUid 保持 null，「编辑」按钮一律置灰，不影响浏览与删除
      }
    })()
    return () => {
      cancelled = true
    }
  }, [manage])

  // 受控筛选值（null 表示该列未筛选），同时驱动表头漏斗高亮
  const [typeFilter, setTypeFilter] = useState<FilterValue | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<FilterValue | null>(null)
  const [statusFilter, setStatusFilter] = useState<FilterValue | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const buildErrorText = useCallback(
    (err: unknown): string => {
      // 按 代码要求：错误提示包含 HTTP 状态码（如 403、500），便于调试
      if (axios.isAxiosError(err) && err.response) {
        const body =
          typeof err.response.data === 'string' && err.response.data.trim()
            ? err.response.data.trim()
            : err.response.statusText
        return body ? `${err.response.status} ${body}` : String(err.response.status)
      }
      if (axios.isAxiosError(err) && !err.response) return t('common.networkError')
      return t('common.loadFailed')
    },
    [t],
  )

  const load = useCallback(
    async (force?: boolean) => {
      setLoading(true)
      setErrorText(null)
      try {
        setItems(await listAllAnnouncements(force))
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) return
        setErrorText(buildErrorText(err))
      } finally {
        setLoading(false)
      }
    },
    [buildErrorText],
  )

  useEffect(() => {
    void load()
  }, [load])

  // 批量解析发布人 ID → 姓名（通过 getUser 走会话缓存；相同 ID 不会重复请求）
  const publisherIds = useMemo(
    () => items.map((it) => it.publisher_id),
    [items],
  )
  const publisherNames = useUserNames(publisherIds)

  // 跳详情时带上来源门户/模块（portalKey 在路径中，moduleKey 通过 ?from 透传），
  // 详情页据此精确返回公告列表，并使父布局侧栏仍高亮原模块入口。
  const openDetail = useCallback(
    (id: number) => {
      const search = moduleKey ? `?from=${encodeURIComponent(moduleKey)}` : ''
      // 跳转公告详情页，带来源门户/模块（portalKey 在路径中，moduleKey 通过 ?from 透传）
      // 详情页据此精确返回公告列表，并使父布局侧栏仍高亮原模块入口。
      navigate(`/portal/${portalKey}/announcements/${id}${search}`)
    },
    [navigate, portalKey, moduleKey],
  )

  // 跳转独立编辑页（仅管理模式下由操作列触发）；?from 透传来源模块，保存后返回本列表
  const openEditor = useCallback(
    (id: number) => {
      const search = moduleKey ? `?from=${encodeURIComponent(moduleKey)}` : ''
      navigate(`/portal/${portalKey}/announcements/${id}/edit${search}`)
    },
    [navigate, portalKey, moduleKey],
  )

  // 删除公告：后端仅校验 announcement.delete 权限，不限制发布人；删除后强制刷新列表绕过缓存
  const remove = useCallback(
    async (id: number) => {
      setActingId(id)
      try {
        await deleteAnnouncement(id)
        message.success(t('publish.deleteSuccess'))
        await load(true)
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) return
        message.error(extractErrorWithStatus(err))
      } finally {
        setActingId(null)
      }
    },
    [message, t, load],
  )

  // 筛选项配置（选项文本支持悬停查看完整名称）
  const typeFilters = useMemo(
    () =>
      ANNOUNCEMENT_TYPES.map((v) => ({
        text: (
          <span title={t(`announcement.type_${v}`)}>{t(`announcement.type_${v}`)}</span>
        ),
        value: v as TypeFilterValue,
      })),
    [t],
  )
  const priorityFilters = useMemo(
    () =>
      ANNOUNCEMENT_PRIORITIES.map((v) => ({
        text: (
          <span title={t(`announcement.priority_${v}`)}>
            {t(`announcement.priority_${v}`)}
          </span>
        ),
        value: v as PriorityFilterValue,
      })),
    [t],
  )
  const statusFilters = useMemo(
    () =>
      (['published', 'expired'] as AnnouncementDisplayStatus[]).map((v) => ({
        text: (
          <span title={t(`announcement.display_${v}`)}>{t(`announcement.display_${v}`)}</span>
        ),
        value: v,
      })),
    [t],
  )

  const columns = useMemo<ColumnsType<AnnouncementListItem>>(
    () => [
      {
        title: t('announcement.colTitle'),
        dataIndex: 'title',
        key: 'title',
        width: 260,
        ellipsis: true,
        // 只展示标题：正文为 Markdown，列表中原样输出会出现 ## / ** 等特殊符号
        render: (title: string) => <Text strong>{title}</Text>,
      },
      {
        title: t('announcement.colType'),
        dataIndex: 'e_type',
        key: 'e_type',
        width: 130,
        // 多选筛选（点击表头漏斗后勾选，可同时选多个类型）
        filters: typeFilters,
        filteredValue: typeFilter,
        onFilter: (value, record) => record.e_type === value,
        render: (type: AnnouncementType) => (
          <Tag color={ANNOUNCEMENT_TYPE_COLOR[type]}>{t(`announcement.type_${type}`)}</Tag>
        ),
      },
      {
        title: t('announcement.colPriority'),
        dataIndex: 'priority',
        key: 'priority',
        width: 120,
        // 多选筛选（可同时选多个等级）
        filters: priorityFilters,
        filteredValue: priorityFilter,
        onFilter: (value, record) => record.priority === value,
        render: (priority: AnnouncementPriority) => (
          <Tag color={ANNOUNCEMENT_PRIORITY_COLOR[priority]}>
            {t(`announcement.priority_${priority}`)}
          </Tag>
        ),
      },
      {
        title: t('announcement.colStatus'),
        key: 'status',
        width: 120,
        // 展示态筛选：已发布 / 已过期
        filters: statusFilters,
        filteredValue: statusFilter,
        onFilter: (value, record) =>
          getAnnouncementDisplayStatus(record, now) === value,
        render: (_, record) => {
          const display = getAnnouncementDisplayStatus(record, now)
          return (
            <Tag color={ANNOUNCEMENT_DISPLAY_STATUS_COLOR[display]}>
              {t(`announcement.display_${display}`)}
            </Tag>
          )
        },
      },
      {
        title: t('announcement.colPublisher'),
        dataIndex: 'publisher_id',
        key: 'publisher_id',
        width: 120,
        render: (id: number) =>
          publisherNames.has(id)
            ? (publisherNames.get(id) ?? '-')
            : t('common.loading'),
      },
      {
        title: t('announcement.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        // 本地排序：数据为一次性拉取的全量公告，antd 会先对全量排序再分页；
        // 默认与接口归一化后的顺序一致（最新发布在前），点击表头可在 降序→升序→取消 间切换
        sorter: (a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf(),
        defaultSortOrder: 'descend',
        sortDirections: ['descend', 'ascend'],
        render: (value: string) => formatDateTime(value, locale),
      },
      // 管理模式下追加操作列：编辑（仅本人发布）+ 删除（任意公告）
      ...(manage
        ? [
            {
              title: t('approval.colAction'),
              key: 'action',
              width: 130,
              // 行内操作：阻止冒泡，避免触发整行的「查看详情」跳转
              render: (_: unknown, record: AnnouncementListItem) => {
                const isOwn = myUid !== null && record.publisher_id === myUid
                return (
                  <div className="approval-actions" onClick={(e) => e.stopPropagation()}>
                    <Tooltip
                      title={
                        isOwn ? t('publish.editHint') : t('announcement.editOwnOnlyHint')
                      }
                    >
                      {/* 非本人公告禁用编辑：span 包裹保证禁用态下 Tooltip 仍可悬停触发 */}
                      <span>
                        <Button
                          type="link"
                          size="small"
                          disabled={!isOwn}
                          onClick={() => openEditor(record.id)}
                        >
                          {t('publish.edit')}
                        </Button>
                      </span>
                    </Tooltip>
                    <Popconfirm
                      title={t('publish.deleteConfirm')}
                      okText={t('publish.delete')}
                      cancelText={t('approval.cancel')}
                      okButtonProps={{ danger: true, loading: actingId === record.id }}
                      onConfirm={() => void remove(record.id)}
                    >
                      <Tooltip title={t('publish.deleteHint')}>
                        <Button type="link" size="small" danger>
                          {t('publish.delete')}
                        </Button>
                      </Tooltip>
                    </Popconfirm>
                  </div>
                )
              },
            } satisfies ColumnsType<AnnouncementListItem>[number],
          ]
        : []),
    ],
    [t, locale, now, typeFilters, priorityFilters, statusFilters, typeFilter, priorityFilter, statusFilter, publisherNames, manage, myUid, actingId, openEditor, remove],
  )

  // 受控分页配置：页码 / 每页条数的变更统一由下方 Table 的 onChange 处理
  // （分页、筛选、排序都会触发它；antd 在筛选或排序变化时会自动把 current 归 1）
  const paginationConfig: TablePaginationConfig = useMemo(
    () => ({
      current: page,
      pageSize,
      showSizeChanger: true,
      showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
    }),
    [page, pageSize, t],
  )

  return (
    <section className="panel-card" style={{ width: '100%' }}>
      <header className="panel-card-header">
        <h3 className="panel-card-title">
          {t(manage ? 'announcement.manageTitle' : 'announcement.title')}
        </h3>
        <Button icon={<ReloadOutlined />} onClick={() => void load(true)}>
          {t('common.refresh')}
        </Button>
      </header>
      <div className="panel-card-body">
        {errorText ? (
          <Alert
            type="error"
            showIcon
            title={errorText}
            action={
              <Button size="small" onClick={() => void load(true)}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <Table<AnnouncementListItem>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={items}
            scroll={{ x: manage ? 1090 : 960 }}
            pagination={paginationConfig}
            onChange={(nextPagination, filters) => {
              // 分页 / 每页条数 / 筛选的唯一更新入口。
              // 此前 pagination.onChange 里 setPage(目标页) 与这里无条件 setPage(1)
              // 在同一次点击中被批处理、后者覆盖前者，导致翻页按钮看似无效。
              // 筛选或排序变化时 antd 回传的 current 本身就是 1，无需再手动归页。
              setPage(nextPagination.current ?? 1)
              setPageSize(nextPagination.pageSize ?? pageSize)
              setTypeFilter(filters.e_type ?? null)
              setPriorityFilter(filters.priority ?? null)
              setStatusFilter(filters.status ?? null)
            }}
            onRow={(record) => ({
              onClick: () => openDetail(record.id),
              title: t('announcement.rowClickHint'),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </div>
    </section>
  )
}
