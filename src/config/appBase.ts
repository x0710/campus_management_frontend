import { DEFAULT_APP_BASE, normalizeAppBase } from './deployment'

/** BASE_URL 由 Vite 根据 VITE_APP_BASE 生成，根目录部署时内部使用空前缀。 */
export const APP_BASE = normalizeAppBase(import.meta.env?.BASE_URL ?? DEFAULT_APP_BASE)

export function appPath(path = ''): string {
  return `${APP_BASE}/${path.replace(/^\/+/, '')}`.replace(/\/$/, '') || '/'
}
