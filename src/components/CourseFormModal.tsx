/**
 * 课程表单弹窗（可复用组件）：一个弹窗承载「新增 / 编辑 / 查看详情」三种模式。
 * - create：空表单（默认值填充，不使用业务数据），提交调用 POST /api/courses；
 * - edit  ：打开时用 GET /api/courses/{id} 拉取详情回填，提交调用 PATCH /api/courses/{id}；
 * - view  ：同样的详情接口，用只读的描述列表（Descriptions）展示，而非禁用状态的表单，
 *          并额外展示创建/更新时间；若传入 onEdit，弹窗底部提供「编辑」按钮，可在同一弹窗内切换到编辑模式；
 * 保存成功后回调 onSaved，由调用方强制刷新课程列表（代码要求 13）。
 * 学分与及格分数使用 InputNumber 的 stringMode，与后端 Decimal（JSON 字符串）保持一致。
 */
import { EditOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { createCourse, getCourse, updateCourse } from '../api/courses'
import type { CourseDetail, CourseType } from '../api/types/courses'
import { extractError } from '../api/common'
import {
  COURSE_CODE_MAX_LENGTH,
  COURSE_CREDIT_MAX,
  COURSE_CREDIT_MIN,
  COURSE_NAME_MAX_LENGTH,
  COURSE_SCORE_MAX,
  COURSE_SCORE_MIN,
  COURSE_TYPE_COLOR,
  COURSE_TYPE_OPTIONS,
} from '../config/course'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'

/** 弹窗模式：新增 / 编辑 / 只读查看 */
export type CourseFormMode = 'create' | 'edit' | 'view'

/** 表单字段（学分与及格分数为字符串，与后端 Decimal 对齐） */
interface CourseFormValues {
  course_code?: string
  course_name: string
  course_type: CourseType
  credit: string
  pass_score?: string
}

interface CourseFormModalProps {
  open: boolean
  mode: CourseFormMode
  /** 编辑 / 查看时的课程 ID */
  courseId?: number
  onCancel: () => void
  /** 保存成功后触发（用于刷新列表） */
  onSaved: () => void
  /** 详情模式下点击「编辑」时触发，由调用方把弹窗切换为编辑模式 */
  onEdit?: () => void
}

export default function CourseFormModal({
  open,
  mode,
  courseId,
  onCancel,
  onSaved,
  onEdit,
}: CourseFormModalProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const locale = useSettingsStore((s) => s.locale)

  const [form] = Form.useForm<CourseFormValues>()
  const [detail, setDetail] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const readOnly = mode === 'view'
  const isEdit = mode === 'edit'

  /** 错误提示：网络错误走文案，其余回显后端状态码/信息（代码要求 9） */
  const showError = useCallback(
    (code: string) => {
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

  // 打开时初始化：新增用默认空值，编辑/查看拉取详情（走缓存）后回填
  useEffect(() => {
    if (!open) return
    if (mode === 'create') {
      setDetail(null)
      setLoadError(null)
      form.resetFields()
      return
    }
    if (courseId === undefined) return

    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setDetail(null)
    form.resetFields()
    void (async () => {
      try {
        const data = await getCourse(courseId)
        if (cancelled) return
        setDetail(data)
        form.setFieldsValue({
          course_code: data.course_code ?? undefined,
          course_name: data.course_name,
          course_type: data.course_type,
          credit: data.credit,
          pass_score: data.pass_score,
        })
      } catch (err) {
        if (cancelled) return
        setLoadError(extractError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, mode, courseId, form])

  /** 提交：新增 → POST；编辑 → PATCH */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        course_code: values.course_code?.trim() || null,
        course_name: values.course_name.trim(),
        course_type: values.course_type,
        credit: values.credit,
        pass_score: values.pass_score ?? null,
      }
      if (isEdit && courseId !== undefined) {
        await updateCourse(courseId, payload)
        message.success(t('course.updateSuccess'))
      } else {
        await createCourse(payload)
        message.success(t('course.createSuccess'))
      }
      onSaved()
    } catch (err) {
      showError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const title =
    mode === 'create'
      ? t('course.createTitle')
      : isEdit
        ? t('course.editTitle')
        : t('course.detailTitle')

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
                      {t('course.edit')}
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
        <Alert
          type="error"
          showIcon
          title={loadError === 'network' ? t('common.networkError') : loadError}
        />
      ) : loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : readOnly ? (
        detail && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label={t('course.fieldCode')} span={2}>
              {detail.course_code || (
                <Typography.Text type="secondary">—</Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('course.fieldName')} span={2}>
              {detail.course_name}
            </Descriptions.Item>
            <Descriptions.Item label={t('course.fieldType')}>
              <Tag color={COURSE_TYPE_COLOR[detail.course_type]}>
                {t(`course.type_${detail.course_type}`)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('course.fieldCredit')}>
              {detail.credit}
            </Descriptions.Item>
            <Descriptions.Item label={t('course.fieldPassScore')}>
              {detail.pass_score}
            </Descriptions.Item>
            <Descriptions.Item label={t('course.fieldUpdatedAt')}>
              {formatDateTime(detail.updated_at, locale)}
            </Descriptions.Item>
            <Descriptions.Item label={t('course.fieldCreatedAt')} span={2}>
              {formatDateTime(detail.created_at, locale)}
            </Descriptions.Item>
          </Descriptions>
        )
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item name="course_code" label={t('course.fieldCode')} extra={t('course.fieldCodePlaceholder')}>
            <Input maxLength={COURSE_CODE_MAX_LENGTH} />
          </Form.Item>
          <Form.Item
            name="course_name"
            label={t('course.fieldName')}
            rules={[{ required: true, message: t('course.nameRequired') }]}
          >
            <Input maxLength={COURSE_NAME_MAX_LENGTH} placeholder={t('course.fieldName')} />
          </Form.Item>
          <Form.Item
            name="course_type"
            label={t('course.fieldType')}
            rules={[{ required: true, message: t('course.typeRequired') }]}
          >
            <Select
              placeholder={t('course.typePlaceholder')}
              options={COURSE_TYPE_OPTIONS.map((type) => ({
                value: type,
                label: t(`course.type_${type}`),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="credit"
            label={t('course.fieldCredit')}
            rules={[{ required: true, message: t('course.creditRequired') }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              stringMode
              step="0.5"
              min={String(COURSE_CREDIT_MIN)}
              max={String(COURSE_CREDIT_MAX)}
              placeholder={t('course.fieldCredit')}
            />
          </Form.Item>
          <Form.Item name="pass_score" label={t('course.fieldPassScore')}>
            <InputNumber
              style={{ width: '100%' }}
              stringMode
              step="0.5"
              min={String(COURSE_SCORE_MIN)}
              max={String(COURSE_SCORE_MAX)}
              placeholder={t('course.passScorePlaceholder')}
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}