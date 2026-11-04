import { useEffect, useState } from 'react'
import { getOrganization } from '../api/organizations'

/** 按 ID 显示组织名称，相同组织的并发查询由接口缓存合并。 */
export default function OrganizationName({ id }: { id: number }) {
  const [organization, setOrganization] = useState<{ id: number; name: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getOrganization(id)
      .then((value) => {
        if (!cancelled) setOrganization(value)
      })
      .catch(() => {
        // 无权限或组织已删除时保留 ID，避免显示错误的组织归属。
        if (!cancelled) setOrganization(null)
      })
    return () => { cancelled = true }
  }, [id])

  return <>{organization?.id === id && organization.name ? organization.name : `#${id}`}</>
}
