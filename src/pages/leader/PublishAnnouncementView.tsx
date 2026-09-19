/** 领导端：我发布的通知（列表 + 管理）。
 * - 列表：GET /api/announcements?publisher_id=<当前用户> 分页查询（会话缓存），支持状态筛选；
 * - 新建：点击「发布通知」按钮跳转到独立编辑页（AnnouncementEditorPage，新建态）；
 * - 编辑：操作列「编辑」跳转到独立编辑页（编辑态，内部走 GET/PATCH /api/announcements/{id}）；
 * - 详情：点击表格整行跳转公告详情页（复用主端 AnnouncementDetailPage，按 id 单独请求全文）；
 * - 删除：DELETE /api/announcements/{id}，永久移除且不可恢复（与「下线」不同，本页不提供软下线）。
 *
 * 约定（ai 要求）：分页每页最多 20 行并可跳页；行内操作按钮阻止冒泡避免误触行点击；
 * 悬停提示见 Tooltip；错误提示带 HTTP 状态码。
 */
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Popconfirm, Select, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  deleteAnnouncement,
  queryAnnouncements,
  type AnnouncementListItem,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AnnouncementType,
} from '../../api/announcements'
import { getCurrentUser } from '../../api/auth'
import { extractErrorWithStatus, type PageQuery } from '../../api/common'
import {
  ANNOUNCEMENT_PRIORITY_COLOR,
  ANNOUNCEMENT_STATUS_COLOR,
  ANNOUNCEMENT_TYPE_COLOR,
} from '../../config/announcement'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

interface PublishListQuery extends PageQuery {
  publisher_id?: number
  status?: AnnouncementStatus
}

/** 领导端：我发布的通知（列表 + 新建/编辑跳转 + 详情 + 删除） */
export default function PublishAnnouncementView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey, moduleKey } = useParams<{ portalKey: string; moduleKey?: string }>()

  const [uid, setUid] = useState<number | null>(null)
  const [uidError, setUidError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'all'>('all')
  const [actingId, setActingId] = useState<number | null>(null)

  const listQuery = useMemo(
    () => (uid === null ? {} : { publisher_id: uid, ...(statusFilter === 'all' ? {} : { status: statusFilter }) }),
    [uid, statusFilter],
  )
  const { data, total, loading, error, page, setPage, pageSize, setPageSize, refresh } =
    usePaginated<AnnouncementListItem, PublishListQuery>(queryAnnouncements, listQuery)

  // 初次加载：当前用户（用于按发布人过滤）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const me = await getCurrentUser()
        if (cancelled) return
        setUid(me.uid)
      } catch (err) {
        if (cancelled) return
        if (axios.isAxiosError(err) && err.response?.status === 401) return
        setUidError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // uid / 状态筛选就绪或变化后重新拉列表
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, statusFilter])

  // 跳转编辑页：新建无 id，编辑带 id；?from 透传来源模块，便于保存后返回本列表
  const openEditor = useCallback(
    (id?: number) => {
      const search = moduleKey ? `?from=${encodeURIComponent(moduleKey)}` : ''
      navigate(
        id === undefined
          ? `/portal/${portalKey}/announcements/new${search}`
          : `/portal/${portalKey}/announcements/${id}/edit${search}`,
      )
    },
    [navigate, portalKey, moduleKey],
  )

  // 跳转公告详情页：复用主端详情页，点击整行触发
  const openDetail = useCallback(
    (id: number) => {
      const search = moduleKey ? `?from=${encodeURIComponent(moduleKey)}` : ''
      navigate(`/portal/${portalKey}/announcements/${id}${search}`)
    },
    [navigate, portalKey, moduleKey],
  )

  const remove = async (record: AnnouncementListItem) => {
    setActingId(record.id)
    try {
      await deleteAnnouncement(record.id)
      message.success(t('publish.deleteSuccess'))
      refresh()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      message.error(extractErrorWithStatus(err))
    } finally {
      setActingId(null)
    }
  }

  const statusOptions = useMemo(
    () =>
      (['all', 'published', 'withdrawn', 'draft'] as const).map((v) => ({
        value: v,
        label: v === 'all' ? t('publish.filterAll') : t(`announcement.status_${v}`),
      })),
    [t],
  )

  const columns = useMemo<ColumnsType<AnnouncementListItem>>(
    () => [
      {
        title: t('announcement.colTitle'),
        dataIndex: 'title',
        key: 'title',
        width: 240,
        ellipsis: true,
      },
      {
        title: t('announcement.colType'),
        dataIndex: 'e_type',
        key: 'e_type',
        width: 92,
        render: (v: AnnouncementType) => (
          <Tag color={ANNOUNCEMENT_TYPE_COLOR[v]}>{t(`announcement.type_${v}`)}</Tag>
        ),
      },
      {
        title: t('announcement.colPriority'),
        dataIndex: 'priority',
        key: 'priority',
        width: 84,
        render: (v: AnnouncementPriority) => (
          <Tag color={ANNOUNCEMENT_PRIORITY_COLOR[v]}>{t(`announcement.priority_${v}`)}</Tag>
        ),
      },
      {
        title: t('announcement.colStatus'),
        dataIndex: 'status',
        key: 'status',
        width: 88,
        render: (v: AnnouncementStatus) => (
          <Tag color={ANNOUNCEMENT_STATUS_COLOR[v]}>{t(`announcement.status_${v}`)}</Tag>
        ),
      },
      {
        title: t('publish.colExpire'),
        dataIndex: 'expire_time',
        key: 'expire_time',
        width: 150,
        render: (v: string | null) => (v ? formatDateTime(v, locale) : '—'),
      },
      {
        title: t('announcement.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 150,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 130,
        // 行内操作：阻止冒泡，避免触发整行的「查看详情」跳转
        render: (_, record) => (
          <div className="approval-actions" onClick={(e) => e.stopPropagation()}>
            <Tooltip title={t('publish.editHint')}>
              <Button type="link" size="small" onClick={() => openEditor(record.id)}>
                {t('publish.edit')}
              </Button>
            </Tooltip>
            <Popconfirm
              title={t('publish.deleteConfirm')}
              okText={t('publish.delete')}
              cancelText={t('approval.cancel')}
              okButtonProps={{ danger: true, loading: actingId === record.id }}
              onConfirm={() => void remove(record)}
            >
              <Tooltip title={t('publish.deleteHint')}>
                <Button type="link" size="small" danger>
                  {t('publish.delete')}
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
        ),
      },
    ],
    [t, locale, actingId, openEditor],
  )

  return (
    <section className="panel-card">
      <header className="panel-card-header">
        <h3 className="panel-card-title">{t('publish.myNotices')}</h3>
        <div className="approval-toolbar">
          <Select
            value={statusFilter}
            options={statusOptions}
            style={{ width: 140 }}
            onChange={(v: AnnouncementStatus | 'all') => {
              setPage(1)
              setStatusFilter(v)
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            {t('common.refresh')}
          </Button>
          <Tooltip title={t('publish.createHint')}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
              {t('publish.createButton')}
            </Button>
          </Tooltip>
        </div>
      </header>
      <div className="panel-card-body">
        {uidError || error ? (
          <Alert
            type="error"
            showIcon
            title={
              uidError
                ? t('common.loadFailed')
                : error === 'network'
                  ? t('common.networkError')
                  : t('common.loadFailed')
            }
            action={
              <Button size="small" onClick={refresh}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <Table<AnnouncementListItem>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            locale={{ emptyText: t('common.noData') }}
            scroll={{ x: 960 }}
            onRow={(record) => ({
              onClick: () => openDetail(record.id),
              title: t('announcement.rowClickHint'),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
              onChange: (nextPage: number, nextSize: number) => {
                if (nextSize !== pageSize) setPageSize(nextSize)
                else setPage(nextPage)
              },
            }}
          />
        )}
      </div>
    </section>
  )
}