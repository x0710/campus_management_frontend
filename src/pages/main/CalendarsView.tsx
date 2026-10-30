import { ReloadOutlined } from '@ant-design/icons'
import { Button, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo } from 'react'
import type { CalendarEventInfo, EventType } from '../../api/types/calendars'
import { queryEvents } from '../../api/calendars'
import ErrorState from '../../components/ErrorState'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

const EVENT_COLOR: Record<EventType, string> = {
  holiday: 'blue',
  exam: 'red',
  activity: 'green',
  other: 'default',
}

export default function CalendarsView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { data, total, loading, error, page, setPage, pageSize, setPageSize, refresh } =
    usePaginated<CalendarEventInfo>(queryEvents)

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
          <Tag color={EVENT_COLOR[type]}>{t(`calendar.type_${type}`)}</Tag>
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
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
              onChange: (nextPage: number, nextSize: number) => {
                if (nextSize !== pageSize) setPageSize(nextSize)
                else setPage(nextPage)
              },
            }}
          />
        )}
      </div>
      </section>
    </div>
  )
}
