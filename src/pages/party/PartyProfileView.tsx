import { BellOutlined } from '@ant-design/icons'
import { Alert, Collapse, Descriptions, Empty, Spin, Steps, Tabs, Tag } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { getApprovalTemplateDetail, queryApprovalTemplates } from '../../api/approvalmodel'
import { extractErrorReason } from '../../api/common'
import type { ApprovalStep, ApprovalTemplate } from '../../api/types/approvalmodel'
import ErrorState from '../../components/ErrorState'
import PartyScoreRecords from '../../components/PartyScoreRecords'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import {
  APPROVAL_TEMPLATE_PAGE_SIZE,
  getBusinessTypeColor,
  getBusinessTypeLabel,
} from '../../config/approvalTemplate'
import { useCurrentIdentity } from '../../composables/useCurrentIdentity'
import { usePositionNames } from '../../composables/usePositionNames'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'

/**
 * 党员端：我的（我的成绩记录 / 年度评价报告 / 消息通知 / 审批指南 / 关于井大大先锋）。
 * 「我的档案」中的姓名与所属支部：经 useCurrentIdentity 取当前登录用户真实姓名与任职组织，
 * 姓名取不到时回退账户名，组织无任职时回退占位符（不使用业务数据做默认填充）。
 * 其余档案字段与成绩记录仍为【模拟数据预览】，后端尚未提供党员端相关接口。
 * 我的成绩记录：复用总成绩概览（PartyScoreSummary）与成绩记录表格（PartyScoreRecords）。
 */

/** 消息通知（模拟数据；字段对应 i18n 文案 key） */
const MOCK_NOTIFICATIONS: { id: string; titleKey: string; timeKey: string; bodyKey: string }[] = [
  {
    id: 'n1',
    titleKey: 'partyProfile.notif_1_title',
    timeKey: 'partyProfile.notif_1_time',
    bodyKey: 'partyProfile.notif_1_body',
  },
  {
    id: 'n2',
    titleKey: 'partyProfile.notif_2_title',
    timeKey: 'partyProfile.notif_2_time',
    bodyKey: 'partyProfile.notif_2_body',
  },
  {
    id: 'n3',
    titleKey: 'partyProfile.notif_3_title',
    timeKey: 'partyProfile.notif_3_time',
    bodyKey: 'partyProfile.notif_3_body',
  },
]

/** 我的档案：基本信息 */
function ProfileDescriptions() {
  const t = useT()
  const username = useAuthStore((s) => s.username)
  const { name, organizations } = useCurrentIdentity()

  // 姓名：真实姓名优先，取不到时回退账户名，最后回退占位符
  const displayName = name?.trim() || username || t('common.unknown')
  // 所属支部：取第一项任职组织名称，无任职时回退占位符
  const displayBranch = organizations[0] || t('common.unknown')

  const items = [
    { key: 'name', label: t('partyProfile.fieldName'), children: displayName },
    { key: 'phone', label: t('partyProfile.fieldPhone'), children: t('partyProfile.valuePhone') },
    { key: 'gender', label: t('partyProfile.fieldGender'), children: t('partyProfile.valueGender') },
    {
      key: 'memberNo',
      label: t('partyProfile.fieldMemberNo'),
      children: t('partyProfile.valueMemberNo'),
    },
    { key: 'branch', label: t('partyProfile.fieldBranch'), children: displayBranch },
    {
      key: 'political',
      label: t('partyProfile.fieldPoliticalStatus'),
      children: t('partyProfile.valuePoliticalStatus'),
    },
    {
      key: 'joinDate',
      label: t('partyProfile.fieldJoinDate'),
      children: t('partyProfile.valueJoinDate'),
    },
    { key: 'email', label: t('partyProfile.fieldEmail'), children: t('partyProfile.valueEmail') },
  ]
  return <Descriptions column={2} items={items} />
}

/** 占位内容（年度评价报告 / 关于井大大先锋 暂不实现） */
function Placeholder() {
  const t = useT()
  return (
    <div className="party-placeholder">
      <Empty description={t('partyProfile.emptyHint')} />
    </div>
  )
}

/**
 * 审批指南：展示已启用的审批模板及其审批流程。
 * 列表取 GET /api/approvals/templates（会话缓存），只保留启用中的模板；
 * 展开某个模板时再按需请求 GET /api/approvals/templates/{id} 取步骤，避免一次性拉取全部详情。
 * 步骤中的「审批人角色」为职位编码，展示时映射为职位名称（映射失败回退编码）。
 */
function ApprovalGuide() {
  const t = useT()
  const positionNames = usePositionNames()
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)
  // 已加载的步骤详情：模板 ID → 步骤列表
  const [stepsByTemplate, setStepsByTemplate] = useState<Record<number, ApprovalStep[]>>({})
  // 正在请求步骤的模板 ID
  const [stepsLoading, setStepsLoading] = useState<number[]>([])
  // 步骤加载失败的模板 ID → 错误文案
  const [stepsError, setStepsError] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    queryApprovalTemplates({ page: 1, page_size: APPROVAL_TEMPLATE_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return
        // 后端 enabled 为 i8（1 启用 / 0 停用），审批指南只展示启用中的模板
        setTemplates(res.data.filter((row) => !!row.enabled))
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorReason(err, t))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadSeq, t])

  /** 重新拉取模板列表：先切回加载态并清空错误，再触发 effect 重查 */
  const reloadTemplates = () => {
    setError(null)
    setLoading(true)
    setReloadSeq((prev) => prev + 1)
  }

  const loadSteps = useCallback(
    async (templateId: number) => {
      setStepsLoading((prev) => (prev.includes(templateId) ? prev : [...prev, templateId]))
      setStepsError((prev) => {
        if (!(templateId in prev)) return prev
        const next = { ...prev }
        delete next[templateId]
        return next
      })
      try {
        const detail = await getApprovalTemplateDetail(templateId)
        setStepsByTemplate((prev) => ({ ...prev, [templateId]: detail.steps ?? [] }))
      } catch (err) {
        setStepsError((prev) => ({ ...prev, [templateId]: extractErrorReason(err, t) }))
      } finally {
        setStepsLoading((prev) => prev.filter((id) => id !== templateId))
      }
    },
    [t],
  )

  /** 展开模板时懒加载其步骤详情（已加载 / 加载中 / 失败的不重复请求） */
  const handleExpand = (keys: string | string[]) => {
    const opened = Array.isArray(keys) ? keys : [keys]
    opened.forEach((key) => {
      const templateId = Number(key)
      if (
        stepsByTemplate[templateId] === undefined &&
        !stepsError[templateId] &&
        !stepsLoading.includes(templateId)
      ) {
        void loadSteps(templateId)
      }
    })
  }

  const renderSteps = (template: ApprovalTemplate) => {
    if (stepsLoading.includes(template.id)) {
      return (
        <div className="party-guide-loading">
          <Spin size="small" />
          <span>{t('common.loading')}</span>
        </div>
      )
    }
    const stepError = stepsError[template.id]
    if (stepError) {
      return <ErrorState message={stepError} onRetry={() => void loadSteps(template.id)} />
    }
    const steps = [...(stepsByTemplate[template.id] ?? [])].sort((a, b) => a.step_no - b.step_no)
    if (steps.length === 0) {
      return (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('partyProfile.guideStepsEmpty')} />
      )
    }
    return (
      <Steps
        direction="vertical"
        size="small"
        items={steps.map((step) => {
          const role = step.position
            ? positionNames.get(step.position) ?? step.position
            : step.assignee_value ?? t('partyProfile.guideRoleUnset')
          const parts = []
          if (step.description?.trim()) parts.push(<div key="desc">{step.description}</div>)
          if (step.position && step.assignee_value) {
            parts.push(
              <div key="assignee">
                {t('partyProfile.guideAssignee', { value: step.assignee_value })}
              </div>,
            )
          }
          return {
            // 统一所有步骤为「进行中」态（process），让每步的圆圈与文字颜色都和第一步一致，
            // 避免 antd 默认仅把第 1 步高亮为蓝色、后续步骤置灰造成颜色不统一。
            status: 'process' as const,
            title: t('partyProfile.guideStepTitle', { no: step.step_no, role }),
            description: parts.length > 0 ? <>{parts}</> : undefined,
          }
        })}
      />
    )
  }

  if (loading) {
    return (
      <div className="party-placeholder">
        <Spin />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={reloadTemplates} />
  }

  if (templates.length === 0) {
    return (
      <div className="party-placeholder">
        <Empty description={t('partyProfile.guideEmpty')} />
      </div>
    )
  }

  return (
    <div className="party-guide">
      <Alert type="info" showIcon title={t('partyProfile.guideHint')} className="party-guide-hint" />
      <Collapse
        items={templates.map((template) => ({
          key: String(template.id),
          label: (
            <span className="party-guide-title">
              <span>{template.name}</span>
              <Tag color={getBusinessTypeColor(template.business_type)}>
                {getBusinessTypeLabel(template.business_type, t)}
              </Tag>
              <Tag color="geekblue">{template.code}</Tag>
            </span>
          ),
          children: (
            <div className="party-guide-body">
              {template.description?.trim() ? (
                <p className="party-guide-desc">{template.description}</p>
              ) : null}
              {renderSteps(template)}
            </div>
          ),
        }))}
        onChange={handleExpand}
      />
    </div>
  )
}

/** 消息通知列表 */
function NotificationsList() {
  const t = useT()
  return (
    <ul className="party-notif-list">
      {MOCK_NOTIFICATIONS.map((item) => (
        <li key={item.id} className="party-notif-item">
          <div className="party-notif-head">
            <span className="party-notif-title">
              <BellOutlined className="party-notif-icon" />
              {t(item.titleKey)}
            </span>
            <span className="party-notif-time">{t(item.timeKey)}</span>
          </div>
          <div className="party-notif-body">{t(item.bodyKey)}</div>
        </li>
      ))}
    </ul>
  )
}

export default function PartyProfileView() {
  const t = useT()

  const items = [
    { key: 'profile', label: t('partyProfile.tabProfile'), children: <ProfileDescriptions /> },
    {
      key: 'scores',
      label: t('partyProfile.tabScores'),
      children: (
        <div className="party-tab-body">
          <PartyScoreSummary />
          <PartyScoreRecords />
        </div>
      ),
    },
 
    { key: 'notifications', label: t('partyProfile.tabNotifications'), children: <NotificationsList /> },
    { key: 'guide', label: t('partyProfile.tabGuide'), children: <ApprovalGuide /> },
    { key: 'about', label: t('partyProfile.tabAbout'), children: <Placeholder /> },
  ]

  return (
    // 数据展示页固定布局：仅卡片体内的各 Tab 数据区滚动（代码要求 23）
    <div className="data-page-view">
      <section className="panel-card">
        <div className="panel-card-body">
          <Alert
            type="warning"
            showIcon
            title={t('common.mockHint')}
            style={{ marginBottom: 16 }}
          />
          <Tabs items={items} />
        </div>
      </section>
    </div>
  )
}
