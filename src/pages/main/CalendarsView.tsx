/** 校历列表页（当前未注册路由，保留供复用）。 */

import { ReloadOutlined } from '@ant-design/icons'
import { Button, Descriptions, Modal, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import type { CalendarEventInfo, EventType } from '../../api/types/calendars'
import { queryEvents } from '../../api/calendars'
import { CALENDAR_EVENT_COLOR } from '../../config/calendar'
import ErrorState from '../../components/ErrorState'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { formatPaginationTotal } from '../../utils/pagination'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** CalendarsView 组件。
 * @returns 类型：Element
 */
export default function CalendarsView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { data, total, loading, error, page, setPage, pageSize, setPageSize, refresh } =
    usePaginated<CalendarEventInfo>(queryEvents)
  /** 双击行进入的事件详情（代码要求 14） */
  const [selected, setSelected] = useState<CalendarEventInfo | null>(null)

  const columns = useMemo<ColumnsType<CalendarEventInfo>>(
    () => [
      {
        title: t('calendar.colTitle'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
      },
      {
        title: t('calendar.colType'),
        dataIndex: 'event_type',
        key: 'event_type',
        width: 120,
        render: (type: EventType) => (
          <Tag color={CALENDAR_EVENT_COLOR[type]}>{t(`calendar.type_${type}`)}</Tag>
        ),
      },
      {
        title: t('calendar.colStart'),
        dataIndex: 'start_date',
        key: 'start_date',
        width: 190,
        render: (value: string) => formatDateTime(value, locale),
      },
      {
        title: t('calendar.colEnd'),
        dataIndex: 'end_date',
        key: 'end_date',
        width: 190,
        render: (value: string) => formatDateTime(value, locale),
      },
    ],
    [t, locale],
  )

  return (
    // 数据展示页固定布局：标题/刷新固定，仅校历列表在卡片体内滚动（代码要求 23）
    <div className="data-page-view">
      <section className="panel-card">
      <header className="panel-card-header">
        <h3 className="panel-card-title">{t('calendar.title')}</h3>
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
          <Table<CalendarEventInfo>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            scroll={{ x: 720 }}
            // 整行双击进入事件详情（代码要求 14）
            onRow={(row) => ({
              onDoubleClick: () => setSelected(row),
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
      <Modal
        open={selected !== null}
        title={t('calendar.detailTitle')}
        footer={null}
        onCancel={() => setSelected(null)}
        width={560}
      >
        {selected ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('calendar.colTitle')}>
              {selected.title}
            </Descriptions.Item>
            <Descriptions.Item label={t('calendar.colType')}>
              <Tag color={CALENDAR_EVENT_COLOR[selected.event_type]}>
                {t(`calendar.type_${selected.event_type}`)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('calendar.fieldRange')}>
              {formatDateTime(selected.start_date, locale)}
              {' ~ '}
              {formatDateTime(selected.end_date, locale)}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </div>
  )
}
