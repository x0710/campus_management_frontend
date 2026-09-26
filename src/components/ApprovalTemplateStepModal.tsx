/**
 * 审批步骤表单弹窗（可复用组件）：新增 / 编辑审批模板下的一个步骤。
 * - create：空表单（默认值填充，不使用业务数据），提交 POST /api/approvals/templates/{template_id}/steps；
 * - edit  ：用传入的步骤数据回填，提交 PATCH /api/approvals/templates/{template_id}/steps/{step_id}；
 * 保存成功后回调 onSaved，由调用方强制刷新模板详情（代码要求 13）。
 * position / assignee_value / description 均为可选，留空时提交 null。
 * 注意：position 落库为职位编码，approval_template_step 表对其有外键约束（REFERENCES position(code)），
 * 因此该字段为「职位下拉选择」，禁止自由输入非法编码。
 * 下拉选项由父组件（模板详情弹窗）统一加载后传入：value 为职位编码（提交值），label 为职位名称（展示值），
 * 保证表格「审批人角色」列与下拉框展示一致。
 */
import { App as AntdApp, Form, Input, InputNumber, Modal, Select } from 'antd'
import { useEffect, useState } from 'react'
import { addApprovalTemplateStep, updateApprovalTemplateStep } from '../api/approvalmodel'
import type { ApprovalStep } from '../api/types/approvalmodel'
import { extractErrorReason } from '../api/common'
import {
  APPROVAL_STEP_ASSIGNEE_MAX_LENGTH,
  APPROVAL_STEP_DESC_MAX_LENGTH,
  APPROVAL_STEP_NO_MAX,
  APPROVAL_STEP_NO_MIN,
} from '../config/approvalTemplate'
import { useT } from '../i18n'

/** 弹窗模式：新增 / 编辑 */
export type ApprovalTemplateStepMode = 'create' | 'edit'

/** 步骤表单字段 */
interface StepFormValues {
  step_no?: number
  position?: string
  assignee_value?: string
  description?: string
}

interface ApprovalTemplateStepModalProps {
  /** 是否打开（必填） */
  open: boolean
  /** 模式（必填，默认 create） */
  mode: ApprovalTemplateStepMode
  /** 所属模板 ID（必填） */
  templateId: number
  /** 编辑模式下的步骤数据（edit 模式必填，create 模式可为空） */
  step?: ApprovalStep | null
  /** 职位下拉选项（必填，value 为职位编码、label 为职位名称，由父组件加载后传入） */
  positionOptions: { value: string; label: string }[]
  /** 职位下拉是否加载中（必填，用于展示 loading 状态） */
  positionsLoading: boolean
  /** 取消/关闭时触发（必填） */
  onCancel: () => void
  /** 保存成功后触发，用于刷新模板详情（必填） */
  onSaved: () => void
}

export default function ApprovalTemplateStepModal({
  open,
  mode,
  templateId,
  step,
  positionOptions,
  positionsLoading,
  onCancel,
  onSaved,
}: ApprovalTemplateStepModalProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm<StepFormValues>()
  const [saving, setSaving] = useState(false)

  /** 统一错误提示：带 HTTP 状态码与中文原因（代码要求 9） */
  const showError = (err: unknown) => {
    message.error(extractErrorReason(err, t))
  }

  // 打开时初始化：新增用默认空值，编辑用传入数据回填
  useEffect(() => {
    if (!open) return
    if (mode === 'create' || !step) {
      form.resetFields()
      return
    }
    form.setFieldsValue({
      step_no: step.step_no,
      position: step.position ?? undefined,
      assignee_value: step.assignee_value ?? undefined,
      description: step.description ?? undefined,
    })
  }, [open, mode, step, form])

  /** 提交：新增 → POST；编辑 → PATCH */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        step_no: values.step_no as number,
        position: values.position?.trim() || null,
        assignee_value: values.assignee_value?.trim() || null,
        description: values.description?.trim() || null,
      }
      if (mode === 'edit' && step) {
        await updateApprovalTemplateStep(templateId, step.id, payload)
        message.success(t('approvalTemplate.stepUpdateSuccess'))
      } else {
        await addApprovalTemplateStep(templateId, payload)
        message.success(t('approvalTemplate.stepCreateSuccess'))
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

  return (
    <Modal
      open={open}
      title={mode === 'edit' ? t('approvalTemplate.stepEditTitle') : t('approvalTemplate.stepCreateTitle')}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => void submit()}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="step_no"
          label={t('approvalTemplate.fieldStepNo')}
          rules={[{ required: true, message: t('approvalTemplate.stepNoRequired') }]}
          extra={t('approvalTemplate.fieldStepNoPlaceholder')}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={APPROVAL_STEP_NO_MIN}
            max={APPROVAL_STEP_NO_MAX}
            precision={0}
          />
        </Form.Item>
        <Form.Item
          name="position"
          label={t('approvalTemplate.fieldStepPosition')}
          extra={t('approvalTemplate.fieldStepPositionHint')}
        >
          <Select
            allowClear
            showSearch
            loading={positionsLoading}
            options={positionOptions}
            placeholder={t('approvalTemplate.fieldStepPositionPlaceholder')}
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item name="assignee_value" label={t('approvalTemplate.fieldStepAssignee')}>
          <Input
            maxLength={APPROVAL_STEP_ASSIGNEE_MAX_LENGTH}
            placeholder={t('approvalTemplate.fieldStepAssigneePlaceholder')}
          />
        </Form.Item>
        <Form.Item name="description" label={t('approvalTemplate.fieldStepDescription')}>
          <Input.TextArea
            rows={3}
            maxLength={APPROVAL_STEP_DESC_MAX_LENGTH}
            showCount
            placeholder={t('approvalTemplate.fieldStepDescriptionPlaceholder')}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}