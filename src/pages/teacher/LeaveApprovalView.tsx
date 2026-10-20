/**
 * 请假审批待办（GET /api/approvals + PUT /api/approvals）。
 * 教师端「请假审批」与党委支部端 / 学院端 / 学校端的「审批管理」共用本组件。
 *
 * 审批入口有两处：
 *   1. 列表「操作」列：同意 / 驳回（填写意见后提交）；
 *   2. 点击行打开请假详情弹窗后，弹窗底部同样提供同意 / 驳回（仅等待中/待审批的步骤可用）。
 * 提交意见后通过 invalidate('GET /leaves') 失效缓存并刷新列表。
 */
import { ReloadOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { queryApprovals, submitApproval } from '../../api/approvals'
import type {
  ApprovalDecision,
  ApprovalInstanceStep,
  ApprovalStepStatus,
} from '../../api/types/approvals'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import ErrorState from '../../components/ErrorState'
import LeaveDetailModal from '../../components/LeaveDetailModal'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** 请假审批表每页条数（代码要求 12：表格每页最多 100 行） */
const PAGE_SIZE = 100

const STATUS_COLOR: Record<ApprovalStepStatus, string> = {
  waiting: 'default',
  pending: 'processing',
  approved: 'green',
  rejected: 'red',
  skipped: 'orange',
}

/** 审批步骤是否可操作（等待中/待审批才允许同意或驳回） */
function isActionable(status: ApprovalStepStatus): boolean {
  return status === 'waiting' || status === 'pending'
}

/** 教师端：请假审批待办（GET /api/approvals + PUT /api/approvals） */
export default function LeaveApprovalView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()

  const [uid, setUid] = useState<number | null>(null)
  const [rows, setRows] = useState<ApprovalInstanceStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ApprovalStepStatus | 'all'>('all')
  const [submitting, setSubmitting] = useState(false)
  const [action, setAction] = useState<{
    step: ApprovalInstanceStep
    decision: ApprovalDecision
  } | null>(null)
  const [commentForm] = Form.useForm<{ comment: string }>()
  // 请假详情弹窗：点击审批行时用该行的审批实例 ID（即请假记录 approval_id）打开，
  // 同时保留该行（审批步骤）信息，可在详情弹窗内直接「同意 / 驳回」
  const [detailRow, setDetailRow] = useState<ApprovalInstanceStep | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [me, list] = await Promise.all([
        getCurrentUser(),
        queryApprovals({
          page,
          page_size: PAGE_SIZE,
          ...(status === 'all' ? {} : { status }),
        }),
      ])
      setUid(me.uid)
      setRows(list)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        // 401 由全局拦截器处理，这里不重复提示
      } else {
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
  }, [page, status, t])

  useEffect(() => {
    void load()
  }, [load])

  const statusOptions = useMemo(
    () =>
      (
        [
          'all',
          'waiting',
          'pending',
          'approved',
          'rejected',
          'skipped',
        ] as const
      ).map((v) => ({ value: v, label: v === 'all' ? t('approval.filterAll') : t(`approval.status_${v}`) })),
    [t],
  )

  const doSubmit = async () => {
    if (!action || uid === null) return
    const { comment } = await commentForm.validateFields()
    const { step, decision } = action
    setSubmitting(true)
    try {
      await submitApproval({
        approval_instance_step_id: step.id,
        user_id: uid,
        instance_id: step.instance_id,
        step_order: step.step_order,
        decision,
        transfer_to: null,
        comment: comment.trim(),
      })
      message.success(t(decision === 'agree' ? 'approval.agreeSuccess' : 'approval.rejectSuccess'))
      setAction(null)
      commentForm.resetFields()
      void load()
    } catch (err) {
      reportError(err)
    } finally {
      setSubmitting(false)
    }
  }

  const columns = useMemo<ColumnsType<ApprovalInstanceStep>>(
    () => [
      { title: t('approval.colStepId'), dataIndex: 'id', key: 'id', width: 78 },
      {
        title: t('approval.colInstanceId'),
        dataIndex: 'instance_id',
        key: 'instance_id',
        width: 148,
      },
      {
        title: t('approval.colStepOrder'),
        dataIndex: 'step_order',
        key: 'step_order',
        width: 72,
        render: (n: number) => t('approval.stepOrderValue', { n: String(n) }),
      },
      {
        title: t('approval.colStatus'),
        dataIndex: 'status',
        key: 'status',
        width: 92,
        render: (s: ApprovalStepStatus) => (
          <Tag color={STATUS_COLOR[s]}>{t(`approval.status_${s}`)}</Tag>
        ),
      },
      {
        title: t('approval.colStartedAt'),
        dataIndex: 'started_at',
        key: 'started_at',
        width: 150,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('approval.colFinishedAt'),
        dataIndex: 'finished_at',
        key: 'finished_at',
        width: 150,
        render: (v: string | null) => (v ? formatDateTime(v, locale) : '—'),
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 132,
        render: (_, record) => {
          if (!isActionable(record.status)) return <span className="cell-sub">—</span>
          return (
            <div className="approval-actions">
              <Button
                type="link"
                size="small"
                onClick={(e) => {
                  // 阻止冒泡，避免触发行点击打开详情弹窗
                  e.stopPropagation()
                  setAction({ step: record, decision: 'agree' })
                }}
              >
                {t('approval.agree')}
              </Button>
              <Button
                type="link"
                size="small"
                danger
                onClick={(e) => {
                  e.stopPropagation()
                  setAction({ step: record, decision: 'reject' })
                }}
              >
                {t('approval.reject')}
              </Button>
            </div>
          )
        },
      },
    ],
    [t, locale, action, commentForm],
  )

  // 裸数组无 total：满页时假定可能还有下一页
  const total = (page - 1) * PAGE_SIZE + rows.length + (rows.length === PAGE_SIZE ? 1 : 0)

  return (
    <div className="student-view">
      

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('approval.title')}</h3>
          <div className="approval-toolbar">
            <Select
              value={status}
              options={statusOptions}
              style={{ width: 150 }}
              onChange={(v: ApprovalStepStatus | 'all') => {
                setPage(1)
                setStatus(v)
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              {t('common.refresh')}
            </Button>
          </div>
        </header>
        <div className="panel-card-body">
          {error ? (
            <ErrorState
              message={error}
              onRetry={() => void load()}
            />
          ) : (
            <Table<ApprovalInstanceStep>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={rows}
              locale={{ emptyText: t('common.noData') }}
              onRow={(record) => ({
                onClick: () => setDetailRow(record),
                title: t('approval.rowClickHint'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total,
                showSizeChanger: false,
                onChange: (nextPage: number) => setPage(nextPage),
              }}
            />
          )}
        </div>
      </section>

      <Modal
        open={action !== null}
        title={
          action?.decision === 'agree' ? t('approval.agreeTitle') : t('approval.rejectTitle')
        }
        okText={action?.decision === 'agree' ? t('approval.confirmAgree') : t('approval.confirmReject')}
        okButtonProps={{
          danger: action?.decision === 'reject',
          type: action?.decision === 'agree' ? 'primary' : 'default',
          loading: submitting,
        }}
        cancelText={t('approval.cancel')}
        onCancel={() => setAction(null)}
        onOk={() => void doSubmit()}
        destroyOnHidden
      >
        {action && (
          <div className="approval-modal-meta">
            {t('approval.modalInstance')}：{action.step.instance_id} ·{' '}
            {t('approval.modalStep', { n: String(action.step.step_order) })}
          </div>
        )}
        <Form form={commentForm} layout="vertical">
          <Form.Item
            name="comment"
            label={t('approval.commentLabel')}
            rules={[{ required: true, message: t('approval.commentRequired') }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <LeaveDetailModal
        open={detailRow !== null}
        leaveId={detailRow?.instance_id ?? null}
        onClose={() => setDetailRow(null)}
        // 可在详情弹窗内直接审批：同意/驳回后关闭详情弹窗，弹出填写意见的确认弹窗
        footerExtra={
          detailRow && isActionable(detailRow.status) ? (
            <>
              <Button
                type="primary"
                onClick={() => {
                  const step = detailRow
                  setDetailRow(null)
                  setAction({ step, decision: 'agree' })
                }}
              >
                {t('approval.agree')}
              </Button>
              <Button
                danger
                onClick={() => {
                  const step = detailRow
                  setDetailRow(null)
                  setAction({ step, decision: 'reject' })
                }}
              >
                {t('approval.reject')}
              </Button>
            </>
          ) : undefined
        }
      />
    </div>
  )
}
