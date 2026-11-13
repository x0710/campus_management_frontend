/** 部署路径的默认值；Vite 与运行时共用，避免资源和页面路由各自配置。 */
export const DEFAULT_APP_BASE = '/campus/party'

export function normalizeAppBase(value = DEFAULT_APP_BASE): string {
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//') || /[?#]/.test(path)) {
    throw new Error('VITE_APP_BASE must be an absolute pathname, for example /campus/party')
  }
  return path.replace(/\/+$/, '')
}
