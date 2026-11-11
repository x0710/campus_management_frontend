import CreatedDateFilter from '../../components/CreatedDateFilter'
/** 请假列表页（当前未注册路由，保留供复用）。 */

import { ReloadOutlined } from '@ant-design/icons'
import { Button, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import type { LeaveInfo, LeaveType } from '../../api/types/leaves'
import { queryLeaves } from '../../api/leaves'
import ErrorState from '../../components/ErrorState'
import LeaveDetailModal from '../../components/LeaveDetailModal'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { formatPaginationTotal } from '../../utils/pagination'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

const LEAVE_COLOR: Record<LeaveType, string> = {
  personal: 'blue',
  sick: 'orange',
  public: 'green',
  other: 'default',
}

/** LeavesView 组件。
 * @returns 类型：Element
 */
export default function LeavesView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { data, total, loading, error, page, setPage, pageSize, setPageSize, refresh, dateQuery, setDateQuery } =
    usePaginated<LeaveInfo>(queryLeaves, undefined, 'aliased')
  /** 双击行进入的请假详情 ID（代码要求 14） */
  const [detailId, setDetailId] = useState<number | null>(null)

  const columns = useMemo<ColumnsType<LeaveInfo>>(
    () => [
      {
        title: t('leave.colId'),
        dataIndex: 'id',
        key: 'id',
        width: 110,
      },
      {
        title: t('leave.colType'),
        dataIndex: 'leave_type',
        key: 'leave_type',
        width: 130,
        render: (type: LeaveType) => (
          <Tag color={LEAVE_COLOR[type]}>{t(`leave.type_${type}`)}</Tag>
        ),
      },
      {
        title: t('leave.colStart'),
        dataIndex: 'start_time',
        key: 'start_time',
        width: 190,
        render: (value: string) => formatDateTime(value, locale),
      },
      {
        title: t('leave.colEnd'),
        dataIndex: 'end_time',
        key: 'end_time',
        width: 190,
        render: (value: string) => formatDateTime(value, locale),
      },
      {
        title: t('leave.colApproval'),
        dataIndex: 'approval_id',
        key: 'approval_id',
        width: 130,
      },
    ],
    [t, locale],
  )

  return (
    // 数据展示页固定布局：标题/刷新固定，仅请假列表在卡片体内滚动（代码要求 23）
    <div className="data-page-view">
      <section className="panel-card">
      <header className="panel-card-header">
        <h3 className="panel-card-title">{t('leave.title')}</h3>
        <CreatedDateFilter value={dateQuery} onChange={setDateQuery} />
          <Button icon={<ReloadOutlined />} onClick={refresh}>
          {t('common.refresh')}
        </Button>
      </header>
      <div className="panel-card-body">
        {error ? (
          <ErrorState
            message={error}
            onRetry={refresh}
          />
        ) : (
          <Table<LeaveInfo>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            scroll={{ x: 760 }}
            // 整行双击进入请假详情（代码要求 14）
            onRow={(row) => ({
              onDoubleClick: () => setDetailId(row.id),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (n: number) => formatPaginationTotal(t, n, pageSize),
              onChange: (nextPage: number, nextSize: number) => {
                if (nextSize !== pageSize) setPageSize(nextSize)
                else setPage(nextPage)
              },
            }}
          />
        )}
      </div>
      </section>
      <LeaveDetailModal
        open={detailId !== null}
        leaveId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}
