import { TreeSelect } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { listAllOrganizations } from '../api/organizations'
import type { OrganizationInfo } from '../api/types/organizations'
import { extractErrorReason } from '../api/common'
import { useT } from '../i18n'
import ErrorState from './ErrorState'
import { collectOrgSubtree } from '../utils/orgTree'

interface Props {
  rootOrgId?: number
  value?: number
  onChange?: (value: number | undefined) => void
  disabled?: boolean
  placeholder?: string
}

/** 使用可访问的组织构建选择树；缺少上级节点时仍将该组织展示为根节点。 */
export default function OrganizationSelect({ rootOrgId, ...props }: Props) {
  const t = useT()
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const items = await listAllOrganizations(attempt > 0)
        if (!cancelled) setOrganizations(items)
      } catch (err) {
        if (!cancelled) setError(extractErrorReason(err, t))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [attempt, t])

  const treeData = useMemo(() => {
    const scoped = collectOrgSubtree(organizations, rootOrgId)
    const ids = new Set(scoped.map((org) => org.id))
    return scoped.map((org) => ({
      id: org.id,
      pId: org.parent_id !== null && ids.has(org.parent_id) ? org.parent_id : null,
      value: org.id,
      title: `${org.name}（${org.code}）`,
    }))
  }, [organizations, rootOrgId])

  return (
    <div>
      <TreeSelect<number>
        {...props}
        style={{ width: '100%' }}
        treeDataSimpleMode
        treeData={treeData}
        showSearch
        allowClear
        treeNodeFilterProp="title"
        loading={loading}
        disabled={props.disabled || loading || error !== null}
        notFoundContent={t('common.noData')}
      />
      {error && <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />}
    </div>
  )
}
