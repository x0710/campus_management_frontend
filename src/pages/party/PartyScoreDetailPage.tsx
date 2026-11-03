/**
 * 党员端：成绩申报详情页（申请内容 + 审核内容）。
 *
 * 从党员首页「近期记录」点击整行进入，作为 PortalWorkspace 的子路由渲染
 * （路由：/portal/:portalKey/party-scores/:id?from=<moduleKey>），
 * 只输出内容区，顶栏 + 侧栏由父布局提供，刷新后仍可通过 URL 中的申报 ID 恢复。
 *
 * 页面布局：
 *   - 左栏「申请内容」：申报编号 / 申报类型 / 申请加分 / 申请与更新时间 / 申请理由 / 附件；
 *   - 右栏「审核内容」：审核状态（审核中 / 申请成功 / 被驳回）、核定分数、
 *     审批实例与更新时间，以及逐环节的审批意见流转。
 *
 * 审核状态判定：
 *   审批记录含驳回决定 → 被驳回；模板每个环节都有「同意」记录或属于
 *   「审批人是申请人本人」的自动通过环节 → 申请成功；其余 → 审核中。
 *   （自动通过环节由后端直接置为已通过且不产生审批记录，需读取本人审批步骤识别。）
 *   审批记录由 PartyScoreApprovalRecords 加载后通过 onRecordsLoaded 回传，
 *   避免页面与流转组件重复请求同一接口。
 *
 * 数据源：
 *   GET /api/party-scores/{id}                 申报详情（含附件下载地址与模板 ID）
 *   GET /api/approvals/templates               申报类型名称 / 审批步骤（失败时回退模板 ID）
 *   GET /api/approvals/{id}/records            审批意见流转（用于展示与状态判定）
 *   GET /api/approvals                         本人审批步骤（识别自动通过的环节）
 */
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Skeleton, Spin, Tag } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { extractErrorReason } from '../../api/common'
import { getApprovalTemplateDetail } from '../../api/approvalmodel'
import { queryMyApprovalSteps } from '../../api/approvals'
import { getPartyScore } from '../../api/partyScores'
import type { ApprovalRecordItem } from '../../api/types/approvals'
import type { ApprovalStep } from '../../api/types/approvalmodel'
import type { PartyScoreDetail } from '../../api/types/partyScores'
import AttachmentLinks from '../../components/AttachmentLinks'
import ErrorState from '../../components/ErrorState'
import PartyScoreApprovalRecords from '../../components/PartyScoreApprovalRecords'
import { usePartyTemplateNames } from '../../composables/usePartyTemplateNames'
import {
  PARTY_SCORE_APPLICATION_STATUS_COLOR,
  type PartyScoreApplicationStatus,
} from '../../config/partyDeclaration'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'
import {
  collectSelfApprovedStepOrders,
  formatPartyScore,
  isNegativePartyScore,
  resolvePartyScoreApplicationStatus,
} from '../../utils/partyScore'

/** 审核状态 → 提示条类型（与状态标签配色保持一致） */
const STATUS_ALERT_TYPE: Record<
  PartyScoreApplicationStatus,
  'info' | 'success' | 'error'
> = {
  pending: 'info',
  approved: 'success',
  rejected: 'error',
}

export default function PartyScoreDetailPage() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const navigate = useNavigate()
  const location = useLocation()
  const { portalKey, id } = useParams<{ portalKey: string; id: string }>()

  /** 来源模块：用于返回首页与父布局侧栏高亮 */
  const fromModuleKey = new URLSearchParams(location.search).get('from')

  /** 申报类型名称（取不到时回退模板 ID） */
  const templateNames = usePartyTemplateNames()

  const [detail, setDetail] = useState<PartyScoreDetail | null>(null)
  /** 审批意见记录；null 表示尚未加载完成，用于避免状态先显示「审核中」随后又变成「被驳回」 */
  const [approvalRecords, setApprovalRecords] = useState<ApprovalRecordItem[] | null>(null)
  /** 申报模板的审批步骤；undefined 表示加载中，null 表示取不到（回退 approved_score 判定） */
  const [templateSteps, setTemplateSteps] = useState<
    ApprovalStep[] | null | undefined
  >(undefined)
  /**
   * 本人审批步骤中已通过的环节序号（含后端自动通过的环节）。
   * null 表示尚未加载完成，用于避免状态先显示「审核中」再变成「申请成功」。
   */
  const [selfApprovedStepNos, setSelfApprovedStepNos] = useState<Set<number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 手动刷新计数：递增以强制重新挂载审批记录组件并绕过缓存 */
  const [refreshSeq, setRefreshSeq] = useState(0)

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
      // 重新加载期间清空旧审批记录与模板步骤，状态标签回到加载态，避免展示上一次结果
      setApprovalRecords(null)
      setTemplateSteps(undefined)
      setSelfApprovedStepNos(null)
      try {
        setDetail(await getPartyScore(numId, force))
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

  /*
   * 模板审批步骤：用于判断是否所有环节都已完成。
   * 仅当每个步骤都有对应的「同意」审批记录（或属于自动通过环节）时才显示申请成功，
   * 避免两步审批只完成一步时被 approved_score 误判为成功。
   */
  useEffect(() => {
    let cancelled = false
    setTemplateSteps(undefined)

    const templateId = Number(detail?.template_id)
    if (!Number.isFinite(templateId) || templateId <= 0) {
      setTemplateSteps(null)
      return () => {
        cancelled = true
      }
    }

    getApprovalTemplateDetail(templateId)
      .then((template) => {
        if (!cancelled) setTemplateSteps(template.steps ?? [])
      })
      .catch(() => {
        // 取不到步骤时回退 approved_score 判定，避免详情页一直停在加载态
        if (!cancelled) setTemplateSteps(null)
      })

    return () => {
      cancelled = true
    }
  }, [detail])

  /*
   * 自动通过环节：当某个环节的审批人就是申请人本人时，后端会直接将该环节置为
   * 已通过且不生成审批意见记录；必须额外读取本人审批步骤，否则这类申请会因缺少
   * 一条「同意」记录而一直显示审核中。
   */
  useEffect(() => {
    let cancelled = false
    setSelfApprovedStepNos(null)

    const instanceId = Number(detail?.approval_instance_id)
    if (!Number.isFinite(instanceId) || instanceId <= 0) {
      setSelfApprovedStepNos(new Set<number>())
      return () => {
        cancelled = true
      }
    }

    queryMyApprovalSteps()
      .then((steps) => {
        if (cancelled) return
        setSelfApprovedStepNos(
          collectSelfApprovedStepOrders(steps).get(instanceId) ?? new Set<number>(),
        )
      })
      .catch(() => {
        // 取不到时按空集合降级，退回原有「同意记录」判定
        if (!cancelled) setSelfApprovedStepNos(new Set<number>())
      })

    return () => {
      cancelled = true
    }
  }, [detail])

  /** 手动刷新：同时重新请求申报详情与审批意见 */
  const refreshPage = useCallback(() => {
    setRefreshSeq((seq) => seq + 1)
    void load(true)
  }, [load])

  /** 返回来源模块：……首页近期记录（party_m1）或成绩申报记录（party_m2）；无来源时回退门户首页 */
  const backToHome = useCallback(() => {
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

  /**
   * 审核状态：审批记录、模板步骤与本人自动通过环节都加载完成后，
   * 由 resolvePartyScoreApplicationStatus 判定（所有环节均有同意记录或属于自动通过环节）；
   * 加载期间为 null（页面展示加载态），避免状态先显示「审核中」再变成「被驳回 / 成功」。
   */
  const applicationStatus = useMemo<PartyScoreApplicationStatus | null>(() => {
    if (!detail) return null
    if (
      approvalRecords === null ||
      templateSteps === undefined ||
      selfApprovedStepNos === null
    ) {
      return null
    }
    return resolvePartyScoreApplicationStatus(
      detail,
      approvalRecords,
      templateSteps,
      selfApprovedStepNos,
    )
  }, [detail, approvalRecords, templateSteps, selfApprovedStepNos])

  /** 申报类型展示文案：优先模板名称，取不到时回退模板 ID */
  const templateLabel = detail
    ? detail.template_id !== undefined
      ? templateNames.get(detail.template_id) ?? detail.template_id
      : t('common.unknown')
    : '—'

  /**
   * 审批进度：已完成的模板环节数 / 模板总环节数。
   * 已完成环节 = 审批意见为「同意」的环节 + 审批人是申请人本人、由后端自动通过的环节；
   * 自动通过环节不产生审批意见记录，只按记录统计会少一个环节。
   * 模板步骤或审批记录尚未加载完成时返回 null，页面展示占位符。
   */
  const approvalProgress = useMemo(() => {
    if (approvalRecords === null || selfApprovedStepNos === null) return null
    const stepNos = templateSteps?.map((step) => step.step_no)
    if (!stepNos || stepNos.length === 0) return null
    const required = new Set(stepNos)
    const done = new Set<number>(
      approvalRecords
        .filter((record) => record.decision === 'agree' && required.has(record.step_order))
        .map((record) => record.step_order),
    )
    // 自动通过环节没有审批记录，但同样属于已完成
    for (const stepNo of selfApprovedStepNos) {
      if (required.has(stepNo)) done.add(stepNo)
    }
    return { done: done.size, total: required.size }
  }, [approvalRecords, templateSteps, selfApprovedStepNos])

  return (
    <div className="party-approval-detail">
      <div className="party-approval-detail-header">
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={backToHome}>
          {/* 从首页近期记录进入时回首页，从成绩申报记录进入时回到申报记录列表 */}
          {fromModuleKey && fromModuleKey !== 'party_m1'
            ? t('partyDeclaration.backToDeclarations')
            : t('partyDeclaration.backToHome')}
        </Button>
        <div className="party-approval-detail-title">
          <h3>{t('partyDeclaration.detailTitle')}</h3>
          {applicationStatus ? (
            <Tag color={PARTY_SCORE_APPLICATION_STATUS_COLOR[applicationStatus]}>
              {t(`partyDeclaration.applicationStatus_${applicationStatus}`)}
            </Tag>
          ) : detail ? (
            <Spin size="small" />
          ) : null}
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={refreshPage}>
          {t('common.refresh')}
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load(true)} />
      ) : loading && !detail ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : detail ? (
        <div className="party-approval-detail-layout party-score-detail-layout">
          {/* 左栏：申请内容 */}
          <section className="panel-card">
            <header className="panel-card-header">
              <h3 className="panel-card-title">
                {t('partyDeclaration.applicationSectionTitle')}
              </h3>
            </header>
            <div className="panel-card-body">
              <section className="party-approval-section">
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label={t('partyDeclaration.colId')}>
                    {detail.id}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyDeclaration.colDeclType')}>
                    {templateLabel}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyDeclaration.colScore')}>
                    <span
                      className={
                        isNegativePartyScore(detail.requested_score)
                          ? 'party-score-minus'
                          : 'party-score-plus'
                      }
                    >
                      {formatPartyScore(detail.requested_score)}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyDeclaration.colCreatedAt')}>
                    {formatDateTime(detail.created_at, locale)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyDeclaration.colUpdatedAt')}>
                    {formatDateTime(detail.updated_at, locale)}
                  </Descriptions.Item>
                </Descriptions>
                <div className="party-approval-reason-block">
                  <div className="party-approval-reason-label">
                    {t('partyDeclaration.fieldReason')}
                  </div>
                  <div className="party-approval-reason-content">
                    {detail.reason?.trim() ? detail.reason : '—'}
                  </div>
                </div>
              </section>

              <section className="party-approval-section">
                <h4 className="party-approval-section-title">
                  {t('partyDeclaration.fieldFiles')}
                </h4>
                <AttachmentLinks
                  urls={detail.file_urls}
                  emptyText={t('leaveDetail.noAttachment')}
                />
              </section>
            </div>
          </section>

          {/* 右栏：审核内容 */}
          <section className="panel-card">
            <header className="panel-card-header">
              <h3 className="panel-card-title">
                {t('partyDeclaration.reviewSectionTitle')}
              </h3>
            </header>
            <div className="panel-card-body">
              <section className="party-approval-section">
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label={t('partyDeclaration.fieldStatus')}>
                    {applicationStatus ? (
                      <Tag color={PARTY_SCORE_APPLICATION_STATUS_COLOR[applicationStatus]}>
                        {t(`partyDeclaration.applicationStatus_${applicationStatus}`)}
                      </Tag>
                    ) : (
                      <Spin size="small" />
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyDeclaration.fieldProgress')}>
                    {approvalProgress
                      ? `${approvalProgress.done} / ${approvalProgress.total}`
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyDeclaration.colApproved')}>
                    {applicationStatus === 'approved' ? (
                      formatPartyScore(detail.approved_score)
                    ) : applicationStatus ? (
                      '—'
                    ) : (
                      <Spin size="small" />
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyDeclaration.detailInstance')}>
                    {detail.approval_instance_id}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('partyDeclaration.colUpdatedAt')}>
                    {formatDateTime(detail.updated_at, locale)}
                  </Descriptions.Item>
                </Descriptions>
                {applicationStatus ? (
                  <Alert
                    type={STATUS_ALERT_TYPE[applicationStatus]}
                    showIcon
                    className="party-score-status-alert"
                    title={t(`partyDeclaration.reviewHint_${applicationStatus}`)}
                  />
                ) : null}
              </section>

              <section className="party-approval-section">
                <h4 className="party-approval-section-title">
                  {t('partyDeclaration.flowSectionTitle')}
                </h4>
                <PartyScoreApprovalRecords
                  key={refreshSeq}
                  instanceId={detail.approval_instance_id}
                  force
                  onRecordsLoaded={setApprovalRecords}
                />
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
