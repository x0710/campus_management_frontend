import type { PortalKey } from './portals'

export const CAMPUS_PATH = '/campus'
export const LOGIN_PATH = '/campus/login'

/** 门户内部标识不随 URL 层级改变，权限、模块和视图状态继续使用同一标识。 */
export const PORTAL_PATHS: Record<PortalKey, string> = {
  party: '/campus/party',
  branch: '/campus/party/branch',
  academy: '/campus/party/academy',
  school: '/campus/party/school',
  admin: '/campus/admin',
  student: '/campus/student',
  teacher: '/campus/teacher',
  leader: '/campus/leader',
}

export function getPortalPath(portalKey?: string): string {
  return portalKey && Object.hasOwn(PORTAL_PATHS, portalKey) ? PORTAL_PATHS[portalKey as PortalKey] : PORTAL_PATHS.party
}

/** 先匹配较深的支部/党委路径，避免被党员端前缀覆盖。 */
const portalPaths = (Object.entries(PORTAL_PATHS) as [PortalKey, string][])
  .sort((a, b) => b[1].length - a[1].length)

export function getPortalKeyFromPathname(pathname: string): PortalKey | undefined {
  return portalPaths.find(([, path]) => pathname === path || pathname.startsWith(`${path}/`))?.[0]
}

/** 兼容书签、消息链接和已保存的代登录返回地址，保留查询参数与锚点。 */
export function migrateLegacyPath(path: string): string {
  const [, pathname = '', suffix = ''] = path.match(/^([^?#]*)(.*)$/) ?? []
  if (pathname === '/login' || pathname === '/login/') return `${LOGIN_PATH}${suffix}`
  if (['/', '/home', '/home/'].includes(pathname)) return `${CAMPUS_PATH}${suffix}`
  const match = pathname.match(/^\/portal\/([^/]+)(\/.*)?$/)
  if (!match) return path
  const base = Object.hasOwn(PORTAL_PATHS, match[1]!) ? getPortalPath(match[1]) : CAMPUS_PATH
  return `${base}${match[2] ?? ''}${suffix}`
}
