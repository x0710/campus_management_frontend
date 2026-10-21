/**
 * 党建活动加分审核（党委支部端 / 党委学院端 / 党委学校端共用页面）。
 *
 * 数据源：
 *   GET /api/party-scores + /api/approvals 前端合成当前审批人的党建加分审批步骤列表
 *     （后端 GET /api/party-scores/approvals 与 /api/party-scores/{id} 路由冲突，不能直接调用）
 *   GET /api/party-scores                 按 approval_instance_id 反查加分申请详情，补齐列表与详情
 *   PUT /api/party-scores/approvals/{id}/approve   通过
 *   PUT /api/party-scores/approvals/{id}/reject    驳回
 *   PUT /api/party-scores/approvals/{id}/transfer  转交
 *   GET /api/users                         转交对象搜索
 *
 * 审批步骤后端不返回申请人/申请分数等业务字段，因此前端按实例 ID 批量反查加分申请；
 * 所有 GET 均走会话缓存，写操作后自动失效 party-scores 前缀缓存并刷新表格。
 */
import { ReloadOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import {
  approvePartyScore,
  queryPartyScoreApprovals,
  queryPartyScores,
  rejectPartyScore,
  transferPartyScore,
} from '../../api/partyScores'
import type {
  ApprovalInstanceStep,
  ApprovalStepStatus,
} from '../../api/types/approvals'
import type { PartyScore } from '../../api/types/partyScores'
import { queryUsers } from '../../api/users'
import ErrorState from '../../components/ErrorState'
import PartyScoreDetailModal from '../../components/PartyScoreDetailModal'
import {
  isPartyScoreStepActionable,
  PARTY_SCORE_APPROVAL_PAGE_SIZE,
  PARTY_SCORE_APPROVAL_STATUS_COLOR,
  PARTY_SCORE_TRANSFER_USER_PAGE_SIZE,
} from '../../config/partyScoreApproval'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { useUserNames } from '../../composables/useUserNames'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** 审批动作类型：通过 / 驳回 / 转交 */
type ApprovalAction = 'approve' | 'reject' | 'transfer'

/** 列表行：审批步骤 + 关联的加分申请（反查失败时为 null） */
interface ApprovalRow {
  step: ApprovalInstanceStep
  score: PartyScore | null
}

/** 审批弹窗表单值（comment 必填；reviewed_score、transfer_to 按动作类型按需填写） */
interface ActionFormValues {
  comment: string
  reviewed_score?: number | null
  transfer_to?: number
}

/**
 * 按审批实例 ID 批量反查加分申请。
 * @param instanceIds 审批实例 ID 数组（可为空；内部去重）
 * @returns Promise<Map<number, PartyScore | null>> instance_id -> 加分申请（查不到或失败为 null）
 */
async function fetchPartyScoreMap(
  instanceIds: number[],
): Promise<Map<number, PartyScore | null>> {
  const unique = [...new Set(instanceIds)]
  const entries = await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await queryPartyScores({
          approval_instance_id: id,
          page: 1,
          page_size: 1,
        })
        return [id, res.data[0] ?? null] as const
      } catch {
        return [id, null] as const
      }
    }),
  )
  return new Map(entries)
}

/**
 * 党建活动加分审核页。
 * 党委支部端、党委学院端、党委学校端的「审核管理 / 审批管理」共用本组件。
 */
export default function PartyScoreApprovalView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()

  const [myUid, setMyUid] = useState<number | null>(null)
  const [rows, setRows] = useState<ApprovalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  /** 状态多选筛选：空数组表示全部 */
  const [statusFilter, setStatusFilter] = useState<ApprovalStepStatus[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [action, setAction] = useState<{
    kind: ApprovalAction
    row: ApprovalRow
  } | null>(null)
  const [detailRow, setDetailRow] = useState<ApprovalRow | null>(null)
  const [actionForm] = Form.useForm<ActionFormValues>()

  /** 转交对象搜索选项与加载态 */
  const [transferUsers, setTransferUsers] = useState<{ value: number; label: string }[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)

  const load = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      try {
        const [me, steps] = await Promise.all([
          getCurrentUser(),
          queryPartyScoreApprovals(
            { page, page_size: PARTY_SCORE_APPROVAL_PAGE_SIZE },
            force,
          ),
        ])
        setMyUid(me.uid)
        const scoreMap = await fetchPartyScoreMap(steps.map((step) => step.instance_id))
        setRows(
          steps.map((step) => ({
            step,
            score: scoreMap.get(step.instance_id) ?? null,
          })),
        )
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
    [page, t],
  )

  useEffect(() => {
    void load()
  }, [load])

  const statusOptions = useMemo(
    () =>
      (['waiting', 'pending', 'approved', 'rejected', 'skipped'] as const).map((value) => ({
        value,
        label: t(`partyScoreApproval.status_${value}`),
      })),
    [t],
  )

  const filteredRows = useMemo(
    () =>
      statusFilter.length === 0
        ? rows
        : rows.filter((row) => statusFilter.includes(row.step.status)),
    [rows, statusFilter],
  )

  const applicantIds = useMemo(
    () =>
      filteredRows
        .map((row) => row.score?.user_id)
        .filter((id): id is number => typeof id === 'number'),
    [filteredRows],
  )
  const userNames = useUserNames(applicantIds)

  /** 打开审批弹窗（按动作类型重置表单与转交对象选项） */
  const openAction = useCallback(
    (kind: ApprovalAction, row: ApprovalRow) => {
      setAction({ kind, row })
      actionForm.resetFields()
      setTransferUsers([])
      if (kind === 'approve') {
        actionForm.setFieldsValue({ reviewed_score: null })
      }
    },
    [actionForm],
  )

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

  /** 提交审批动作 */
  const submitAction = async () => {
    if (!action) return
    const values = await actionForm.validateFields()
    const comment = values.comment.trim()
    setSubmitting(true)
    try {
      if (action.kind === 'approve') {
        await approvePartyScore(action.row.step.id, {
          comment,
          reviewed_score: values.reviewed_score ?? null,
        })
        message.success(t('partyScoreApproval.approveSuccess'))
      } else if (action.kind === 'reject') {
        await rejectPartyScore(action.row.step.id, { comment })
        message.success(t('partyScoreApproval.rejectSuccess'))
      } else {
        if (!values.transfer_to) {
          message.error(t('partyScoreApproval.transferTargetRequired'))
          return
        }
        await transferPartyScore(action.row.step.id, {
          transfer_to: values.transfer_to,
          comment,
        })
        message.success(t('partyScoreApproval.transferSuccess'))
      }
      setAction(null)
      actionForm.resetFields()
      void load()
    } catch (err) {
      reportError(err)
    } finally {
      setSubmitting(false)
    }
  }

  const columns = useMemo<ColumnsType<ApprovalRow>>(
    () => [
      {
        title: t('partyScoreApproval.colAppId'),
        dataIndex: ['score', 'id'],
        key: 'appId',
        width: 90,
        render: (_, row) => row.score?.id ?? '—',
      },
      {
        title: t('partyScoreApproval.colApplicant'),
        dataIndex: ['score', 'user_id'],
        key: 'userId',
        width: 130,
        render: (_, row) => {
          if (!row.score) return '—'
          return userNames.get(row.score.user_id) ?? row.score.user_id
        },
      },
      {
        title: t('partyScoreApproval.colRequestedScore'),
        dataIndex: ['score', 'requested_score'],
        key: 'requestedScore',
        width: 110,
        align: 'center',
        render: (_, row) => {
          const score = row.score?.requested_score
          if (score === undefined) return '—'
          return (
            <span className={score < 0 ? 'party-score-minus' : 'party-score-plus'}>
              {score > 0 ? `+${score}` : score}
            </span>
          )
        },
      },
      {
        title: t('partyScoreApproval.colApprovedScore'),
        dataIndex: ['score', 'approved_score'],
        key: 'approvedScore',
        width: 110,
        align: 'center',
        render: (_, row) => (row.score?.approved_score ?? '—'),
      },
      {
        title: t('partyScoreApproval.colStepOrder'),
        dataIndex: ['step', 'step_order'],
        key: 'stepOrder',
        width: 100,
        render: (n: number) => t('partyScoreApproval.stepOrderValue', { n: String(n) }),
      },
      {
        title: t('partyScoreApproval.colStatus'),
        dataIndex: ['step', 'status'],
        key: 'status',
        width: 110,
        render: (status: ApprovalStepStatus) => (
          <Tag color={PARTY_SCORE_APPROVAL_STATUS_COLOR[status]}>
            {t(`partyScoreApproval.status_${status}`)}
          </Tag>
        ),
      },
      {
        title: t('partyScoreApproval.colStartedAt'),
        dataIndex: ['step', 'started_at'],
        key: 'startedAt',
        width: 170,
        render: (value: string) => formatDateTime(value, locale),
      },
      {
        title: t('partyScoreApproval.colFinishedAt'),
        dataIndex: ['step', 'finished_at'],
        key: 'finishedAt',
        width: 170,
        render: (value: string | null) => (value ? formatDateTime(value, locale) : '—'),
      },
      {
        title: t('partyScoreApproval.colAction'),
        key: 'action',
        width: 190,
        fixed: 'right',
        render: (_, row) => {
          const actionable = isPartyScoreStepActionable(row.step.status)
          const actionTip = actionable
            ? t('partyScoreApproval.approve')
            : t('partyScoreApproval.actionUnavailable')
          return (
            <div className="approval-actions">
              <Tooltip title={actionTip}>
                <Button
                  type="link"
                  size="small"
                  disabled={!actionable}
                  onClick={(e) => {
                    e.stopPropagation()
                    openAction('approve', row)
                  }}
                >
                  {t('partyScoreApproval.approve')}
                </Button>
              </Tooltip>
              <Tooltip
                title={
                  actionable
                    ? t('partyScoreApproval.reject')
                    : t('partyScoreApproval.actionUnavailable')
                }
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled={!actionable}
                  onClick={(e) => {
                    e.stopPropagation()
                    openAction('reject', row)
                  }}
                >
                  {t('partyScoreApproval.reject')}
                </Button>
              </Tooltip>
              <Tooltip
                title={
                  actionable
                    ? t('partyScoreApproval.transfer')
                    : t('partyScoreApproval.actionUnavailable')
                }
              >
                <Button
                  type="link"
                  size="small"
                  disabled={!actionable}
                  onClick={(e) => {
                    e.stopPropagation()
                    openAction('transfer', row)
                  }}
                >
                  {t('partyScoreApproval.transfer')}
                </Button>
              </Tooltip>
            </div>
          )
        },
      },
    ],
    [t, locale, userNames, openAction],
  )

  // 审批步骤接口为裸数组，无 total：满页时预估可能还有下一页，用于展示分页与总页数
  const total =
    (page - 1) * PARTY_SCORE_APPROVAL_PAGE_SIZE +
    rows.length +
    (rows.length === PARTY_SCORE_APPROVAL_PAGE_SIZE ? 1 : 0)

  const actionScore = action?.row.score ?? null

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyScoreApproval.title')}</h3>
          <div className="approval-toolbar">
            <Select<ApprovalStepStatus[]>
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              style={{ width: 260 }}
              value={statusFilter}
              placeholder={t('partyScoreApproval.filterStatusPlaceholder')}
              options={statusOptions}
              onChange={(next) => {
                setPage(1)
                setStatusFilter(next)
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load(true)}>
              {t('common.refresh')}
            </Button>
          </div>
        </header>
        <div className="panel-card-body">
          {error ? (
            <ErrorState message={error} onRetry={() => void load(true)} />
          ) : (
            <Table<ApprovalRow>
              rowKey={(row) => row.step.id}
              loading={loading}
              columns={columns}
              dataSource={filteredRows}
              scroll={{ x: 1220 }}
              locale={{ emptyText: t('common.noData') }}
              onRow={(row) => ({
                onClick: () => setDetailRow(row),
                title: t('partyScoreApproval.rowClickHint'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize: PARTY_SCORE_APPROVAL_PAGE_SIZE,
                total,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) =>
                  t('common.totalPages', {
                    n: Math.max(1, Math.ceil(n / PARTY_SCORE_APPROVAL_PAGE_SIZE)),
                  }),
                onChange: (nextPage: number) => setPage(nextPage),
              }}
            />
          )}
        </div>
      </section>

      {/* 审批动作弹窗 */}
      <Modal
        open={action !== null}
        title={
          action?.kind === 'approve'
            ? t('partyScoreApproval.approveTitle')
            : action?.kind === 'reject'
              ? t('partyScoreApproval.rejectTitle')
              : t('partyScoreApproval.transferTitle')
        }
        okText={
          action?.kind === 'approve'
            ? t('partyScoreApproval.confirmApprove')
            : action?.kind === 'reject'
              ? t('partyScoreApproval.confirmReject')
              : t('partyScoreApproval.confirmTransfer')
        }
        okButtonProps={{
          danger: action?.kind === 'reject',
          type: action?.kind === 'approve' ? 'primary' : 'default',
          loading: submitting,
        }}
        cancelText={t('common.cancel')}
        onCancel={() => setAction(null)}
        onOk={() => void submitAction()}
        destroyOnHidden
      >
        {action && (
          <div className="approval-modal-meta">
            {t('partyScoreApproval.metaInstance')}：{action.row.step.instance_id} ·{' '}
            {t('partyScoreApproval.stepOrderValue', {
              n: String(action.row.step.step_order),
            })}
            {actionScore && (
              <>
                {' · '}
                {t('partyScoreApproval.colRequestedScore')}：
                {actionScore.requested_score > 0
                  ? `+${actionScore.requested_score}`
                  : actionScore.requested_score}
              </>
            )}
          </div>
        )}
        <Form form={actionForm} layout="vertical">
          {action?.kind === 'approve' && (
            <Form.Item
              name="reviewed_score"
              label={t('partyScoreApproval.reviewedScoreLabel')}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={-9999}
                max={9999}
                placeholder={t('partyScoreApproval.reviewedScorePlaceholder')}
              />
            </Form.Item>
          )}
          {action?.kind === 'transfer' && (
            <Form.Item
              name="transfer_to"
              label={t('partyScoreApproval.transferTargetLabel')}
              rules={[{ required: true, message: t('partyScoreApproval.transferTargetRequired') }]}
            >
              <Select
                showSearch
                filterOption={false}
                loading={searchingUsers}
                placeholder={t('partyScoreApproval.transferTargetPlaceholder')}
                options={transferUsers}
                onSearch={(value) => void searchTransferUsers(value)}
                notFoundContent={searchingUsers ? t('partyScoreApproval.searchingUsers') : null}
              />
            </Form.Item>
          )}
          <Form.Item
            name="comment"
            label={t('partyScoreApproval.commentLabel')}
            rules={[{ required: true, message: t('partyScoreApproval.commentRequired') }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <PartyScoreDetailModal
        open={detailRow !== null}
        approvalInstanceId={detailRow?.step.instance_id ?? null}
        onClose={() => setDetailRow(null)}
      />
    </div>
  )
}
