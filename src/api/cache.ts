/** 缓存模块 */

import type { AxiosResponse } from 'axios'
import { http } from './http'

/**
 * 会话级内存缓存 — 仅前端模块作用域，页面刷新即清空。
 * - 参考数据（组织树、职位、角色、权限、当前用户等）只变化于 mutation 之后，
 *   命中缓存时直接返回已解析的数据，不再发网络请求。
 * - in-flight Promise 也做了共享：并发相同 key 只发一次请求（强制刷新除外，见下）。
 */

/** 已解析的响应缓存：key → data */
const resolvedCache = new Map<string, unknown>()

/** 正在进行中的请求：key → Promise<data>（避免并发重复请求） */
const inFlight = new Map<string, Promise<unknown>>()

/**
 * 每个 key 的请求代次：每次真正发请求（含强制刷新）/ 失效缓存都会自增。
 * 只有「最新代次」的响应可以写入已解析缓存并清理 in-flight 记录，
 * 避免旧请求（尤其是强制刷新期间仍在途的旧请求）后完成时覆盖新数据或误删新记录。
 */
const generation = new Map<string, number>()

/** 递增指定 key 的代次并返回新代次 */
function nextGeneration(key: string): number {
  const seq = (generation.get(key) ?? 0) + 1
  generation.set(key, seq)
  return seq
}

/** 把 params 按 key 排序序列化成稳定字符串，保证 {a:1,b:2} 与 {b:2,a:1} 同 key */
function paramsToString(params: Record<string, unknown> | undefined): string {
  if (!params) return ''
  const entries = Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v ?? ''}`)
    .join('&')
}

/** 生成缓存 key，格式：METHOD /path?params */
export function makeCacheKey(
  method: 'GET',
  url: string,
  params?: Record<string, unknown>,
): string {
  const qs = paramsToString(params)
  return qs ? `${method} ${url}?${qs}` : `${method} ${url}`
}

/** cachedGet 选项 */
export interface CachedGetOptions {
  /**
   * 强制绕过已解析缓存并重新请求（用于手动刷新）。
   * 与旧实现不同：强制刷新不再复用进行中的相同请求，
   * 因此刷新期间发起的请求一定能拿到本次刷新发起之后的数据。
   */
  force?: boolean
}

/**
 * 带缓存的 GET：先查 resolvedCache → 再查 inFlight → 都没命中才真正请求。
 * 成功后写入 resolvedCache；失败则不缓存（下一次可重试）。
 * opts.force=true 时跳过已解析缓存，并且绕过进行中的旧请求（新代次），
 * 旧请求即使后完成也不会写入缓存。
 */
export function cachedGet<T>(
  url: string,
  params?: Record<string, unknown>,
  opts?: CachedGetOptions,
): Promise<T> {
  const key = makeCacheKey('GET', url, params)

  // 1) 已解析的结果直接返回（手动强制刷新除外）
  if (!opts?.force && resolvedCache.has(key)) {
    return Promise.resolve(resolvedCache.get(key) as T)
  }

  // 2) 进行中的相同请求：普通读取共享同一 Promise；
  //    强制刷新则不复用（旧请求可能早于本次刷新意图发起，直接返回它会拿到旧数据）
  const pending = inFlight.get(key)
  if (pending && !opts?.force) {
    return pending as Promise<T>
  }

  // 3) 真正发请求（代次保证只有最新请求能写缓存 / 清理 in-flight）
  const seq = nextGeneration(key)
  const promise = http
    .get(url, { params })
    .then((res: AxiosResponse) => {
      if (generation.get(key) === seq) {
        resolvedCache.set(key, res.data)
      }
      return res.data as T
    })
    .finally(() => {
      // 仅清理本次请求对应的 in-flight 记录，避免误删后续强制刷新写入的新记录
      if (generation.get(key) === seq) {
        inFlight.delete(key)
      }
    })

  inFlight.set(key, promise)
  return promise
}

/**
 * 清除单条缓存（精确匹配 key），或按前缀批量清除。
 * - invalidate()  — 清空全部
 * - invalidate('GET /organizations') — 清除所有组织相关缓存（前缀匹配）
 * - invalidate(getCacheKey('GET', '/organizations')) — 清除精确 key
 *
 * 失效时同步递增受影响 key 的代次：失效前已在途的请求即使随后返回，
 * 也不会把失效前的旧数据写回缓存。
 */
export function invalidate(match?: string): void {
  if (!match) {
    resolvedCache.clear()
    inFlight.clear()
    for (const k of generation.keys()) nextGeneration(k)
    return
  }
  // 前缀匹配：key 以 match 开头就清除
  for (const k of resolvedCache.keys()) {
    if (k.startsWith(match)) resolvedCache.delete(k)
  }
  for (const k of inFlight.keys()) {
    if (k.startsWith(match)) {
      inFlight.delete(k)
      nextGeneration(k)
    }
  }
}

/** 调试用：当前缓存条目数 */
export function cacheSize(): { resolved: number; inFlight: number } {
  return { resolved: resolvedCache.size, inFlight: inFlight.size }
}
