/** 后端接口根地址，包含接口前缀；修改环境变量后需重新启动或构建。 */
export const API_BASE = (import.meta.env?.VITE_API_BASE?.trim() || '/campus/party/api').replace(/\/+$/, '')

/** 将接口返回的相对附件地址接到配置的根地址，兼容历史 /api 前缀。 */
export function resolveApiUrl(url: string, base = API_BASE): string {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(url)) return url
  const path = `/${url.replace(/^\/+/, '')}`
  const basePath = new URL(base || '/', 'http://localhost').pathname.replace(/\/+$/, '')
  const prefix = basePath && (path === basePath || path.startsWith(`${basePath}/`))
    ? basePath
    : /^\/api(?:\/|$)/.test(path) ? '/api' : ''
  return `${base}${path.slice(prefix.length)}`
}

/** 判断附件地址是否属于 API，兼容后端仍返回 /api 前缀的情况。 */
export function isApiUrl(url: string): boolean {
  return /^\/?api(?:\/|$)/.test(url) || (API_BASE !== '' &&
    (url === API_BASE || url.startsWith(`${API_BASE}/`)))
}
