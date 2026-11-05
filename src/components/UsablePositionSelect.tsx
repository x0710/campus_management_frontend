/** 可用职务下拉选择组件（可按组织过滤）。 */

import { usePositionFormatter } from '../composables/usePositionLabel'
import { Button, Select, Spin } from 'antd'
import type { SelectProps } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { listAllPositions } from '../api/positions'
import { extractErrorReason } from '../api/common'
import { useT } from '../i18n'

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
  const t = useT()
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(Boolean(organizationId))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // 已加载的可用职位足以格式化名称，无需额外请求整份职位字典。
  const names = useMemo(() => new Map(options.map((option) => [option.value, option.label])), [options])
  const positionLabel = usePositionFormatter(names)

  useEffect(() => {
    let cancelled = false
    if (!organizationId) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const positions = await listAllPositions(attempt > 0, { usable_in_organization_id: organizationId })
        if (!cancelled) setOptions(positions.map((position) => ({ value: position.code, label: position.name })))
      } catch (err) {
        if (!cancelled) setError(extractErrorReason(err, t))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [organizationId, attempt, t])

  return (
    <Select
      {...props}
      value={props.value || undefined}
      placeholder={!organizationId ? t('adminOrg.selectOrganizationFirst') : props.placeholder || t('adminOrg.positionPlaceholder')}
      labelRender={({ value, label }) => label ?? positionLabel(String(value))}
      options={options.map((option) => ({ ...option, label: positionLabel(option.value, option.label) }))}
      loading={loading}
      disabled={props.disabled || !organizationId || loading}
      status={error ? 'error' : props.status}
      notFoundContent={loading ? <Spin size="small" /> : error ? (
        <div role="alert" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
          {error}
          <Button type="link" size="small" onMouseDown={(event) => event.preventDefault()} onClick={() => setAttempt((value) => value + 1)}>
            {t('common.refresh')}
          </Button>
        </div>
      ) : t('adminOrg.noUsablePositions')}
      showSearch
      optionFilterProp="label"
    />
  )
}
