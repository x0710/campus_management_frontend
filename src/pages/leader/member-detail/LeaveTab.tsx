import { useRequestSequence } from '../../../composables/useRequestSequence'
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Descriptions, Modal, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { queryApprovals } from '../../../api/approvals'
import type { ApprovalStepStatus } from '../../../api/types/approvals'
import { extractErrorReason } from '../../../api/common'
import { getLeave } from '../../../api/leaves'
import type { LeaveDetail } from '../../../api/types/leaves'
import { MEMBER_DETAIL_PAGE_SIZE } from '../../../config/leaderOrg'
import { LEAVE_STATUS_COLOR, LEAVE_TYPE_COLOR } from '../../../config/leave'
import { type TranslateFn } from '../../../i18n'
import { useSettingsStore } from '../../../store/settings'
import { formatDateTime } from '../../../utils/datetime'
import ErrorState from '../../../components/ErrorState'

/** 请假列表项：详情 + 由审批步骤推导的状态 */
interface LeaveRow {
  detail: LeaveDetail
  status: ApprovalStepStatus
}

/** 请假信息 Tab：审批实例 → 请假详情，点击行查看请假详情 */
export default function LeaveTab({ uid, t }: { uid: number; t: TranslateFn }) {
  const locale = useSettingsStore((s) => s.locale)
  const [rows, setRows] = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reloadSeq, setReloadSeq] = useState(0)
  const [detail, setDetail] = useState<LeaveRow | null>(null)

  const requests = useRequestSequence()
  const load = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    try {
      const steps = await queryApprovals({ applicant_id: uid })
      // 每个审批实例取 step_order 最大的步骤状态作为该请假的当前状态
      const statusByInstance = new Map<number, { order: number; status: ApprovalStepStatus }>()
      for (const s of steps) {
        const cur = statusByInstance.get(s.instance_id)
        if (!cur || s.step_order >= cur.order) {
          statusByInstance.set(s.instance_id, { order: s.step_order, status: s.status })
        }
      }
      if (!isCurrent()) return
      const ids = [...statusByInstance.keys()]
      const results = await Promise.all(
        ids.map(async (instanceId): Promise<LeaveRow | null> => {
          try {
            const d = await getLeave(instanceId)
            return { detail: d, status: statusByInstance.get(instanceId)!.status }
          } catch {
            // 非请假类型的审批实例查询详情会失败，跳过即可
            return null
          }
        }),
      )
      if (!isCurrent()) return
      setRows(results.filter((r): r is LeaveRow => r !== null))
    } catch (err) {
      if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [uid, t, requests])

  useEffect(() => {
    void load()
    return () => requests.invalidate()
  }, [load, requests, reloadSeq])

  const columns = useMemo<ColumnsType<LeaveRow>>(
    () => [
      {
        title: t('leave.colType'),
        key: 'leave_type',
        width: 120,
        render: (_, r) => (
          <Tag color={LEAVE_TYPE_COLOR[r.detail.leave_type]}>
            {t(`leave.type_${r.detail.leave_type}`)}
          </Tag>
        ),
      },
      {
        title: t('leave.colStart'),
        key: 'start_time',
        width: 170,
        render: (_, r) => formatDateTime(r.detail.start_time, locale),
      },
      {
        title: t('leave.colEnd'),
        key: 'end_time',
        width: 170,
        render: (_, r) => formatDateTime(r.detail.end_time, locale),
      },
      {
        title: t('approval.colStatus'),
        key: 'status',
        width: 110,
        render: (_, r) => (
          <Tag color={LEAVE_STATUS_COLOR[r.status]}>{t(`approval.status_${r.status}`)}</Tag>
        ),
      },
      {
        title: t('leaveDetail.reason'),
        dataIndex: ['detail', 'reason'],
        key: 'reason',
        ellipsis: true,
        render: (v: string) => <span title={v}>{v || '—'}</span>,
      },
    ],
    [t, locale],
  )

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.refreshHint')}>
          <Button icon={<ReloadOutlined />} onClick={() => setReloadSeq((s) => s + 1)}>
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReloadSeq((s) => s + 1)}
        />
      ) : (
        <Table<LeaveRow>
          rowKey={(r) => r.detail.id}
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: () => setDetail(record),
            title: t('approval.rowClickHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: MEMBER_DETAIL_PAGE_SIZE,
            total: rows.length,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      <Modal
        open={detail !== null}
        title={t('leaveDetail.title')}
        footer={<Button onClick={() => setDetail(null)}>{t('common.close')}</Button>}
        onCancel={() => setDetail(null)}
        destroyOnHidden
      >
        {detail && (
          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              { key: 'uid', label: t('leaveDetail.applicantId'), children: detail.detail.user_id },
              {
                key: 'type',
                label: t('leaveDetail.leaveType'),
                children: t(`leave.type_${detail.detail.leave_type}`),
              },
              {
                key: 'status',
                label: t('approval.colStatus'),
                children: (
                  <Tag color={LEAVE_STATUS_COLOR[detail.status]}>
                    {t(`approval.status_${detail.status}`)}
                  </Tag>
                ),
              },
              { key: 'reason', label: t('leaveDetail.reason'), children: detail.detail.reason || '—' },
              {
                key: 'start',
                label: t('leaveDetail.startTime'),
                children: formatDateTime(detail.detail.start_time, locale),
              },
              {
                key: 'end',
                label: t('leaveDetail.endTime'),
                children: formatDateTime(detail.detail.end_time, locale),
              },
              {
                key: 'destination',
                label: t('leaveDetail.destination'),
                children: detail.detail.destination || '—',
              },
              {
                key: 'parent',
                label: t('leaveDetail.parentConfirm'),
                children: detail.detail.parent_confirm
                  ? t('leaveDetail.confirmed')
                  : t('leaveDetail.notConfirmed'),
              },
              {
                key: 'created_at',
                label: t('leaveDetail.createdAt'),
                children: formatDateTime(detail.detail.created_at, locale),
              },
            ]}
          />
        )}
      </Modal>
    </>
  )
}
