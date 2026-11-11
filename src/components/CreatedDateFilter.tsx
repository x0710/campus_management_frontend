import { DatePicker, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import type { CreatedDateQuery } from '../api/types/common'
import { useT } from '../i18n'
import { toCreatedDateQuery } from '../utils/dateQuery'

/** 服务端创建日期筛选，明确 UTC 语义；清空时移除参数，允许只填起日或止日。 */
export default function CreatedDateFilter({ value, onChange, label }: {
  value: CreatedDateQuery
  onChange: (value: CreatedDateQuery) => void
  label?: string
}) {
  const t = useT()
  return <Space wrap size="small" className="created-date-filter">
    <Typography.Text type="secondary">{label ?? t('common.createdDateRange')}</Typography.Text>
    <DatePicker.RangePicker
      allowEmpty={[true, true]}
      allowClear
      format="YYYY-MM-DD"
      aria-label={label ?? t('common.createdDateRange')}
      placeholder={[t('common.startDate'), t('common.endDate')]}
      value={[value.start_date ? dayjs(value.start_date) : null, value.end_date ? dayjs(value.end_date) : null]}
      onChange={(_, dates) => onChange(toCreatedDateQuery(dates[0], dates[1]))}
      style={{ width: 270, maxWidth: '100%' }}
    />
  </Space>
}
