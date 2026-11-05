import { useCallback, useEffect, useState } from 'react'
import { getMyRoles } from '../api/auth'
import { useT } from '../i18n'
import { usePositionNames } from './usePositionNames'

/** 职位统一展示：普通用户只看名称，管理员附带编码；提交值仍使用原编码。 */
export function usePositionLabel() {
  const names = usePositionNames()
  const t = useT()
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    let cancelled = false
    void getMyRoles().then((roles) => {
      if (!cancelled) setIsAdmin(roles.some((role) => ['admin', 'super_admin'].includes(role.code)))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  return useCallback((code: string, name?: string | null) => {
    const label = name?.trim() || names.get(code)?.trim() || t('common.unknown')
    return isAdmin && code ? `${label}（${code}）` : label
  }, [names, isAdmin, t])
}
