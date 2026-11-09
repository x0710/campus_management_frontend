/**
 * 门户访问权限校验：读取当前登录用户的系统角色与组织任职职位，
 * 判断其是否有权进入指定门户（超级管理员可进入全部门户）。
 * 供 PortalWorkspace / PortalModuleRoute 在入口处兜底，
 * 防止普通用户手动输入 URL 直接进入未授权门户（最终仍由后端 403 兜底）。
 */
import {
  getAccessiblePortalKeys,
  isSuperAdminRole,
  type PortalKey,
} from '../config/portals'
import { useSharedResource } from '../composables/useSharedResource'
import { myRolesResource, myPortalPositionsResource } from '../store/referenceData'

/**
 * 查询当前用户是否有权访问指定门户。
 * @param portalKey 类型：string | undefined；默认值：无；是否必填：必填
 * @returns 类型：boolean | null（null 表示身份仍在加载；true 可访问；false 无权访问）
 */
export function usePortalAccess(portalKey: string | undefined): boolean | null {
  const { data: roles, loaded } = useSharedResource(myRolesResource)
  const { data: positions, loaded: positionsLoaded } = useSharedResource(myPortalPositionsResource)

  if (!portalKey) return false
  // 角色尚未加载完成时返回 null，避免把管理端用户误判为无权而重定向
  if (!loaded) return null
  if (roles.some(isSuperAdminRole)) return true
  // 管理端只依赖系统角色，不必等待组织任职接口。
  if (portalKey === 'admin') return getAccessiblePortalKeys(roles).includes('admin')
  if (!positionsLoaded) return null
  return getAccessiblePortalKeys(roles, positions).includes(portalKey as PortalKey)
}
