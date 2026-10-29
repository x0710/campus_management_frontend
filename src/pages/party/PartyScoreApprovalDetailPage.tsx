/**
 * 党建活动加分审批详情页。
 *
 * 从审核列表点击整行或「通过 / 驳回 / 转交」进入，作为 PortalWorkspace 的子路由渲染，
 * 只输出内容区（顶栏 + 侧栏由父布局提供），刷新后仍可通过 URL 中的审批步骤 ID 恢复。
 *
 * 页面布局：
 *   - 左栏按「基础信息 / 审批流转 / 附件材料」分区展示审批内容；
 *   - 右栏为审批操作：默认进入「通过」表单，核定分数用申请分数预填，
 *     底部提供「取消 / 驳回 / 确认通过」，转交可通过卡片右上角入口切换。
 *
 * 关键行为：
 *   - 申请人通过 GET /api/users?ids= 批量解析真实姓名，查询失败时回退展示用户 ID；
 *   - 审批模板 ID 必须取自加分申请详情（列表项可能不返回 template_id），
 *     并用有效 ID 请求 GET /api/approvals/templates/{id} 解析模板名称，
 *     取不到名称时回退展示模板 ID，不编造名称，也不发送 templates/undefined；
 *   - 审批通过前必须填写「核定分数」：后端 reviewed_score 为必填 DecimalText，
 *     前端用 stringMode InputNumber 采集并以字符串提交，避免小数精度丢失。
 *
 * 数据源：
 *   GET /api/approvals                       分页查找 URL 中的审批步骤（无单步骤详情接口）
 *   GET /api/party-scores?approval_instance_id=…  审批实例反查加分申请
 *   GET /api/party-scores/{id}               加分申请详情（含附件下载地址与模板 ID）
 *   GET /api/approvals/templates/{id}        审批模板名称
 *   PUT /api/party-scores/approvals/{id}/approve|reject|transfer  审批操作
 *   GET /api/users                           搜索转交对象
 */
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Tag,
  Tooltip,
} from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { getApprovalTemplateDetail } from '../../api/approvalmodel'
import { findApprovalStepById, getApprovalRecords } from '../../api/approvals'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import {
  approvePartyScore,
  getPartyScore,
  queryPartyScores,
  rejectPartyScore,
  transferPartyScore,
} from '../../api/partyScores'
import type { ApprovalInstanceStep, ApprovalRecordItem } from '../../api/types/approvals'
import type { PartyScoreDetail } from '../../api/types/partyScores'
import { queryUsers } from '../../api/users'
import AttachmentLinks from '../../components/AttachmentLinks'
import ErrorState from '../../components/ErrorState'
import {
  isPartyScoreStepActionable,
  PARTY_SCORE_APPROVAL_STATUS_COLOR,
  PARTY_SCORE_TRANSFER_USER_PAGE_SIZE,
} from '../../config/partyScoreApproval'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { useUserNames } from '../../composables/useUserNames'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'
import { formatPartyScore, isNegativePartyScore } from '../../utils/partyScore'

/** 审批动作类型：通过 / 驳回 / 转交 */
type ApprovalAction = 'approve' | 'reject' | 'transfer'

/**
 * 审批操作表单模式：
 * - approve：通过表单（含核定分数），底部同时提供驳回按钮；
 * - transfer：转交表单（含转交对象）。
 */
type ActionMode = 'approve' | 'transfer'

/** 审批操作表单值（核定分数为 Decimal 字符串；转交对象按动作类型按需填写） */
interface ActionFormValues {
  comment: string
  reviewed_score?: string
  transfer_to?: number
}

/**
 * 判断 URL 查询参数是否为受支持的审批动作。
 * @param raw 原始参数（可能为 null）
 * @returns 合法动作类型；不合法时返回 null
 */
function normalizeAction(raw: string | null): ApprovalAction | null {
  return raw === 'approve' || raw === 'reject' || raw === 'transfer' ? raw : null
}

/**
 * 列表操作列预选的审批动作 → 详情页表单模式。
 * 「通过」「驳回」共用同一个审批表单（驳回按钮在表单底部），仅转交需要单独表单。
 * @param action 列表页传入的动作（可能为 null）
 * @returns approve / transfer 表单模式
 */
function toActionMode(action: ApprovalAction | null): ActionMode {
  return action === 'transfer' ? 'transfer' : 'approve'
}

/**
 * 路由入口：以审批步骤 ID 作为 key，切换步骤时强制重建页面，
 * 避免上一页的加载结果、操作表单与预选动作残留（无需再用 effect 手动清空 state）。
 */
export default function PartyScoreApprovalDetailPage() {
  const { stepId } = useParams<{ stepId: string }>()
  return <PartyScoreApprovalDetail key={stepId ?? 'missing'} />
}

/**
 * 党建活动加分审批详情页（内容区）。
 * 路由：/portal/:portalKey/party-score-approvals/:stepId?from=<moduleKey>&action=<动作>
 */
function PartyScoreApprovalDetail() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const navigate = useNavigate()
  const location = useLocation()
  const { portalKey, stepId: stepIdParam } = useParams<{
    portalKey: string
    stepId: string
  }>()

  /** 来源模块：用于返回审核列表与父布局侧栏高亮 */
  const fromModuleKey = new URLSearchParams(location.search).get('from')
  /** 操作列进入时预选的审批动作 */
  const initialAction = normalizeAction(new URLSearchParams(location.search).get('action'))

  const [step, setStep] = useState<ApprovalInstanceStep | null>(null)
  const [score, setScore] = useState<PartyScoreDetail | null>(null)
  /** 审批模板名称：undefined 表示加载中；null 表示取不到（回退展示模板 ID） */
  const [templateName, setTemplateName] = useState<string | null | undefined>(undefined)
  /** 审批流转记录：按环节顺序展示操作人、决定、意见与时间 */
  const [approvalRecords, setApprovalRecords] = useState<ApprovalRecordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [myUid, setMyUid] = useState<number | null>(null)
  /** 正在提交的审批动作：null 表示空闲；用于只让当前按钮展示加载态 */
  const [submittingAction, setSubmittingAction] = useState<ApprovalAction | null>(null)
  const [actionMode, setActionMode] = useState<ActionMode>(toActionMode(initialAction))
  const [actionForm] = Form.useForm<ActionFormValues>()
  /** 操作成功后延迟返回上一层，组件卸载时清理定时器避免误跳转 */
  const returnTimerRef = useRef<number | null>(null)

  /** 转交对象搜索选项与加载态 */
  const [transferUsers, setTransferUsers] = useState<{ value: number; label: string }[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)

  /** 申请人真实姓名：审批详情就绪后批量查询（失败时 Map 中为 null，回退展示用户 ID） */
  const userNames = useUserNames(score ? [score.user_id] : [])

  /** 审批流转记录涉及的用户：操作人与转交目标 */
  const recordUserIds = useMemo(
    () =>
      approvalRecords.flatMap((record) => [
        record.operator_id,
        ...(record.transfer_to === null ? [] : [record.transfer_to]),
      ]),
    [approvalRecords],
  )
  const recordUserNames = useUserNames(recordUserIds)

  /** 审批记录决定文案：agree/reject/transfer 映射为现有操作文案 */
  const recordDecisionText = useCallback(
    (decision: ApprovalRecordItem['decision']) =>
      decision === 'agree'
        ? t('partyScoreApproval.approve')
        : decision === 'reject'
          ? t('partyScoreApproval.reject')
          : t('partyScoreApproval.transfer'),
    [t],
  )

  const load = useCallback(
    async (force = false) => {
      const stepId = Number(stepIdParam)
      if (!Number.isFinite(stepId) || stepId <= 0) {
        setError(t('partyScoreApproval.stepNotFound'))
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        // 显式传 approver_id，避免依赖后端「缺省即本人」的隐式行为
        const me = await getCurrentUser()
        setMyUid(me.uid)

        const foundStep = await findApprovalStepById(stepId, me.uid, force)
        if (!foundStep) {
          setStep(null)
          setScore(null)
          setError(t('partyScoreApproval.stepNotFound'))
          return
        }
        setStep(foundStep)

        // 审批步骤不含业务字段，按审批实例精确反查加分申请
        const list = await queryPartyScores(
          {
            approval_instance_id: foundStep.instance_id,
            page: 1,
            page_size: 1,
          },
          force,
        )
        const summary = list.data[0]
        if (!summary) {
          setScore(null)
          setError(t('partyScoreApproval.emptyScore'))
          return
        }

        // 详情接口补充附件下载地址与模板 ID；失败时仍展示列表字段（附件区为空）
        let loadedScore: PartyScoreDetail = {
          ...summary,
          // 列表摘要可能不带 template_id；详情请求失败时用 0 表示未知，避免伪造有效模板
          template_id: summary.template_id ?? 0,
          file_urls: summary.file_urls ?? [],
        }
        try {
          loadedScore = await getPartyScore(summary.id, force)
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 401) return
        }
        setScore(loadedScore)

        try {
          const records = await getApprovalRecords(foundStep.instance_id, force)
          setApprovalRecords(records)
        } catch {
          // 审批记录仅用于流转展示，接口失败时保持空列表，不影响详情主体
          setApprovalRecords([])
        }

        /*
         * 模板名称：必须以加分申请详情里的 template_id 请求模板详情。
         * 列表接口的加分申请摘要可能不返回 template_id，直接使用会让请求变成
         * GET /api/approvals/templates/undefined；ID 无效时直接回退展示，不发送请求。
         */
        setTemplateName(undefined)
        const templateId = Number(loadedScore.template_id ?? summary.template_id)
        if (!Number.isFinite(templateId) || templateId <= 0) {
          setTemplateName(null)
        } else {
          try {
            const template = await getApprovalTemplateDetail(templateId, force)
            setTemplateName(template.name?.trim() || null)
          } catch {
            setTemplateName(null)
            /* 名称取不到时回退展示模板 ID */
          }
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          // 401 由全局拦截器处理，这里不重复提示
        } else {
          setError(extractErrorReason(err, t))
        }
      } finally {
        setLoading(false)
      }
    },
    [stepIdParam, t],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () => () => {
      if (returnTimerRef.current !== null) window.clearTimeout(returnTimerRef.current)
    },
    [],
  )

  /**
   * 通过表单的核定分数默认值：进入通过表单（或申请分数刷新）时预填申请加分。
   * 驳回按钮使用同一份表单，因此不会清空用户已填写的审批意见。
   */
  const requestedScore = score?.requested_score
  useEffect(() => {
    if (actionMode === 'approve' && requestedScore !== undefined) {
      actionForm.setFieldValue('reviewed_score', String(requestedScore))
    }
  }, [actionForm, actionMode, requestedScore])

  /** 返回审核列表：优先回到来源门户的审核模块；没有来源信息时回退历史/门户首页 */
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

  /** 审批操作成功后停留 3 秒，再返回上一层 */
  const scheduleBackAfterSuccess = useCallback(() => {
    if (returnTimerRef.current !== null) window.clearTimeout(returnTimerRef.current)
    returnTimerRef.current = window.setTimeout(() => {
      returnTimerRef.current = null
      backToList()
    }, 3000)
  }, [backToList])

  /** 切换审批表单模式：清空上一次表单，避免通过 / 转交之间串值 */
  const chooseMode = useCallback(
    (mode: ActionMode) => {
      setActionMode(mode)
      actionForm.resetFields()
      setTransferUsers([])
    },
    [actionForm],
  )

  /** 取消当前操作并返回审核列表 */
  const cancelAction = useCallback(() => {
    actionForm.resetFields()
    setTransferUsers([])
    backToList()
  }, [actionForm, backToList])

  /** 搜索可转交的审批人（按姓名或学号关键字） */
  const searchTransferUsers = useCallback(
    async (raw: string) => {
      const keyword = raw.trim()
      setSearchingUsers(true)
      try {
        if (!keyword) {
          setTransferUsers([])
          return
        }
        const res = await queryUsers({
          keyword,
          page: 1,
          page_size: PARTY_SCORE_TRANSFER_USER_PAGE_SIZE,
        })
        setTransferUsers(
          res.data
            .filter((user) => user.uid !== myUid)
            .map((user) => ({
              value: user.uid,
              label: user.name ? `${user.name}（${user.uid}）` : String(user.uid),
            })),
        )
      } catch (err) {
        reportError(err)
        setTransferUsers([])
      } finally {
        setSearchingUsers(false)
      }
    },
    [myUid, reportError],
  )

  /**
   * 提交审批动作。
   * 通过：校验核定分数 + 审批意见；驳回：只校验审批意见；转交：校验转交对象 + 审批意见。
   * @param kind 审批动作（必填）
   */
  const submitAction = async (kind: ApprovalAction) => {
    if (!step) return

    let values: ActionFormValues
    try {
      values = await actionForm.validateFields(
        kind === 'approve'
          ? ['reviewed_score', 'comment']
          : kind === 'transfer'
            ? ['transfer_to', 'comment']
            : ['comment'],
      )
    } catch {
      // 表单校验失败由 Form 内联提示，无需额外 toast
      return
    }

    const comment = (values.comment ?? '').trim()
    setSubmittingAction(kind)
    try {
      if (kind === 'approve') {
        const reviewed = values.reviewed_score
        if (reviewed === undefined || reviewed === null) {
          message.error(t('partyScoreApproval.reviewedScoreRequired'))
          return
        }
        await approvePartyScore(step.id, {
          comment,
          reviewed_score: reviewed,
        })
        message.success(t('partyScoreApproval.approveSuccess'))
      } else if (kind === 'reject') {
        await rejectPartyScore(step.id, { comment })
        message.success(t('partyScoreApproval.rejectSuccess'))
      } else {
        if (!values.transfer_to) {
          message.error(t('partyScoreApproval.transferTargetRequired'))
          return
        }
        await transferPartyScore(step.id, {
          transfer_to: values.transfer_to,
          comment,
        })
        message.success(t('partyScoreApproval.transferSuccess'))
      }

      actionForm.resetFields()
      // 操作成功后统一停留 3 秒返回上一层
      if (kind === 'transfer') {
        scheduleBackAfterSuccess()
        return
      }
      // 审批结果会改变步骤状态与核定分数，强制刷新当前详情
      await load(true)
      scheduleBackAfterSuccess()
    } catch (err) {
      reportError(err)
    } finally {
      setSubmittingAction(null)
    }
  }

  const actionable = step !== null && isPartyScoreStepActionable(step.status)
  const applicantName = score ? userNames.get(score.user_id) : undefined
  const busy = submittingAction !== null

  /** 审批意见常用回复：点击后直接填入意见输入框 */
  const commonReplies = useMemo(
    () => [
      t('partyScoreApproval.quickReplyApproveVerified'),
      t('partyScoreApproval.quickReplyApproveTrue'),
      t('partyScoreApproval.quickReplyNeedSupplement'),
      t('partyScoreApproval.quickReplyRejectInvalid'),
      t('partyScoreApproval.quickReplyTransfer'),
    ],
    [t],
  )

  return (
    <div className="party-approval-detail">
      <div className="party-approval-detail-header">
        <Button
          type="primary"
          icon={<ArrowLeftOutlined />}
          onClick={backToList}
        >
          {t('partyScoreApproval.backToList')}
        </Button>
        <div className="party-approval-detail-title">
          <h3>{t('partyScoreApproval.detailPageTitle')}</h3>
          {step ? (
            <Tag color={PARTY_SCORE_APPROVAL_STATUS_COLOR[step.status]}>
              {t(`partyScoreApproval.status_${step.status}`)}
            </Tag>
          ) : null}
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void load(true)}
        >
          {t('common.refresh')}
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load(true)} />
      ) : loading && (!step || !score) ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : step && score ? (
        <div className="party-approval-detail-layout">
          {/* 左栏：审批内容（基础信息 / 审批流转 / 附件材料） */}
          <section className="panel-card">
            <div className="panel-card-body">
              <section className="party-approval-section">
                <h4 className="party-approval-section-title">
                  {t('partyScoreApproval.basicInfoTitle')}
                </h4>
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label={t('partyScoreApproval.fieldId')}>
                    {score.id}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyScoreApproval.fieldApplicant')}>
                    {applicantName === undefined ? (
                      t('common.loading')
                    ) : applicantName ? (
                      applicantName
                    ) : (
                      <Tooltip title={t('partyScoreApproval.applicantNameFallback')}>
                        <span>{score.user_id}</span>
                      </Tooltip>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyScoreApproval.fieldTemplate')}>
                    {templateName === undefined
                      ? t('common.loading')
                      : (templateName ?? score.template_id ?? t('common.unknown'))}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyScoreApproval.fieldRequestedScore')}>
                    <span
                      className={
                        isNegativePartyScore(score.requested_score)
                          ? 'party-score-minus'
                          : 'party-score-plus'
                      }
                    >
                      {formatPartyScore(score.requested_score)}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyScoreApproval.fieldApprovedScore')}>
                    {formatPartyScore(score.approved_score)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyScoreApproval.fieldApprovalInstanceId')}>
                    {score.approval_instance_id}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyScoreApproval.fieldCreatedAt')}>
                    {formatDateTime(score.created_at, locale)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyScoreApproval.fieldUpdatedAt')}>
                    {formatDateTime(score.updated_at, locale)}
                  </Descriptions.Item>
                </Descriptions>
              </section>

              <section className="party-approval-section">
                <h4 className="party-approval-section-title">
                  {t('partyScoreApproval.flowSectionTitle')}
                </h4>
                {approvalRecords.length === 0 ? (
                  <div className="party-approval-flow-empty">
                    {t('partyScoreApproval.flowEmpty')}
                  </div>
                ) : (
                  <div className="party-approval-flow-list">
                    {approvalRecords.map((record) => {
                      const operatorName = recordUserNames.get(record.operator_id)
                      const transferName =
                        record.transfer_to === null
                          ? null
                          : recordUserNames.get(record.transfer_to)
                      return (
                        <div
                          key={record.id}
                          className={`party-approval-flow-item party-approval-flow-item--${record.decision}`}
                        >
                          <div className="party-approval-flow-head">
                            <span
                              className={`party-approval-flow-dot party-approval-flow-dot--${record.decision}`}
                            />
                            <span className="party-approval-flow-step">
                              {t('partyScoreApproval.stepOrderValue', {
                                n: String(record.step_order),
                              })}
                            </span>
                            <Tag
                              color={
                                record.decision === 'agree'
                                ? 'success'
                                : record.decision === 'reject'
                                  ? 'error'
                                  : 'processing'
                              }
                              className="party-approval-flow-decision-tag"
                            >
                              {recordDecisionText(record.decision)}
                            </Tag>
                            <span className="party-approval-flow-time">
                              {formatDateTime(record.created_at, locale)}
                            </span>
                          </div>
                          <div className="party-approval-flow-meta">
                            <span>
                              <span className="party-approval-flow-meta-label">
                                {t('partyScoreApproval.flowOperator')}
                              </span>
                              {operatorName === undefined
                                ? t('common.loading')
                                : (operatorName ?? record.operator_id)}
                            </span>
                            {record.transfer_to !== null && (
                              <span>
                                <span className="party-approval-flow-meta-label">
                                  {t('partyScoreApproval.flowTransferTo')}
                                </span>
                                {transferName === undefined
                                  ? t('common.loading')
                                  : (transferName ?? record.transfer_to)}
                              </span>
                            )}
                          </div>
                          <div className="party-approval-flow-comment">
                            <span className="party-approval-flow-comment-label">
                              {t('partyScoreApproval.flowComment')}
                            </span>
                            <span className="party-approval-flow-comment-text">
                              {record.comment || '—'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="party-approval-section">
                <h4 className="party-approval-section-title">
                  {t('partyScoreApproval.attachmentSectionTitle')}
                </h4>
                <AttachmentLinks
                  urls={score.file_urls}
                  emptyText={t('partyScoreApproval.attachmentEmpty')}
                />
              </section>
            </div>
          </section>

          {/* 右栏：审批操作（默认通过表单，底部提供取消 / 驳回 / 确认通过） */}
          <section className="panel-card">
            <header className="panel-card-header">
              <h3 className="panel-card-title">{t('partyScoreApproval.actionSectionTitle')}</h3>
              {actionable ? (
                actionMode === 'approve' ? (
                  <Tooltip title={t('partyScoreApproval.transferTitle')}>
                    <Button
                      type="link"
                      size="small"
                      disabled={busy}
                      onClick={() => chooseMode('transfer')}
                    >
                      {t('partyScoreApproval.transferLink')}
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip title={t('partyScoreApproval.changeAction')}>
                    <Button
                      type="link"
                      size="small"
                      disabled={busy}
                      onClick={() => chooseMode('approve')}
                    >
                      {t('partyScoreApproval.backToApprove')}
                    </Button>
                  </Tooltip>
                )
              ) : null}
            </header>
            <div className="panel-card-body">
              {!actionable ? (
                <Alert
                  type="info"
                  showIcon
                  title={t('partyScoreApproval.processedHint')}
                />
              ) : (
                <Form
                  form={actionForm}
                  layout="vertical"
                  disabled={busy}
                  className="party-approval-action-form"
                >
                  {actionMode === 'approve' ? (
                    <Form.Item
                      name="reviewed_score"
                      label={t('partyScoreApproval.reviewedScoreLabel')}
                      extra={t('partyScoreApproval.reviewedScoreHint', {
                        score: formatPartyScore(score.requested_score),
                      })}
                      rules={[
                        {
                          required: true,
                          message: t('partyScoreApproval.reviewedScoreRequired'),
                        },
                      ]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        stringMode
                        step="0.01"
                        placeholder={t('partyScoreApproval.reviewedScorePlaceholder')}
                      />
                    </Form.Item>
                  ) : (
                    <Form.Item
                      name="transfer_to"
                      label={t('partyScoreApproval.transferTargetLabel')}
                      rules={[
                        {
                          required: true,
                          message: t('partyScoreApproval.transferTargetRequired'),
                        },
                      ]}
                    >
                      <Select
                        showSearch
                        filterOption={false}
                        loading={searchingUsers}
                        placeholder={t('partyScoreApproval.transferTargetPlaceholder')}
                        options={transferUsers}
                        onSearch={(value) => void searchTransferUsers(value)}
                        notFoundContent={
                          searchingUsers ? t('partyScoreApproval.searchingUsers') : null
                        }
                      />
                    </Form.Item>
                  )}
                  <div className="party-approval-quick-replies">
                    <span className="party-approval-quick-replies-label">
                      {t('partyScoreApproval.quickRepliesLabel')}
                    </span>
                    {commonReplies.map((reply) => (
                      <Tag
                        key={reply}
                        className="party-approval-quick-reply"
                        onClick={() => actionForm.setFieldValue('comment', reply)}
                      >
                        {reply}
                      </Tag>
                    ))}
                  </div>
                  <Form.Item
                    name="comment"
                    label={t('partyScoreApproval.commentLabel')}
                    className="party-approval-comment-item"
                    rules={[
                      {
                        required: true,
                        message: t('partyScoreApproval.commentRequired'),
                      },
                    ]}
                  >
                    <Input.TextArea rows={8} maxLength={200} showCount />
                  </Form.Item>
                  <div className="party-approval-form-actions">
                    <Button onClick={cancelAction} disabled={busy}>
                      {t('common.cancel')}
                    </Button>
                    {actionMode === 'approve' ? (
                      <>
                        <Button
                          danger
                          loading={submittingAction === 'reject'}
                          disabled={busy && submittingAction !== 'reject'}
                          onClick={() => void submitAction('reject')}
                        >
                          {t('partyScoreApproval.reject')}
                        </Button>
                        <Button
                          type="primary"
                          loading={submittingAction === 'approve'}
                          disabled={busy && submittingAction !== 'approve'}
                          onClick={() => void submitAction('approve')}
                        >
                          {t('partyScoreApproval.confirmApprove')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="primary"
                        loading={submittingAction === 'transfer'}
                        onClick={() => void submitAction('transfer')}
                      >
                        {t('partyScoreApproval.confirmTransfer')}
                      </Button>
                    )}
                  </div>
                </Form>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
