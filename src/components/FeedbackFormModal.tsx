/**
 * 意见反馈表单弹窗（可复用组件）：一个弹窗承载「新增 / 编辑 / 查看详情」三种模式。
 * - create：空表单，默认「建议」分类，提交调用 POST /api/feedbacks；
 * - edit  ：打开时用 GET /api/feedbacks/{id} 拉取详情回填，提交调用 PATCH /api/feedbacks/{id}；
 * - view  ：同样的详情接口，用只读描述列表展示，并额外展示创建/更新时间；
 * 保存成功后回调 onSaved，由调用方强制刷新列表（代码要求 13）。
 */
import { EditOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'
import { createFeedback, getFeedback, updateFeedback } from '../api/feedbacks'
import type {
  FeedbackCategory,
  FeedbackCreateRequest,
  FeedbackDto,
  FeedbackUpdateRequest,
} from '../api/types/feedbacks'
import { extractErrorReason } from '../api/common'
import { useErrorFeedback } from '../composables/useErrorFeedback'
import {
  FEEDBACK_CATEGORY_ORDER,
  FEEDBACK_CONTACT_MAX_LENGTH,
  FEEDBACK_CONTENT_MAX_LENGTH,
  FEEDBACK_TITLE_MAX_LENGTH,
  getFeedbackCategoryLabel,
} from '../config/feedback'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import ErrorState from './ErrorState'

/** 弹窗模式：新增 / 编辑 / 只读查看 */
export type FeedbackFormMode = 'create' | 'edit' | 'view'

/** 表单字段（contact 选填） */
interface FeedbackFormValues {
  category: FeedbackCategory
  title: string
  content: string
  contact?: string
}

interface FeedbackFormModalProps {
  open: boolean
  mode: FeedbackFormMode
  /** 编辑 / 查看时的反馈 ID */
  feedbackId?: number
  onCancel: () => void
  /** 保存成功后触发（用于刷新列表） */
  onSaved: () => void
  /** 详情模式下点击「编辑」时触发，由调用方把弹窗切换为编辑模式 */
  onEdit?: () => void
}

export default function FeedbackFormModal({
  open,
  mode,
  feedbackId,
  onCancel,
  onSaved,
  onEdit,
}: FeedbackFormModalProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const locale = useSettingsStore((s) => s.locale)

  const [form] = Form.useForm<FeedbackFormValues>()
  const [detail, setDetail] = useState<FeedbackDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const readOnly = mode === 'view'
  const isEdit = mode === 'edit'

  /** 错误提示：网络错误走文案，其余回显后端状态码/信息（代码要求 9） */
  const reportError = useErrorFeedback()

  // 打开时初始化：新增用默认空值，编辑/查看拉取详情（走缓存）后回填
  useEffect(() => {
    if (!open) return
    if (mode === 'create') {
      setDetail(null)
      setLoadError(null)
      form.setFieldsValue({ category: 'suggestion' })
      form.resetFields(['title', 'content', 'contact'])
      return
    }
    if (feedbackId === undefined) return

    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setDetail(null)
    form.resetFields()
    void (async () => {
      try {
        const data = await getFeedback(feedbackId)
        if (cancelled) return
        setDetail(data)
        form.setFieldsValue({
          category: data.category,
          title: data.title,
          content: data.content,
          contact: data.contact ?? '',
        })
      } catch (err) {
        if (cancelled) return
        setLoadError(extractErrorReason(err, t))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, mode, feedbackId, form, t])

  /** 提交：新增 → POST；编辑 → PATCH */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (isEdit && feedbackId !== undefined) {
        const payload: FeedbackUpdateRequest = {
          category: values.category,
          title: values.title.trim(),
          content: values.content.trim(),
          contact: values.contact?.trim() || null,
        }
        await updateFeedback(feedbackId, payload)
        message.success(t('feedback.updateSuccess'))
      } else {
        const payload: FeedbackCreateRequest = {
          category: values.category,
          title: values.title.trim(),
          content: values.content.trim(),
          contact: values.contact?.trim() || null,
        }
        await createFeedback(payload)
        message.success(t('feedback.createSuccess'))
      }
      onSaved()
    } catch (err) {
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  const title =
    mode === 'create'
      ? t('feedback.createTitle')
      : isEdit
        ? t('feedback.editTitle')
        : t('feedback.detailTitle')

  const categoryOptions = FEEDBACK_CATEGORY_ORDER.map((value) => ({
    value,
    label: getFeedbackCategoryLabel(value, t),
  }))

  return (
    <Modal
      open={open}
      title={title}
      width={640}
      okText={readOnly ? t('common.close') : t('common.confirm')}
      cancelText={t('common.cancel')}
      okButtonProps={readOnly ? { style: { display: 'none' } } : undefined}
      footer={
        readOnly
          ? [
              <Button key="close" onClick={onCancel}>
                {t('common.close')}
              </Button>,
              ...(onEdit
                ? [
                    <Button
                      key="edit"
                      type="primary"
                      icon={<EditOutlined />}
                      onClick={onEdit}
                    >
                      {t('feedback.edit')}
                    </Button>,
                  ]
                : []),
            ]
          : undefined
      }
      confirmLoading={saving}
      onOk={() => (readOnly ? onCancel() : void submit())}
      onCancel={onCancel}
      destroyOnHidden
    >
      {loadError ? (
        <ErrorState message={loadError} />
      ) : loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : readOnly ? (
        detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('common.id')}>
              {detail.id}
            </Descriptions.Item>
            <Descriptions.Item label={t('feedback.fieldCategory')}>
              {getFeedbackCategoryLabel(detail.category, t)}
            </Descriptions.Item>
            <Descriptions.Item label={t('feedback.fieldTitle')}>
              {detail.title}
            </Descriptions.Item>
            <Descriptions.Item label={t('feedback.fieldContent')}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{detail.content}</div>
            </Descriptions.Item>
            <Descriptions.Item label={t('feedback.fieldContact')}>
              {detail.contact || <Typography.Text type="secondary">—</Typography.Text>}
            </Descriptions.Item>
            <Descriptions.Item label={t('feedback.createdAt')}>
              {formatDateTime(detail.created_at, locale)}
            </Descriptions.Item>
            <Descriptions.Item label={t('feedback.updatedAt')}>
              {formatDateTime(detail.updated_at, locale)}
            </Descriptions.Item>
          </Descriptions>
        )
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item
            name="category"
            label={t('feedback.fieldCategory')}
            rules={[{ required: true, message: t('feedback.categoryRequired') }]}
          >
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item
            name="title"
            label={t('feedback.fieldTitle')}
            rules={[{ required: true, message: t('feedback.titleRequired') }]}
          >
            <Input
              maxLength={FEEDBACK_TITLE_MAX_LENGTH}
              placeholder={t('feedback.titlePlaceholder')}
            />
          </Form.Item>
          <Form.Item
            name="content"
            label={t('feedback.fieldContent')}
            rules={[{ required: true, message: t('feedback.contentRequired') }]}
          >
            <Input.TextArea
              rows={5}
              maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
              showCount
              placeholder={t('feedback.contentPlaceholder')}
            />
          </Form.Item>
          <Form.Item
            name="contact"
            label={t('feedback.fieldContact')}
            extra={t('feedback.contactHint')}
          >
            <Input
              maxLength={FEEDBACK_CONTACT_MAX_LENGTH}
              placeholder={t('feedback.contactPlaceholder')}
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
