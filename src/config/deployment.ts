/** 部署路径的默认值；Vite 与运行时共用，避免资源和页面路由各自配置。 */
export const DEFAULT_APP_BASE = '/campus/party'

export function normalizeAppBase(value = DEFAULT_APP_BASE): string {
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//') || /[?#]/.test(path)) {
    throw new Error('VITE_APP_BASE must be an absolute pathname, for example /campus/party')
  }
  return path.replace(/\/+$/, '')
}

/**
 * 管理端入口路径：与站点基础路径同级，不继承 party 前缀。
 * 例如 /campus/party -> /campus/admin；根目录部署 -> /admin。
 * 部署时 Nginx 需把该前缀同样回退到前端 index.html。
 */
export function adminBaseOf(appBase: string = DEFAULT_APP_BASE): string {
  // 根目录部署时 BASE_URL 为 /，归一化后 APP_BASE 是空串，不能再次校验
  const base = appBase.trim() === '' ? '' : normalizeAppBase(appBase)
  return `${base.slice(0, base.lastIndexOf('/'))}/admin`
}
