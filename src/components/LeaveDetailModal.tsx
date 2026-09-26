/** 请假详情弹窗（学生端 / 教师端共用，只读详情 + 可选操作插槽） */
import { Alert, Button, Descriptions, Modal, Skeleton, Tag, Typography } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { getLeave } from '../api/leaves'
import type { LeaveDetail } from '../api/types/leaves'
import { LEAVE_TYPE_COLOR } from '../config/leave'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'

const { Link: TypographyLink, Paragraph, Text } = Typography

interface Props {
  open: boolean
  /** 请假记录标识（审批列表行的 instance_id，即请假记录的 approval_id） */
  leaveId: number | null
  onClose: () => void
  /**
   * 弹窗底部左侧的操作插槽（如学生端的「撤回 / 删除」）。
   * 不传即为纯只读详情，教师端审批视图沿用该默认行为。
   */
  footerExtra?: ReactNode
}

/**
 * 可复用的请假详情弹窗：教师审批列表点击行后展示请假完整信息。
 * 数据通过 getLeave 走会话级缓存；单个详情加载失败时弹窗内显示带状态码的错误并支持重试。
 */
export default function LeaveDetailModal({ open, leaveId, onClose, footerExtra }: Props) {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  const [detail, setDetail] = useState<LeaveDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const buildErrorText = useCallback(
    (err: unknown): string => {
      // 按 代码要求：错误提示包含 HTTP 状态码（如 404、500），便于调试
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
    async (id: number, force?: boolean) => {
      setLoading(true)
      setErrorText(null)
      try {
        setDetail(await getLeave(id, force))
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
    if (open && leaveId !== null) void load(leaveId)
  }, [open, leaveId, load])

  return (
    <Modal
      open={open}
      title={t('leaveDetail.title')}
      footer={
        <div className="leave-detail-footer">
          <div className="leave-detail-footer-extra">{footerExtra}</div>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      }
      onCancel={onClose}
      destroyOnHidden
      width={640}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : errorText ? (
        <Alert
          type="error"
          showIcon
          title={errorText}
          action={
            leaveId !== null ? (
              <Button size="small" onClick={() => void load(leaveId, true)}>
                {t('common.retry')}
              </Button>
            ) : undefined
          }
        />
      ) : detail ? (
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label={t('leaveDetail.applicantId')}>
            {detail.user_id}
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.leaveType')}>
            <Tag color={LEAVE_TYPE_COLOR[detail.leave_type]}>
              {t(`leaveDetail.type_${detail.leave_type}`)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.startTime')}>
            {formatDateTime(detail.start_time, locale)}
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.endTime')}>
            {formatDateTime(detail.end_time, locale)}
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.destination')} span={2}>
            {detail.destination}
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.reason')} span={2}>
            <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
              {detail.reason}
            </Paragraph>
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.parentConfirm')}>
            {detail.parent_confirm ? (
              <Text type="success">{t('leaveDetail.confirmed')}</Text>
            ) : (
              <Text type="secondary">{t('leaveDetail.notConfirmed')}</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.attachment')}>
            {detail.attachment_url && detail.attachment_url.trim() ? (
              <TypographyLink href={detail.attachment_url} target="_blank" rel="noreferrer">
                {detail.attachment_url}
              </TypographyLink>
            ) : (
              <Text type="secondary">{t('leaveDetail.noAttachment')}</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.createdAt')}>
            {formatDateTime(detail.created_at, locale)}
          </Descriptions.Item>
          <Descriptions.Item label={t('leaveDetail.updatedAt')}>
            {formatDateTime(detail.updated_at, locale)}
          </Descriptions.Item>
        </Descriptions>
      ) : null}
    </Modal>
  )
}
