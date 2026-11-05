import { useCallback } from 'react'
import { myRolesResource } from '../store/referenceData'
import { useSharedResource } from './useSharedResource'
import { useT } from '../i18n'
import { usePositionNames } from './usePositionNames'

/** 职位统一展示：普通用户只看名称，管理员附带编码；提交值仍使用原编码。 */
export function usePositionLabel() {
  return usePositionFormatter(usePositionNames())
}

/** 已有职位详情的页面直接格式化，不额外拉取整份字典。 */
export function usePositionFormatter(names: ReadonlyMap<string, string>) {
  const t = useT()
  const { data: roles } = useSharedResource(myRolesResource)
  const isAdmin = roles.some((role) => ['admin', 'super_admin'].includes(role.code))
  return useCallback((code: string, name?: string | null) => {
    const label = name?.trim() || names.get(code)?.trim() || t('common.unknown')
    return isAdmin && code ? `${label}（${code}）` : label
  }, [names, isAdmin, t])
}
