/** 职务编码 → 展示名称 / 编码的统一 hook。 */

import { useCallback } from 'react'
import { myRolesResource } from '../store/referenceData'
import { useSharedResource } from './useSharedResource'
import { useT } from '../i18n'
import { usePositionNames } from './usePositionNames'

/**
 * 职位统一展示：普通用户只看名称，管理员附带编码；提交值仍使用原编码。
 * @returns 类型：(code: string, name?: string | null | undefined) => string
 */
export function usePositionLabel() {
  return usePositionFormatter(usePositionNames())
}

/**
 * 已有职位详情的页面直接格式化，不额外拉取整份字典。
 * @param names 类型：ReadonlyMap<string, string>；默认值：无；是否必填：必填
 * @returns 类型：(code: string, name?: string | null | undefined) => string
 */
export function usePositionFormatter(names: ReadonlyMap<string, string>) {
  const t = useT()
  const { data: roles } = useSharedResource(myRolesResource)
  const isAdmin = roles.some((role) => ['admin', 'super_admin'].includes(role.code))
  return useCallback((code: string, name?: string | null) => {
    const label = name?.trim() || names.get(code)?.trim() || t('common.unknown')
    return isAdmin && code ? `${label}（${code}）` : label
  }, [names, isAdmin, t])
}
