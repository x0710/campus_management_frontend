/**
 * 奖学金及补助表单弹窗（可复用组件）：一个弹窗承载「新增 / 编辑 / 查看详情」三种模式。
 * - create：空表单（默认值填充，不使用业务数据），提交调用 POST /api/rewardings；
 * - edit  ：打开时用 GET /api/rewardings/{id} 拉取详情回填，提交调用 PATCH /api/rewardings/{id}；
 * - view  ：同样的详情接口，用只读的描述列表（Descriptions）展示，而非禁用状态的表单，
 *          并额外展示创建时间；若传入 onEdit，弹窗底部提供「编辑」按钮，可在同一弹窗内切换到编辑模式；
 * 保存成功后回调 onSaved，由调用方强制刷新列表（代码要求 13）。
 * 金额在表单中以「元」输入（精确到分），提交时转换为后端要求的「分」（amount_cents）。
 */
import { EditOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Skeleton,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'
import { createRewarding, getRewarding, updateRewarding } from '../api/rewardings'
import type { RewardingDto } from '../api/types/rewardings'
import { extractErrorReason } from '../api/common'
import { useErrorFeedback } from '../composables/useErrorFeedback'
import {
  REWARDING_AMOUNT_MAX_YUAN,
  REWARDING_AMOUNT_MIN_YUAN,
  REWARDING_AMOUNT_STEP_YUAN,
  REWARDING_PROJECT_MAX_LENGTH,
  REWARDING_UID_MIN,
} from '../config/rewarding'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import { formatCentsAsYuan, yuanToCents } from '../utils/money'
import ErrorState from './ErrorState'

/** 弹窗模式：新增 / 编辑 / 只读查看 */
export type RewardingFormMode = 'create' | 'edit' | 'view'

/** 表单字段（金额以「元」为单位输入） */
interface RewardingFormValues {
  uid: number
  project: string
  amount_yuan: number
}

interface RewardingFormModalProps {
  open: boolean
  mode: RewardingFormMode
  /** 编辑 / 查看时的奖学金记录 ID */
  rewardingId?: number
  onCancel: () => void
  /** 保存成功后触发（用于刷新列表） */
  onSaved: () => void
  /** 详情模式下点击「编辑」时触发，由调用方把弹窗切换为编辑模式 */
  onEdit?: () => void
}

export default function RewardingFormModal({
  open,
  mode,
  rewardingId,
  onCancel,
  onSaved,
  onEdit,
}: RewardingFormModalProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const locale = useSettingsStore((s) => s.locale)

  const [form] = Form.useForm<RewardingFormValues>()
  const [detail, setDetail] = useState<RewardingDto | null>(null)
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
      form.resetFields()
      return
    }
    if (rewardingId === undefined) return

    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setDetail(null)
    form.resetFields()
    void (async () => {
      try {
        const data = await getRewarding(rewardingId)
        if (cancelled) return
        setDetail(data)
        form.setFieldsValue({
          uid: data.uid,
          project: data.project,
          amount_yuan: data.amount_cents / 100,
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
  }, [open, mode, rewardingId, form, t])

  /** 提交：新增 → POST；编辑 → PATCH（金额「元」转换为后端「分」） */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        uid: values.uid,
        project: values.project.trim(),
        amount_cents: yuanToCents(values.amount_yuan),
      }
      if (isEdit && rewardingId !== undefined) {
        await updateRewarding(rewardingId, payload)
        message.success(t('rewarding.updateSuccess'))
      } else {
        await createRewarding(payload)
        message.success(t('rewarding.createSuccess'))
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
      ? t('rewarding.createTitle')
      : isEdit
        ? t('rewarding.editTitle')
        : t('rewarding.detailTitle')

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
                      {t('rewarding.edit')}
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
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label={t('common.id')} span={2}>
              {detail.id}
            </Descriptions.Item>
            <Descriptions.Item label={t('rewarding.fieldUid')} span={2}>
              {detail.uid}
            </Descriptions.Item>
            <Descriptions.Item label={t('rewarding.fieldProject')} span={2}>
              {detail.project || <Typography.Text type="secondary">—</Typography.Text>}
            </Descriptions.Item>
            <Descriptions.Item label={t('rewarding.fieldAmount')} span={2}>
              {formatCentsAsYuan(detail.amount_cents, locale)}
            </Descriptions.Item>
            <Descriptions.Item label={t('rewarding.fieldCreatedAt')} span={2}>
              {formatDateTime(detail.created_at, locale)}
            </Descriptions.Item>
          </Descriptions>
        )
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item
            name="uid"
            label={t('rewarding.fieldUid')}
            rules={[{ required: true, message: t('rewarding.uidRequired') }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={0}
              min={REWARDING_UID_MIN}
              placeholder={t('rewarding.uidPlaceholder')}
            />
          </Form.Item>
          <Form.Item
            name="project"
            label={t('rewarding.fieldProject')}
            rules={[{ required: true, message: t('rewarding.projectRequired') }]}
          >
            <Input
              maxLength={REWARDING_PROJECT_MAX_LENGTH}
              placeholder={t('rewarding.fieldProject')}
            />
          </Form.Item>
          <Form.Item
            name="amount_yuan"
            label={t('rewarding.fieldAmount')}
            rules={[{ required: true, message: t('rewarding.amountRequired') }]}
            extra={t('rewarding.amountHint')}
          >
            <InputNumber
              style={{ width: '100%' }}
              prefix="¥"
              step={REWARDING_AMOUNT_STEP_YUAN}
              precision={2}
              min={REWARDING_AMOUNT_MIN_YUAN}
              max={REWARDING_AMOUNT_MAX_YUAN}
              placeholder={t('rewarding.amountPlaceholder')}
            />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
