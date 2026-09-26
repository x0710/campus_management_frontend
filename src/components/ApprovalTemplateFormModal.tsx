/**
 * 审批模板表单弹窗（可复用组件）：一个弹窗承载「新增 / 编辑 / 查看详情」三种模式。
 * - create：空表单（默认值填充，不使用业务数据），提交 POST /api/approvals/templates；
 * - edit  ：打开时用 GET /api/approvals/templates/{id} 拉取详情回填，提交 PATCH /api/approvals/templates/{id}；
 * - view  ：只读展示模板信息，并内嵌「审批步骤」表格，可对步骤做增 / 改 / 删
 *          （POST/PATCH/DELETE /api/approvals/templates/{template_id}/steps[/{step_id}]）；
 *          若传入 onEdit，弹窗底部提供「编辑」按钮，可在同一弹窗内切换到编辑模式。
 * 保存成功后回调 onSaved，由调用方刷新模板列表（代码要求 13）。
 * 业务类型为「固定选项 + 其他自定义输入」：选「其他」时展开输入框，提交时上送自定义值。
 */
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createApprovalTemplate,
  deleteApprovalTemplateStep,
  getApprovalTemplateDetail,
  updateApprovalTemplate,
} from '../api/approvalmodel'
import type { ApprovalStep, ApprovalTemplateDetail } from '../api/types/approvalmodel'
import { queryPositions } from '../api/positions'
import { extractErrorReason } from '../api/common'
import ApprovalTemplateStepModal, {
  type ApprovalTemplateStepMode,
} from './ApprovalTemplateStepModal'
import {
  APPROVAL_BUSINESS_TYPE_CUSTOM_MAX_LENGTH,
  APPROVAL_BUSINESS_TYPE_OPTIONS,
  APPROVAL_BUSINESS_TYPE_OTHER,
  APPROVAL_POSITION_FETCH_SIZE,
  APPROVAL_TEMPLATE_CODE_MAX_LENGTH,
  APPROVAL_TEMPLATE_DESC_MAX_LENGTH,
  APPROVAL_TEMPLATE_NAME_MAX_LENGTH,
  getBusinessTypeColor,
  getBusinessTypeLabel,
} from '../config/approvalTemplate'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'

/** 弹窗模式：新增 / 编辑 / 只读查看 */
export type ApprovalTemplateFormMode = 'create' | 'edit' | 'view'

/** 模板表单字段（business_type_custom 仅在选中「其他」时使用） */
interface TemplateFormValues {
  code?: string
  name: string
  business_type: string
  business_type_custom?: string
  enabled: boolean
  description?: string
}

interface ApprovalTemplateFormModalProps {
  /** 是否打开（必填） */
  open: boolean
  /** 模式（必填，默认 create） */
  mode: ApprovalTemplateFormMode
  /** 编辑 / 查看时的模板 ID（edit、view 模式必填） */
  templateId?: number
  /** 取消/关闭时触发（必填） */
  onCancel: () => void
  /** 模板保存成功后触发，用于刷新列表（必填） */
  onSaved: () => void
  /** 只读模式下点击「编辑」时触发，由调用方把弹窗切换为编辑模式（可选） */
  onEdit?: () => void
  /** 步骤增删改成功后触发，用于刷新外层列表（可选） */
  onStepsChanged?: () => void
}

export default function ApprovalTemplateFormModal({
  open,
  mode,
  templateId,
  onCancel,
  onSaved,
  onEdit,
  onStepsChanged,
}: ApprovalTemplateFormModalProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const locale = useSettingsStore((s) => s.locale)

  const [form] = Form.useForm<TemplateFormValues>()
  const [detail, setDetail] = useState<ApprovalTemplateDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [stepsLoading, setStepsLoading] = useState(false)
  const [deletingStepId, setDeletingStepId] = useState<number | null>(null)
  // 职位下拉选项：value 为职位编码（提交给后端），label 为职位名称（展示用，代码要求：角色列显示名称）
  const [positionOptions, setPositionOptions] = useState<
    { value: string; label: string }[]
  >([])
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [stepModal, setStepModal] = useState<{
    mode: ApprovalTemplateStepMode
    step?: ApprovalStep
  } | null>(null)

  const readOnly = mode === 'view'
  const isEdit = mode === 'edit'
  // 业务类型选择值：选「其他」时展开自定义输入
  const businessTypeValue = Form.useWatch('business_type', form)

  /** 统一错误提示：带 HTTP 状态码与中文原因（代码要求 9） */
  const showError = useCallback(
    (err: unknown) => {
      message.error(extractErrorReason(err, t))
    },
    [message, t],
  )

  /** 拉取详情并回填表单（force=true 绕过缓存，用于步骤变更后刷新） */
  const loadDetail = useCallback(
    async (force: boolean, cancelledRef?: { cancelled: boolean }) => {
      if (templateId === undefined) return
      setLoadError(null)
      try {
        const data = await getApprovalTemplateDetail(templateId, force)
        if (cancelledRef?.cancelled) return
        setDetail(data)
        const isKnownType = APPROVAL_BUSINESS_TYPE_OPTIONS.includes(data.business_type)
        form.setFieldsValue({
          code: data.code,
          name: data.name,
          business_type: isKnownType ? data.business_type : APPROVAL_BUSINESS_TYPE_OTHER,
          business_type_custom: isKnownType ? undefined : (data.business_type ?? undefined),
          // 后端响应 enabled 为 i8（0/1）数字，表单 Switch 需布尔值，故此处显式转换，
          // 否则回填后原样提交会给后端 `Option<bool>` 字段送去整数导致 400
          enabled: Boolean(data.enabled),
          description: data.description ?? undefined,
        })
      } catch (err) {
        if (cancelledRef?.cancelled) return
        setLoadError(extractErrorReason(err, t))
      }
    },
    [templateId, form, t],
  )

  // 打开时初始化：新增用默认值，编辑/查看拉取详情（走缓存）后回填
  useEffect(() => {
    if (!open) return
    if (mode === 'create') {
      setDetail(null)
      setLoadError(null)
      form.resetFields()
      form.setFieldsValue({ enabled: true })
      return
    }
    if (templateId === undefined) return

    const cancelledRef = { cancelled: false }
    setLoading(true)
    setDetail(null)
    form.resetFields()
    void loadDetail(false, cancelledRef).finally(() => {
      if (!cancelledRef.cancelled) setLoading(false)
    })

    return () => {
      cancelledRef.cancelled = true
    }
  }, [open, mode, templateId, form, loadDetail])

  /** 打开时加载职位列表：审批步骤的 position 落库为职位编码（外键），展示时需映射为职位名称 */
  useEffect(() => {
    if (!open) return
    const cancelledRef = { cancelled: false }
    setPositionsLoading(true)
    queryPositions({ page: 1, page_size: APPROVAL_POSITION_FETCH_SIZE })
      .then((res) => {
        if (cancelledRef.cancelled) return
        setPositionOptions(
          res.data.map((p) => ({ value: p.code, label: p.name || p.code })),
        )
      })
      .catch((err) => {
        if (cancelledRef.cancelled) return
        setPositionOptions([])
        showError(err)
      })
      .finally(() => {
        if (!cancelledRef.cancelled) setPositionsLoading(false)
      })
    return () => {
      cancelledRef.cancelled = true
    }
  }, [open, showError])

  /** 职位编码 → 职位名称映射（未命中时回退显示编码本身，兼容职位已被删除的历史数据） */
  const positionNameMap = useMemo(
    () => new Map(positionOptions.map((o) => [o.value, o.label])),
    [positionOptions],
  )

  /** 步骤变更后强制刷新详情（绕过缓存） */
  const refreshDetail = useCallback(async () => {
    setStepsLoading(true)
    try {
      await loadDetail(true)
    } finally {
      setStepsLoading(false)
    }
  }, [loadDetail])

  /** 提交：新增 → POST；编辑 → PATCH */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const businessType =
        values.business_type === APPROVAL_BUSINESS_TYPE_OTHER
          ? (values.business_type_custom ?? '').trim()
          : values.business_type
      if (isEdit && templateId !== undefined) {
        await updateApprovalTemplate(templateId, {
          name: values.name.trim(),
          business_type: businessType,
          enabled: values.enabled,
          description: values.description?.trim() || null,
        })
        message.success(t('approvalTemplate.updateSuccess'))
      } else {
        await createApprovalTemplate({
          code: (values.code ?? '').trim(),
          name: values.name.trim(),
          business_type: businessType,
          enabled: values.enabled,
          description: values.description?.trim() || null,
        })
        message.success(t('approvalTemplate.createSuccess'))
      }
      onSaved()
    } catch (err) {
      // 表单校验失败由 Form 自行提示，不重复弹窗
      if (err && typeof err === 'object' && 'errorFields' in err) return
      showError(err)
    } finally {
      setSaving(false)
    }
  }

  /** 删除某个审批步骤（成功后刷新详情并通知外层刷新列表） */
  const doDeleteStep = async (stepId: number) => {
    if (templateId === undefined) return
    setDeletingStepId(stepId)
    try {
      await deleteApprovalTemplateStep(templateId, stepId)
      message.success(t('approvalTemplate.stepDeleteSuccess'))
      await refreshDetail()
      onStepsChanged?.()
    } catch (err) {
      showError(err)
    } finally {
      setDeletingStepId(null)
    }
  }

  const stepColumns = useMemo<ColumnsType<ApprovalStep>>(
    () => [
      {
        title: t('approvalTemplate.colStepNo'),
        dataIndex: 'step_no',
        key: 'step_no',
        width: 90,
      },
      {
        title: t('approvalTemplate.colStepPosition'),
        dataIndex: 'position',
        key: 'position',
        width: 130,
        // 角色列展示职位名称（position 存的是职位编码）
        render: (v: string | null) =>
          v ? (positionNameMap.get(v) ?? v) : <span className="cell-sub">—</span>,
      },
      {
        title: t('approvalTemplate.colStepAssignee'),
        dataIndex: 'assignee_value',
        key: 'assignee_value',
        width: 130,
        render: (v: string | null) => (v == null || v === '' ? <span className="cell-sub">—</span> : String(v)),
      },
      {
        title: t('approvalTemplate.colStepDescription'),
        dataIndex: 'description',
        key: 'description',
        render: (v: string | null) => v || <span className="cell-sub">—</span>,
      },
      {
        title: t('approvalTemplate.colStepActions'),
        key: 'action',
        width: 160,
        render: (_, record) => (
          <div className="approval-actions">
            <Tooltip title={t('approvalTemplate.editStepHint')}>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setStepModal({ mode: 'edit', step: record })}
              >
                {t('approvalTemplate.editStep')}
              </Button>
            </Tooltip>
            <Popconfirm
              title={t('approvalTemplate.stepDeleteConfirm')}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true, loading: deletingStepId === record.id }}
              onConfirm={() => void doDeleteStep(record.id)}
            >
              <Tooltip title={t('approvalTemplate.deleteStepHint')}>
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingStepId === record.id}
                >
                  {t('approvalTemplate.deleteStep')}
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, deletingStepId, positionNameMap],
  )

  const title =
    mode === 'create'
      ? t('approvalTemplate.createTitle')
      : isEdit
        ? t('approvalTemplate.editTitle')
        : t('approvalTemplate.detailTitle')

  return (
    <>
      <Modal
        open={open}
        title={title}
        width={readOnly ? 760 : 560}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
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
                        {t('approvalTemplate.edit')}
                      </Button>,
                    ]
                  : []),
              ]
            : undefined
        }
        confirmLoading={saving}
        onOk={() => void submit()}
        onCancel={onCancel}
        destroyOnHidden
      >
        {loadError ? (
          <Alert
            type="error"
            showIcon
            title={t('common.loadFailed')}
            description={loadError}
          />
        ) : loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : readOnly ? (
          detail && (
            <div>
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label={t('approvalTemplate.fieldCode')} span={2}>
                  {detail.code || <Typography.Text type="secondary">—</Typography.Text>}
                </Descriptions.Item>
                <Descriptions.Item label={t('approvalTemplate.fieldName')} span={2}>
                  {detail.name}
                </Descriptions.Item>
                <Descriptions.Item label={t('approvalTemplate.fieldBusinessType')}>
                  <Tooltip title={getBusinessTypeLabel(detail.business_type, t)}>
                    <Tag color={getBusinessTypeColor(detail.business_type)}>
                      {getBusinessTypeLabel(detail.business_type, t)}
                    </Tag>
                  </Tooltip>
                </Descriptions.Item>
                <Descriptions.Item label={t('approvalTemplate.fieldEnabled')}>
                  <Tag color={detail.enabled ? 'green' : 'default'}>
                    {detail.enabled
                      ? t('approvalTemplate.enabled_yes')
                      : t('approvalTemplate.enabled_no')}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('approvalTemplate.fieldDescription')} span={2}>
                  {detail.description || <Typography.Text type="secondary">—</Typography.Text>}
                </Descriptions.Item>
                <Descriptions.Item label={t('approvalTemplate.fieldCreatedAt')}>
                  {formatDateTime(detail.created_at, locale)}
                </Descriptions.Item>
                <Descriptions.Item label={t('approvalTemplate.fieldUpdatedAt')}>
                  {formatDateTime(detail.updated_at, locale)}
                </Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{t('approvalTemplate.stepsTitle')}</span>
                  <Tooltip title={t('approvalTemplate.addStepHint')}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setStepModal({ mode: 'create' })}
                    >
                      {t('approvalTemplate.addStep')}
                    </Button>
                  </Tooltip>
                </div>
                <Table<ApprovalStep>
                  rowKey="id"
                  size="small"
                  loading={stepsLoading}
                  columns={stepColumns}
                  dataSource={detail.steps ?? []}
                  pagination={false}
                  locale={{ emptyText: t('approvalTemplate.stepsEmpty') }}
                />
              </div>
            </div>
          )
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item
              name="code"
              label={t('approvalTemplate.fieldCode')}
              rules={[{ required: true, message: t('approvalTemplate.codeRequired') }]}
              extra={isEdit ? t('approvalTemplate.fieldCodeImmutableHint') : undefined}
            >
              <Input
                maxLength={APPROVAL_TEMPLATE_CODE_MAX_LENGTH}
                disabled={isEdit}
                placeholder={t('approvalTemplate.fieldCodePlaceholder')}
              />
            </Form.Item>
            <Form.Item
              name="name"
              label={t('approvalTemplate.fieldName')}
              rules={[{ required: true, message: t('approvalTemplate.nameRequired') }]}
            >
              <Input
                maxLength={APPROVAL_TEMPLATE_NAME_MAX_LENGTH}
                placeholder={t('approvalTemplate.fieldName')}
              />
            </Form.Item>
            <Form.Item
              name="business_type"
              label={t('approvalTemplate.fieldBusinessType')}
              rules={[{ required: true, message: t('approvalTemplate.businessTypeRequired') }]}
            >
              <Select
                placeholder={t('approvalTemplate.fieldBusinessTypePlaceholder')}
                options={[
                  ...APPROVAL_BUSINESS_TYPE_OPTIONS.map((type) => ({
                    value: type,
                    label: t(`approvalTemplate.business_${type}`),
                  })),
                  {
                    value: APPROVAL_BUSINESS_TYPE_OTHER,
                    label: t('approvalTemplate.business_other'),
                  },
                ]}
              />
            </Form.Item>
            {businessTypeValue === APPROVAL_BUSINESS_TYPE_OTHER && (
              <Form.Item
                name="business_type_custom"
                label={t('approvalTemplate.fieldBusinessType')}
                rules={[
                  { required: true, message: t('approvalTemplate.businessTypeCustomRequired') },
                ]}
              >
                <Input
                  maxLength={APPROVAL_BUSINESS_TYPE_CUSTOM_MAX_LENGTH}
                  placeholder={t('approvalTemplate.fieldBusinessTypeCustomPlaceholder')}
                />
              </Form.Item>
            )}
            <Form.Item
              name="enabled"
              label={t('approvalTemplate.fieldEnabled')}
              valuePropName="checked"
              extra={t('approvalTemplate.fieldEnabledHint')}
            >
              <Switch
                checkedChildren={t('approvalTemplate.enabled_yes')}
                unCheckedChildren={t('approvalTemplate.enabled_no')}
              />
            </Form.Item>
            <Form.Item
              name="description"
              label={t('approvalTemplate.fieldDescription')}
            >
              <Input.TextArea
                rows={3}
                maxLength={APPROVAL_TEMPLATE_DESC_MAX_LENGTH}
                showCount
                placeholder={t('approvalTemplate.fieldDescriptionPlaceholder')}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {templateId !== undefined && (
        <ApprovalTemplateStepModal
          open={stepModal !== null}
          mode={stepModal?.mode ?? 'create'}
          templateId={templateId}
          step={stepModal?.step}
          positionOptions={positionOptions}
          positionsLoading={positionsLoading}
          onCancel={() => setStepModal(null)}
          onSaved={() => {
            setStepModal(null)
            void refreshDetail()
            onStepsChanged?.()
          }}
        />
      )}
    </>
  )
}