import { usePositionLabel } from '../composables/usePositionLabel'
/**
 * 审批模板表单弹窗（可复用组件）：一个弹窗承载「新增 / 编辑 / 查看详情」三种模式。
 * - create：空表单（默认值填充，不使用业务数据），提交 POST /api/approvals/templates；
 *          后端要求创建时必传 organization_id（模板归属组织），故表单提供「所属组织」选择，
 *          可选范围为当前用户任职组织，并默认选中当前门户对应层级组织；
 * - edit  ：打开时用 GET /api/approvals/templates/{id} 拉取详情回填，提交 PATCH /api/approvals/templates/{id}；
 * - view  ：只读展示模板信息，并内嵌「审批步骤」表格，可对步骤做增 / 改 / 删
 *          （POST/PATCH/DELETE /api/approvals/templates/{template_id}/steps[/{step_id}]）；
 *          若传入 onEdit，弹窗底部提供「编辑」按钮，可在同一弹窗内切换到编辑模式。
 * 保存成功后回调 onSaved，由调用方刷新模板列表（代码要求 13）。
 * 指标业务类型固定为 party，新增与编辑不提供类型选择。
 */
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
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
import { useParams } from 'react-router'
import {
  createApprovalTemplate,
  deleteApprovalTemplateStep,
  getApprovalTemplateDetail,
  updateApprovalTemplate,
} from '../api/approvalmodel'
import { getCurrentUser } from '../api/auth'
import { listUserOrganizations } from '../api/organizations'
import type { ApprovalStep, ApprovalTemplateDetail } from '../api/types/approvalmodel'
import { queryPositions } from '../api/positions'
import { extractErrorReason } from '../api/common'
import { useErrorFeedback } from '../composables/useErrorFeedback'
import { resolvePortalOrg } from '../composables/usePortalOrg'
import ApprovalTemplateStepModal, {
  type ApprovalTemplateStepMode,
} from './ApprovalTemplateStepModal'
import {
  APPROVAL_POSITION_FETCH_SIZE,
  APPROVAL_TEMPLATE_DESC_MAX_LENGTH,
  APPROVAL_TEMPLATE_NAME_MAX_LENGTH,
} from '../config/approvalTemplate'
import {
  ACADEMY_ANCESTOR_DEPTHS,
  BRANCH_ANCESTOR_DEPTHS,
  SCHOOL_ANCESTOR_DEPTHS,
} from '../config/organization'
import { PARTY_TEMPLATE_BUSINESS_TYPE } from '../config/partyDeclaration'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import ErrorState from './ErrorState'
import OrganizationName from './OrganizationName'

/** 弹窗模式：新增 / 编辑 / 只读查看 */
export type ApprovalTemplateFormMode = 'create' | 'edit' | 'view'

/**
 * 各门户「当前组织」的判定深度（复用 config/organization 的层级常量）。
 * 领导端等未配置深度的门户回退为「第一个任职组织」作为默认所属组织。
 */
const PORTAL_ORG_DEPTHS: Partial<Record<string, readonly number[]>> = {
  school: SCHOOL_ANCESTOR_DEPTHS,
  academy: ACADEMY_ANCESTOR_DEPTHS,
  branch: BRANCH_ANCESTOR_DEPTHS,
}

/** 模板表单字段 */
interface TemplateFormValues {
  organization_id?: number
  name: string
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
  const positionLabel = usePositionLabel()
  const { message } = AntdApp.useApp()
  const locale = useSettingsStore((s) => s.locale)
  const { portalKey } = useParams<{ portalKey?: string }>()

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
  // 所属组织下拉选项：仅当前用户任职组织（后端要求模板组织在该用户任职组织链内）
  const [orgOptions, setOrgOptions] = useState<{ value: number; label: string }[]>([])
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [stepModal, setStepModal] = useState<{
    mode: ApprovalTemplateStepMode
    step?: ApprovalStep
  } | null>(null)

  const readOnly = mode === 'view'
  const isEdit = mode === 'edit'
  /** 统一错误提示：带 HTTP 状态码与中文原因（代码要求 9） */
  const reportError = useErrorFeedback()

  /** 拉取详情并回填表单（force=true 绕过缓存，用于步骤变更后刷新） */
  const loadDetail = useCallback(
    async (force: boolean, cancelledRef?: { cancelled: boolean }) => {
      if (templateId === undefined) return
      setLoadError(null)
      try {
        const data = await getApprovalTemplateDetail(templateId, force)
        if (cancelledRef?.cancelled) return
        setDetail(data)
        form.setFieldsValue({
          name: data.name,
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
          res.data.map((p) => ({ value: p.code, label: p.name })),
        )
      })
      .catch((err) => {
        if (cancelledRef.cancelled) return
        setPositionOptions([])
        reportError(err)
      })
      .finally(() => {
        if (!cancelledRef.cancelled) setPositionsLoading(false)
      })
    return () => {
      cancelledRef.cancelled = true
    }
  }, [open, reportError])

  /** 职位编码 → 职位名称映射（未命中时回退显示编码本身，兼容职位已被删除的历史数据） */
  const positionNameMap = useMemo(
    () => new Map(positionOptions.map((o) => [o.value, o.label])),
    [positionOptions],
  )

  /**
   * 创建模式下加载「所属组织」选项（当前用户任职组织，走会话缓存），
   * 并默认选中当前门户对应层级组织；学校/学院层级判定失败时回退第一个任职组织。
   */
  useEffect(() => {
    if (!open || mode !== 'create') return
    const cancelledRef = { cancelled: false }
    setOrgsLoading(true)
    void (async () => {
      try {
        const me = await getCurrentUser()
        const mine = await listUserOrganizations(me.uid)
        if (cancelledRef.cancelled) return
        const options = mine.map((o) => ({
          value: o.organization_id,
          label: o.organization_name,
        }))
        setOrgOptions(options)
        if (options.length === 0) return

        let defaultId = options[0].value
        const depths = portalKey ? PORTAL_ORG_DEPTHS[portalKey] : undefined
        if (depths) {
          try {
            const { orgId } = await resolvePortalOrg(depths)
            if (orgId && options.some((o) => o.value === orgId)) defaultId = orgId
          } catch {
            // 层级判定失败不影响创建，保留第一个任职组织作为默认值
          }
        }
        if (cancelledRef.cancelled) return
        form.setFieldValue('organization_id', defaultId)
      } catch (err) {
        if (cancelledRef.cancelled) return
        setOrgOptions([])
        reportError(err)
      } finally {
        if (!cancelledRef.cancelled) setOrgsLoading(false)
      }
    })()
    return () => {
      cancelledRef.cancelled = true
    }
  }, [open, mode, portalKey, form, reportError])

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
      if (isEdit && templateId !== undefined) {
        await updateApprovalTemplate(templateId, {
          name: values.name.trim(),
          business_type: PARTY_TEMPLATE_BUSINESS_TYPE,
          enabled: values.enabled,
          description: values.description?.trim() || null,
        })
        message.success(t('approvalTemplate.updateSuccess'))
      } else {
        await createApprovalTemplate({
          // 后端创建接口要求必传所属组织 ID（该校验由表单必填规则保证）
          organization_id: values.organization_id as number,
          // 使用 128 位随机值生成全局唯一编码，兼容非 HTTPS 内网环境。
          code: `approval_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join('')}`,
          name: values.name.trim(),
          business_type: PARTY_TEMPLATE_BUSINESS_TYPE,
          enabled: values.enabled,
          description: values.description?.trim() || null,
        })
        message.success(t('approvalTemplate.createSuccess'))
      }
      onSaved()
    } catch (err) {
      // 表单校验失败由 Form 自行提示，不重复弹窗
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
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
      reportError(err)
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
          v ? positionLabel(v, positionNameMap.get(v)) : <span className="cell-sub">—</span>,
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
    [t, deletingStepId, positionNameMap, positionLabel],
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
          <ErrorState message={loadError} />
        ) : loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : readOnly ? (
          detail && (
            <div>
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label={t('approvalTemplate.fieldOrganization')} span={2}>
                  <OrganizationName id={detail.organization_id} />
                </Descriptions.Item>
                <Descriptions.Item label={t('approvalTemplate.fieldName')} span={2}>
                  {detail.name}
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
            {!isEdit && (
              <Form.Item
                name="organization_id"
                label={t('approvalTemplate.fieldOrganization')}
                rules={[
                  { required: true, message: t('approvalTemplate.organizationRequired') },
                ]}
                extra={t('approvalTemplate.fieldOrganizationHint')}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={orgsLoading}
                  placeholder={t('approvalTemplate.fieldOrganizationPlaceholder')}
                  options={orgOptions}
                />
              </Form.Item>
            )}
            {isEdit && detail && (
              <Form.Item label={t('approvalTemplate.fieldOrganization')}>
                <OrganizationName id={detail.organization_id} />
              </Form.Item>
            )}
            <Row gutter={16}>
              <Col span={24}>
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
              </Col>
            </Row>
            {/* 启用状态 */}
            <Row gutter={16}>
              <Col span={12}>
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
              </Col>
            </Row>
            <Form.Item
              name="description"
              label={t('approvalTemplate.fieldDescription')}
            >
              <Input.TextArea
                rows={5}
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
          positionOptions={positionOptions.map((option) => ({ ...option, label: positionLabel(option.value, option.label) }))}
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
