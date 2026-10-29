/**
 * 界面壳顶栏「消息通知」按钮：
 * - 挂载与弹层关闭时查询未读数量 GET /api/notices/unread-count（直连不缓存，展示最新值）；
 * - 点击展开 Popover 时强制刷新最近通知 GET /api/notices（单页 20 条）；
 * - 点击未读通知调用 PUT /api/notices/{id}/read 标记已读，并本地同步未读徽标；
 * - 失败静默降级（保留原值 / 展示加载失败文案），401 由全局拦截器统一处理登录态。
 */
import { BellOutlined } from '@ant-design/icons'
import { Badge, Button, Empty, List, Popover, Spin, Tag, Tooltip } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { getUnreadNoticeCount, markNoticeRead, queryNotices } from '../api/notices'
import type { Notice } from '../api/types/notices'
import { NOTICE_CATEGORY_LABEL_KEYS } from '../config/notices'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'

/** 顶栏通知弹层单页条数（代码要求 12：单页最多 100 行） */
const NOTICE_POPOVER_PAGE_SIZE = 20

export default function PortalNoticeBell() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  /** 未读数量（直连接口；查询失败保留原值） */
  const [unread, setUnread] = useState(0)
  /** 弹层内的通知列表 */
  const [notices, setNotices] = useState<Notice[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  /** 查询未读数量；失败静默保留原值，不打断顶栏使用 */
  const refreshUnread = useCallback(async () => {
    try {
      setUnread(await getUnreadNoticeCount())
    } catch {
      // 未读数获取失败保留原值（401 由全局拦截器处理登录态）
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const count = await getUnreadNoticeCount()
        if (!cancelled) setUnread(count)
      } catch {
        // 未读数获取失败保留原值（401 由全局拦截器处理登录态）
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 展开弹层：强制刷新最近通知列表 */
  const openPanel = async () => {
    setOpen(true)
    setLoading(true)
    setLoadFailed(false)
    try {
      const res = await queryNotices({ page: 1, page_size: NOTICE_POPOVER_PAGE_SIZE }, true)
      setNotices(res.data)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  /** 关闭弹层：刷新未读数量，让弹层内标记已读后的徽标与后端一致 */
  const closePanel = () => {
    setOpen(false)
    void refreshUnread()
  }

  /** 点击未读通知标记已读，并同步本地列表与徽标 */
  const handleRead = async (notice: Notice) => {
    if (notice.is_read) return
    try {
      await markNoticeRead(notice.id)
      setNotices((prev) =>
        prev.map((item) => (item.id === notice.id ? { ...item, is_read: true } : item)),
      )
      setUnread((prev) => Math.max(0, prev - 1))
    } catch {
      // 标记失败保持现状，关闭弹层时刷新未读数兜底
    }
  }

  const popoverContent = (
    <div className="notice-popover">
      <div className="notice-popover-title">{t('notice.title')}</div>
      {loading ? (
        <div className="notice-popover-state">
          <Spin size="small" />
        </div>
      ) : loadFailed ? (
        <div className="notice-popover-state">{t('common.loadFailed')}</div>
      ) : notices.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('notice.empty')} />
      ) : (
        <List
          size="small"
          className="notice-list"
          dataSource={notices}
          renderItem={(item) => (
            <List.Item
              className={item.is_read ? '' : 'notice-item-unread'}
              title={item.is_read ? undefined : t('notice.readHint')}
              onClick={() => void handleRead(item)}
            >
              <div className="notice-item-body">
                <div className="notice-item-content">{item.content}</div>
                <div className="notice-item-meta">
                  <Tag color="blue">{t(NOTICE_CATEGORY_LABEL_KEYS[item.category])}</Tag>
                  <span className="notice-item-time">{formatDateTime(item.created_at, locale)}</span>
                </div>
              </div>
              {!item.is_read ? <span className="notice-item-dot" /> : null}
            </List.Item>
          )}
        />
      )}
    </div>
  )

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        if (next) void openPanel()
        else closePanel()
      }}
      placement="bottomRight"
      content={popoverContent}
    >
      <Badge count={unread} size="small" offset={[-4, 4]}>
        <Tooltip title={t('notice.title')}>
          <Button type="text" className="header-icon-btn" icon={<BellOutlined />} />
        </Tooltip>
      </Badge>
    </Popover>
  )
}
