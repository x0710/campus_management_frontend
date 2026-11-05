import { Alert, Descriptions } from 'antd'
import type { PartyScore } from '../api/types/partyScores'
import { useUserNames } from '../composables/useUserNames'
import { useT } from '../i18n'

/** 扣分没有模板或审批实例，单独展示生效状态和操作人。 */
export default function PartyScoreDeductionInfo({ record }: { record: PartyScore }) {
  const t = useT()
  const names = useUserNames(record.operator_id != null ? [record.operator_id] : [])
  return <>
    <Alert type="warning" showIcon title={t('partyDeduction.effective')} style={{ marginBlock: 12 }} />
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label={t('partyDeduction.operator')}>
        {record.operator_id != null ? names.get(record.operator_id) || `#${record.operator_id}` : '—'}
      </Descriptions.Item>
    </Descriptions>
  </>
}
