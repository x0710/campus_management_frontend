/** 接口会话缓存：缓存键生成、并发请求合并、缓存失效与账号切换清理。 */

import { http } from './http'
import { useAuthStore } from '../store/auth'
import { GetRequestCache, type CachedGetOptions } from '../utils/getRequestCache'

export { makeCacheKey } from '../utils/getRequestCache'
export type { CachedGetOptions } from '../utils/getRequestCache'

const cache = new GetRequestCache((url, params) => http.get(url, { params }).then((res) => res.data))
const listeners = new Set<(prefix?: string) => void>()

/**
 * 相同查询共享在途请求；force 刷新及失效后，旧响应不得写回缓存。
 * @param url 类型：string；默认值：无；是否必填：必填
 * @param params 类型：Record<string, unknown>；默认值：无；是否必填：可选
 * @param opts 类型：CachedGetOptions；默认值：无；是否必填：可选
 * @returns 类型：Promise<T>
 */
export function cachedGet<T>(url: string, params?: Record<string, unknown>, opts?: CachedGetOptions): Promise<T> {
  return cache.get<T>(url, params, opts)
}

/**
 * 按 METHOD /path 前缀失效；无参数时清除整个会话。
 * @param prefix 类型：string；默认值：无；是否必填：可选
 * @returns 类型：void
 */
export function invalidate(prefix?: string): void {
  cache.invalidate(prefix)
  for (const listener of listeners) listener(prefix)
}

/**
 * 派生的共享数据也需要响应 mutation 和账号切换。
 * @param listener 类型：(prefix?: string) => void；默认值：无；是否必填：必填
 * @returns 类型：() => void
 */
export function subscribeCacheInvalidation(listener: (prefix?: string) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * cacheSize 的参数与返回值说明。
 * @returns 类型：{ resolved: number; inFlight: number; }
 */
export function cacheSize() { return cache.size() }

useAuthStore.subscribe((state, previous) => {
  if (state.token !== previous.token) invalidate()
})
