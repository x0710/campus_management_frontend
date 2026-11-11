/** 接口会话缓存：缓存键生成、并发请求合并、缓存失效与账号切换清理。 */

import { http } from './http'
import { useAuthStore } from '../store/auth'
import { GetRequestCache, type CachedGetOptions } from '../utils/getRequestCache'
import { readPreviewData } from './previewDataService'
import { publishCacheInvalidation, subscribeCacheInvalidation } from './cacheInvalidation'

export { makeCacheKey } from '../utils/getRequestCache'
export type { CachedGetOptions } from '../utils/getRequestCache'

const cache = new GetRequestCache((url, params) => http.get(url, { params }).then((res) => res.data))
// 升级时删除旧的永久业务缓存；不再将接口数据写入 localStorage。
try { localStorage.removeItem('campus-organization-data-v1') } catch { /* 本地存储不可用时不影响请求。 */ }
export { subscribeCacheInvalidation }
// HTTP 层发布失效事件时同步清除请求缓存；HTTP 不再依赖此模块。
subscribeCacheInvalidation((prefix) => cache.invalidate(prefix))

/**
 * 相同查询共享在途请求；force 刷新及失效后，旧响应不得写回缓存。
 * @param url 类型：string；默认值：无；是否必填：必填
 * @param params 类型：Record<string, unknown>；默认值：无；是否必填：可选
 * @param opts 类型：CachedGetOptions；默认值：无；是否必填：可选
 * @returns 类型：Promise<T>
 */
export function cachedGet<T>(url: string, params?: Record<string, unknown>, opts?: CachedGetOptions & { preview?: boolean }): Promise<T> {
  const load = (path: string, query?: Record<string, unknown>) => cache.get<unknown>(path, query, opts)
  return opts?.preview === false ? load(url, params) as Promise<T> : readPreviewData<T>(url, params, load)
}

/**
 * 按 METHOD /path 前缀失效；无参数时清除整个会话。
 * @param prefix 类型：string；默认值：无；是否必填：可选
 * @returns 类型：void
 */
export function invalidate(prefix?: string): void {
  publishCacheInvalidation(prefix)
}

/**
 * cacheSize 的参数与返回值说明。
 * @returns 类型：{ resolved: number; inFlight: number; }
 */
export function cacheSize() {
  return cache.size()
}

useAuthStore.subscribe((state, previous) => {
  if (state.token !== previous.token) invalidate()
})
