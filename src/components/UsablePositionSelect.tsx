import { Select } from 'antd'
import type { SelectProps } from 'antd'
import { useEffect, useState } from 'react'
import { listAllPositions } from '../api/positions'
import { useErrorFeedback } from '../composables/useErrorFeedback'

type Props = Omit<SelectProps<string>, 'options'> & { organizationId?: number | null }

/** 切换组织时重建选择器，避免短暂展示上一个组织的职位。 */
export default function UsablePositionSelect(props: Props) {
  return <OrganizationPositionSelect key={props.organizationId ?? 'none'} {...props} />
}

function OrganizationPositionSelect({ organizationId, ...props }: Props) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(Boolean(organizationId))
  const reportError = useErrorFeedback()
  useEffect(() => {
    let cancelled = false
    if (!organizationId) return
    listAllPositions(false, { usable_in_organization_id: organizationId })
      .then((positions) => {
        if (!cancelled) setOptions(positions.map((p) => ({ value: p.code, label: `${p.name}（${p.code}）` })))
      })
      .catch((err) => { if (!cancelled) reportError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [organizationId, reportError])
  return <Select {...props} options={options} loading={loading} disabled={!organizationId || loading} showSearch optionFilterProp="label" />
}
