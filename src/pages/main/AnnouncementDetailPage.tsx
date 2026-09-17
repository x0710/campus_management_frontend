/** 公告详情页：从列表点击整行跳转过来，单独请求全文并按 Markdown 渲染。
 *  本页作为 PortalWorkspace 布局的子路由渲染，沿用父布局提供的顶栏 + 左侧菜单，
 *  故此处只输出内容区，不再单独渲染 PortalHeader / workspace-body 等壳元素。
 *
 *  要点：
 *  - 正文通过 MarkdownView 渲染为富文本（标题/粗体/列表等），不再原样输出 Markdown 符号；
 *  - 发布人 ID 通过 getUser 解析为真实姓名；
 *  - 公告状态后端可能返回非枚举值，安全降级到 status_unknown；
 *  - 发布人与发布时间之间保留视觉间距。
 */
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, Button, Skeleton, Space, Tag, Typography } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import MarkdownView from '../../components/MarkdownView'
import { useUserNames } from '../../composables/useUserNames'
import { getAnnouncement, type AnnouncementDetail } from '../../api/announcements'
import {
  ANNOUNCEMENT_PRIORITY_COLOR,
  ANNOUNCEMENT_STATUS_COLOR,
  ANNOUNCEMENT_TYPE_COLOR,
} from '../../config/announcement'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

const { Text } = Typography

/** 后端可能返回的公告状态枚举（AnnouncementStatus 联合类型） */
const KNOWN_STATUSES = ['draft', 'published', 'withdrawn'] as const
type KnownAnnouncementStatus = (typeof KNOWN_STATUSES)[number]

/** 将后端原始 status 安全映射为已知枚举，未知值统一回退为 'unknown' */
function normalizeStatus(raw: unknown): KnownAnnouncementStatus | 'unknown' {
  if (typeof raw === 'string' && KNOWN_STATUSES.includes(raw as KnownAnnouncementStatus)) {
    return raw as KnownAnnouncementStatus
  }
  return 'unknown'
}

/** 公告详情页：从列表点击整行跳转过来，单独请求全文 */
export default function AnnouncementDetailPage() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const navigate = useNavigate()
  const location = useLocation()
  const { id, portalKey } = useParams<{ id: string; portalKey: string }>()

  // 来源模块：URL ?from=<moduleKey>，用于返回公告列表与父布局侧栏高亮。
  // 兼容旧的 location.state（{portalKey,moduleKey}）形式，刷新后仍以 URL 为准。
  const fromState = (location.state ?? null) as
    | { portalKey?: string; moduleKey?: string }
    | null
  const fromModuleKey =
    new URLSearchParams(location.search).get('from') ?? fromState?.moduleKey

  const [detail, setDetail] = useState<AnnouncementDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState<string | null>(null)

  // 批量解析发布人 ID → 姓名（通过 getUser 走缓存）
  const publisherNames = useUserNames(detail ? [detail.publisher_id] : [])

  const buildErrorText = useCallback(
    (err: unknown): string => {
      // 按 ai 要求：错误提示包含 HTTP 状态码（如 404、500），便于调试
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
    async (numId: number, force?: boolean) => {
      setLoading(true)
      setErrorText(null)
      try {
        setDetail(await getAnnouncement(numId, force))
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
    const numId = Number(id)
    if (!Number.isFinite(numId) || numId <= 0) {
      setErrorText(t('common.loadFailed'))
      setLoading(false)
      return
    }
    void load(numId)
  }, [id, load, t])

  // 返回公告列表：优先回到来源门户的公告模块；没有来源信息时退到门户首页
  const backToList = useCallback(() => {
    if (portalKey && fromModuleKey) {
      navigate(`/portal/${portalKey}/${fromModuleKey}`)
    } else if (portalKey) {
      navigate(`/portal/${portalKey}`)
    } else if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/home')
    }
  }, [portalKey, fromModuleKey, navigate])

  return (
    <section className="panel-card" style={{ width: '100%' }}>
      <div className="panel-card-body">
        {/* 醒目返回按钮：固定在正文上方 */}
        <div className="announcement-detail-back">
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={backToList}
          >
            {t('announcement.backToList')}
          </Button>
        </div>

        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : errorText ? (
          <Alert
            type="error"
            showIcon
            title={errorText}
            action={
              <Button size="small" onClick={backToList}>
                {t('announcement.backToList')}
              </Button>
            }
          />
        ) : detail ? (
          <div className="announcement-detail">
            <Space size={8} wrap style={{ marginBottom: 12 }}>
              <Tag color={ANNOUNCEMENT_TYPE_COLOR[detail.e_type]}>
                {t(`announcement.type_${detail.e_type}`)}
              </Tag>
              <Tag color={ANNOUNCEMENT_PRIORITY_COLOR[detail.priority]}>
                {t(`announcement.priority_${detail.priority}`)}
              </Tag>
              {(() => {
                // 状态安全降级：未知状态统一回退为 status_unknown，避免显示 key 原文
                const statusKey = normalizeStatus(detail.status)
                const color =
                  statusKey === 'unknown'
                    ? 'default'
                    : ANNOUNCEMENT_STATUS_COLOR[statusKey]
                return (
                  <Tag color={color}>
                    {t(`announcement.status_${statusKey}`)}
                  </Tag>
                )
              })()}
              {detail.expire_time ? (
                <Text type="secondary">
                  {t('announcement.detailExpire')}：
                  {formatDateTime(detail.expire_time, locale)}
                </Text>
              ) : null}
            </Space>

            <h2 className="announcement-detail-title">{detail.title}</h2>

            <div className="announcement-detail-meta">
              <Text type="secondary">
                {t('announcement.colPublisher')}：
                {publisherNames.has(detail.publisher_id)
                  ? (publisherNames.get(detail.publisher_id) ?? '-')
                  : t('common.loading')}
              </Text>
              <Text type="secondary">
                {t('announcement.colCreatedAt')}：
                {formatDateTime(detail.created_at, locale)}
              </Text>
            </div>

            <div className="announcement-detail-content">
              <Text strong>{t('announcement.detailContent')}</Text>
              {detail.content ? (
                <MarkdownView content={detail.content} />
              ) : (
                <Text type="secondary">{t('announcement.detailNoContent')}</Text>
              )}
            </div>

            {/* 醒目返回按钮：正文下方再放一个 */}
            <div className="announcement-detail-back" style={{ marginTop: 24 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={backToList}>
                {t('announcement.backToList')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
