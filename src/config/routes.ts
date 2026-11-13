import type { PortalKey } from './portals'
import { appPath } from './appBase'

export const CAMPUS_PATH = appPath()
export const LOGIN_PATH = appPath('login')

/** 门户内部标识不随 URL 层级改变，权限、模块和视图状态继续使用同一标识。 */
export const PORTAL_PATHS: Record<PortalKey, string> = {
  party: appPath('member'),
  branch: appPath('branch'),
  academy: appPath('academy'),
  school: appPath('school'),
  admin: appPath('admin'),
  student: appPath('student'),
  teacher: appPath('teacher'),
  leader: appPath('leader'),
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
  if (['/login', '/login/', '/campus/login', '/campus/login/'].includes(pathname)) return `${LOGIN_PATH}${suffix}`
  if (['/', '/home', '/home/', '/campus', '/campus/'].includes(pathname)) return `${CAMPUS_PATH}${suffix}`
  const match = pathname.match(/^\/portal\/([^/]+)(\/.*)?$/)
  if (match) {
    const base = Object.hasOwn(PORTAL_PATHS, match[1]!) ? getPortalPath(match[1]) : CAMPUS_PATH
    return `${base}${match[2] ?? ''}${suffix}`
  }
  // 历史部署路径仅在兼容入口保留，不用于生成新链接。
  const oldPortals: [string, PortalKey][] = [
    ['/campus/party/branch', 'branch'], ['/campus/party/academy', 'academy'],
    ['/campus/party/school', 'school'], ['/campus/admin', 'admin'],
    ['/campus/student', 'student'], ['/campus/teacher', 'teacher'], ['/campus/leader', 'leader'],
  ]
  for (const [oldBase, key] of oldPortals) {
    if (pathname === oldBase || pathname.startsWith(`${oldBase}/`)) {
      return `${getPortalPath(key)}${pathname.slice(oldBase.length)}${suffix}`
    }
  }
  const oldParty = pathname.match(/^\/campus\/party(\/(?:party_m\d+|announcements|party-scores|party-score-approvals|approval-templates|organization-members|feedback|bulk-add-members)(?:\/.*)?)$/)
  if (oldParty) return `${getPortalPath('party')}${oldParty[1]}${suffix}`
  return path
}
