import { useLocation, useParams } from 'react-router'
import { getPortalKeyFromPathname } from '../config/routes'

/** 路由参数与当前门户统一读取，页面不需要感知各门户 URL 深度。 */
export function usePortalParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>() {
  const params = useParams<T>()
  const { pathname } = useLocation()
  return { ...params, portalKey: getPortalKeyFromPathname(pathname) }
}
