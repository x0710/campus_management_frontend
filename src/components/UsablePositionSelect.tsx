/** 可用职务下拉选择组件（可按组织过滤）。 */

import { usePositionLabel } from '../composables/usePositionLabel'
import { Select } from 'antd'
import type { SelectProps } from 'antd'
import { useEffect, useState } from 'react'
import { listAllPositions } from '../api/positions'
import { useErrorFeedback } from '../composables/useErrorFeedback'

type Props = Omit<SelectProps<string>, 'options'> & { organizationId?: number | null }

/**
 * 切换组织时重建选择器，避免短暂展示上一个组织的职位。
 * @param props 类型：Props；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function UsablePositionSelect(props: Props) {
  return <OrganizationPositionSelect key={props.organizationId ?? 'none'} {...props} />
}

function OrganizationPositionSelect({ organizationId, ...props }: Props) {
  const positionLabel = usePositionLabel()
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(Boolean(organizationId))
  const reportError = useErrorFeedback()
  useEffect(() => {
    let cancelled = false
    if (!organizationId) return
    listAllPositions(false, { usable_in_organization_id: organizationId })
      .then((positions) => {
        if (!cancelled) setOptions(positions.map((p) => ({ value: p.code, label: p.name })))
      })
      .catch((err) => { if (!cancelled) reportError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [organizationId, reportError])
  return <Select {...props} labelRender={({ value, label }) => label ?? positionLabel(String(value))} options={options.map((option) => ({ ...option, label: positionLabel(option.value, option.label) }))} loading={loading} disabled={!organizationId || loading} showSearch optionFilterProp="label" />
}
