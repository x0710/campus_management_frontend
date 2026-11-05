import { usePositionLabel } from '../../composables/usePositionLabel'
/**
 * 领导端：审批指标（审批模板）详情页。
 *
 * 从「指标」模块列表双击整行或「详情」按钮进入，作为 PortalWorkspace 的子路由渲染
 * （路由：/portal/:portalKey/approval-templates/:id?from=<moduleKey>），
 * 不再使用弹窗，刷新后仍可通过 URL 中的指标 ID 恢复。
 *
 * 页面空间分配：
 *   - 左栏「指标信息」：编码、名称、业务类型、启用状态、创建/更新时间，
 *     以及整块展示的「加分细则」（模板 description 字段）；
 *   - 右栏「审批步骤」：步骤表格（编号 / 审批人角色 / 审批人参数 / 步骤说明 / 操作），
 *     支持新增、编辑、删除步骤；编辑指标基础信息沿用原有编辑弹窗。
 *
 * 接口：
 *   GET    /api/approvals/templates/{id}       指标详情（含审批步骤）
 *   DELETE /api/approvals/templates/{id}/steps/{stepId}   删除步骤
 *   PATCH  /api/approvals/templates/{id}       更新指标（编辑弹窗内触发）
 *   GET    /api/positions                      职位列表（审批人角色编码 → 名称）
 */
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Col,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Row,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import {
  deleteApprovalTemplateStep,
  getApprovalTemplateDetail,
  updateApprovalTemplate,
} from '../../api/approvalmodel'
import { extractErrorReason } from '../../api/common'
import { queryPositions } from '../../api/positions'
import type { ApprovalStep, ApprovalTemplateDetail } from '../../api/types/approvalmodel'
import ApprovalTemplateStepModal, {
  type ApprovalTemplateStepMode,
} from '../../components/ApprovalTemplateStepModal'
import { PARTY_TEMPLATE_BUSINESS_TYPE } from '../../config/partyDeclaration'
import ErrorState from '../../components/ErrorState'
import OrganizationName from '../../components/OrganizationName'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import {
  APPROVAL_POSITION_FETCH_SIZE,
  APPROVAL_TEMPLATE_DESC_MAX_LENGTH,
  APPROVAL_TEMPLATE_NAME_MAX_LENGTH,
} from '../../config/approvalTemplate'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** 步骤弹窗状态：关闭 / 新增 / 编辑（编辑携带步骤数据） */
interface StepModalState {
  mode: ApprovalTemplateStepMode
  step?: ApprovalStep
}

/** 指标信息卡片内联编辑表单值 */
interface TemplateInfoFormValues {
  name: string
  enabled: boolean
  description?: string
}

export default function ApprovalTemplateDetailPage() {
  const t = useT()
  const positionLabel = usePositionLabel()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const { portalKey, id } = useParams<{ portalKey: string; id: string }>()
  /** 来源模块：用于返回指标列表与父布局侧栏高亮 */
  const fromModuleKey = new URLSearchParams(location.search).get('from')

  const [detail, setDetail] = useState<ApprovalTemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [positionOptions, setPositionOptions] = useState<
    { value: string; label: string }[]
  >([])
  const [positionsLoading, setPositionsLoading] = useState(false)
  /** 指标信息卡片内联编辑状态：查看 / 编辑 */
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [infoForm] = Form.useForm<TemplateInfoFormValues>()
  const [stepModal, setStepModal] = useState<StepModalState | null>(null)
  const [deletingStepId, setDeletingStepId] = useState<number | null>(null)

  const reportError = useErrorFeedback()

  const load = useCallback(
    async (force = false) => {
      const numId = Number(id)
      if (!Number.isFinite(numId) || numId <= 0) {
        setError(t('common.loadFailed'))
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        setDetail(await getApprovalTemplateDetail(numId, force))
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) return
        setError(extractErrorReason(err, t))
      } finally {
        setLoading(false)
      }
    },
    [id, t],
  )

  useEffect(() => {
    void load()
  }, [load])

  /** 职位列表：审批步骤的 position 存职位编码，展示时需要映射为职位名称 */
  useEffect(() => {
    let cancelled = false
    setPositionsLoading(true)
    queryPositions({ page: 1, page_size: APPROVAL_POSITION_FETCH_SIZE })
      .then((res) => {
        if (!cancelled) {
          setPositionOptions(
            res.data.map((position) => ({
              value: position.code,
              label: position.name,
            })),
          )
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPositionOptions([])
          reportError(err)
        }
      })
      .finally(() => {
        if (!cancelled) setPositionsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reportError])

  /** 职位编码 → 职位名称映射（未命中时回退显示编码，兼容职位被删除的历史数据） */
  const positionNameMap = useMemo(
    () => new Map(positionOptions.map((position) => [position.value, position.label])),
    [positionOptions],
  )

  /** 审批步骤按步骤编号升序展示 */
  const steps = useMemo(
    () => [...(detail?.steps ?? [])].sort((a, b) => a.step_no - b.step_no),
    [detail],
  )

  /** 返回指标列表；没有来源模块信息时回退门户首页 */
  const backToList = useCallback(() => {
    if (portalKey && fromModuleKey) {
      navigate(`/portal/${portalKey}/${fromModuleKey}`)
    } else if (portalKey) {
      navigate(`/portal/${portalKey}`)
    } else if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }, [portalKey, fromModuleKey, navigate])

  /** 进入指标信息卡片内联编辑：回填当前详情 */
  const startEdit = useCallback(() => {
    if (!detail) return
    infoForm.setFieldsValue({
      name: detail.name,
      enabled: Boolean(detail.enabled),
      description: detail.description ?? undefined,
    })
    setEditing(true)
  }, [detail, infoForm])

  /** 取消内联编辑：丢弃未保存内容并恢复卡片展示态 */
  const cancelEdit = useCallback(() => {
    setEditing(false)
    infoForm.resetFields()
  }, [infoForm])

  /** 保存指标信息：直接在卡片内提交 PATCH，成功后刷新详情 */
  const saveInfo = useCallback(async () => {
    if (!detail) return
    try {
      const values = await infoForm.validateFields()
      setSaving(true)
      await updateApprovalTemplate(detail.id, {
        name: values.name.trim(),
        business_type: PARTY_TEMPLATE_BUSINESS_TYPE,
        enabled: values.enabled,
        description: values.description?.trim() ? values.description.trim() : null,
      })
      message.success(t('approvalTemplate.updateSuccess'))
      setEditing(false)
      await load(true)
    } catch (err) {
      // 表单校验失败由 antd 在字段下方提示，不再额外弹出统一错误
      if (typeof err === 'object' && err !== null && 'errorFields' in err) return
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }, [detail, infoForm, load, message, t, reportError])

  /** 删除审批步骤：成功后强制刷新详情，保证表格与服务端一致 */
  const doDeleteStep = useCallback(
    async (stepId: number) => {
      if (!detail) return
      setDeletingStepId(stepId)
      try {
        await deleteApprovalTemplateStep(detail.id, stepId)
        message.success(t('approvalTemplate.stepDeleteSuccess'))
        await load(true)
      } catch (err) {
        reportError(err)
      } finally {
        setDeletingStepId(null)
      }
    },
    [detail, load, message, t, reportError],
  )

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
        render: (value: string | null) =>
          value ? positionLabel(value, positionNameMap.get(value)) : <span className="cell-sub">—</span>,
      },
      {
        title: t('approvalTemplate.colStepAssignee'),
        dataIndex: 'assignee_value',
        key: 'assignee_value',
        width: 130,
        render: (value: string | null) =>
          value == null || value === '' ? <span className="cell-sub">—</span> : String(value),
      },
      {
        title: t('approvalTemplate.colStepDescription'),
        dataIndex: 'description',
        key: 'description',
        render: (value: string | null) =>
          value || <span className="cell-sub">—</span>,
      },
      {
        title: t('approvalTemplate.colStepActions'),
        key: 'action',
        width: 170,
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
    [t, positionNameMap, positionLabel, deletingStepId, doDeleteStep],
  )

  return (
    <div className="party-approval-detail">
      <div className="party-approval-detail-header">
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={backToList}>
          {t('approvalTemplate.backToList')}
        </Button>
        <div className="party-approval-detail-title">
          <h3>{detail?.name ?? t('approvalTemplate.detailTitle')}</h3>
          {detail ? (
            <Tag color={detail.enabled ? 'success' : 'default'}>
              {detail.enabled
                ? t('approvalTemplate.enabled_yes')
                : t('approvalTemplate.enabled_no')}
            </Tag>
          ) : null}
        </div>
        <Tooltip title={t('approvalTemplate.refreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => {
              // 刷新会重新拉取详情，若正在编辑则退出编辑态，避免表单值覆盖服务端结果
              setEditing(false)
              void load(true)
            }}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load(true)} />
      ) : loading && !detail ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : detail ? (
        <div className="party-approval-detail-layout approval-template-detail-layout">
          {/* 左栏：指标基础信息 + 加分细则；编辑入口位于卡片右上角，编辑时在卡片内展开表单 */}
          <section className="panel-card">
            <header className="panel-card-header">
              <h3 className="panel-card-title">{t('approvalTemplate.infoTitle')}</h3>
              {editing ? (
                <Space size={8}>
                  <Button size="small" onClick={cancelEdit}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    loading={saving}
                    onClick={() => void saveInfo()}
                  >
                    {t('common.save')}
                  </Button>
                </Space>
              ) : (
                <Tooltip title={t('approvalTemplate.editInfoHint')}>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={startEdit}
                  >
                    {t('approvalTemplate.edit')}
                  </Button>
                </Tooltip>
              )}
            </header>
            <div className="panel-card-body">
              {editing ? (
                <Form
                  form={infoForm}
                  layout="vertical"
                  className="approval-template-info-form"
                >
                  <Row gutter={16}>
                    <Col span={24}>
                      <Form.Item label={t('approvalTemplate.fieldOrganization')}>
                        <OrganizationName id={detail.organization_id} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        name="name"
                        label={t('approvalTemplate.fieldName')}
                        rules={[
                          { required: true, message: t('approvalTemplate.nameRequired') },
                        ]}
                      >
                        <Input
                          maxLength={APPROVAL_TEMPLATE_NAME_MAX_LENGTH}
                          placeholder={t('approvalTemplate.fieldName')}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="enabled"
                        label={t('approvalTemplate.fieldEnabled')}
                        valuePropName="checked"
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
                      rows={8}
                      maxLength={APPROVAL_TEMPLATE_DESC_MAX_LENGTH}
                      showCount
                      placeholder={t('approvalTemplate.fieldDescriptionPlaceholder')}
                    />
                  </Form.Item>
                </Form>
              ) : (
                <>
                  <Descriptions column={1} bordered size="small">
                    <Descriptions.Item label={t('approvalTemplate.fieldOrganization')}>
                      <OrganizationName id={detail.organization_id} />
                    </Descriptions.Item>
                    <Descriptions.Item label={t('approvalTemplate.fieldName')}>
                      {detail.name}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('approvalTemplate.fieldEnabled')}>
                      <Tag color={detail.enabled ? 'success' : 'default'}>
                        {detail.enabled
                          ? t('approvalTemplate.enabled_yes')
                          : t('approvalTemplate.enabled_no')}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t('approvalTemplate.fieldCreatedAt')}>
                      {formatDateTime(detail.created_at, locale)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('approvalTemplate.fieldUpdatedAt')}>
                      {formatDateTime(detail.updated_at, locale)}
                    </Descriptions.Item>
                  </Descriptions>
                  <div className="party-approval-reason-block">
                    <div className="party-approval-reason-label">
                      {t('approvalTemplate.fieldDescription')}
                    </div>
                    <div className="party-approval-reason-content">
                      {detail.description?.trim() ? detail.description : '—'}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* 右栏：审批步骤 */}
          <section className="panel-card">
            <header className="panel-card-header">
              <h3 className="panel-card-title">{t('approvalTemplate.stepsTitle')}</h3>
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
            </header>
            <div className="panel-card-body">
              <Table<ApprovalStep>
                rowKey="id"
                size="small"
                columns={stepColumns}
                dataSource={steps}
                pagination={false}
                locale={{ emptyText: t('approvalTemplate.stepsEmpty') }}
              />
            </div>
          </section>
        </div>
      ) : null}

      {/* 编辑指标基础信息已改为卡片内联编辑，不再使用弹窗 */}
      {detail ? (
        <ApprovalTemplateStepModal
          open={stepModal !== null}
          mode={stepModal?.mode ?? 'create'}
          templateId={detail.id}
          step={stepModal?.step ?? null}
          positionOptions={positionOptions.map((option) => ({ ...option, label: positionLabel(option.value, option.label) }))}
          positionsLoading={positionsLoading}
          onCancel={() => setStepModal(null)}
          onSaved={() => {
            setStepModal(null)
            void load(true)
          }}
        />
      ) : null}
    </div>
  )
}
