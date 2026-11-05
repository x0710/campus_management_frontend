export interface CachedGetOptions {
  force?: boolean
  maxAgeMs?: number
}

type Params = Record<string, unknown> | undefined

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toJSON()
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .filter(([, item]) => item !== undefined).map(([key, item]) => [key, canonical(item)]))
  }
  return value
}

/** 结构化编码，避免参数中的 &、=、逗号及嵌套对象造成键冲突。 */
export function makeCacheKey(method: 'GET', url: string, params?: Params): string {
  const query = params && Object.keys(params).length ? JSON.stringify(canonical(params)) : ''
  return `${method} ${url}${query ? `?${encodeURIComponent(query)}` : ''}`
}

/** 业务数据缓存 30 秒，参考字典缓存 5 分钟；最多保留 500 条结果。 */
export class GetRequestCache {
  private resolved = new Map<string, { data: unknown; expiresAt: number }>()
  private pending = new Map<string, Promise<unknown>>()
  private fetch: (url: string, params: Params) => Promise<unknown>
  private now: () => number
  private capacity: number

  constructor(fetch: (url: string, params: Params) => Promise<unknown>, now = Date.now, capacity = 500) {
    this.fetch = fetch
    this.now = now
    this.capacity = capacity
  }

  get<T>(url: string, params?: Params, options?: CachedGetOptions): Promise<T> {
    const key = makeCacheKey('GET', url, params)
    const cached = this.resolved.get(key)
    if (!options?.force && cached && cached.expiresAt > this.now()) {
      this.resolved.delete(key)
      this.resolved.set(key, cached)
      return Promise.resolve(cached.data as T)
    }
    this.resolved.delete(key)
    const pending = this.pending.get(key)
    if (pending && !options?.force) return pending as Promise<T>

    const maxAge = options?.maxAgeMs ?? (/^\/(positions|rbac\/permissions)(\/|$)/.test(url) ? 300_000 : 30_000)
    const request = this.fetch(url, params).then((data) => {
      // Promise 本身就是请求凭据，不需要永久保存每个查询的代次。
      if (this.pending.get(key) === request && maxAge > 0) {
        this.resolved.delete(key)
        this.resolved.set(key, { data, expiresAt: this.now() + maxAge })
        for (const [entryKey, entry] of this.resolved) {
          if (entry.expiresAt <= this.now()) this.resolved.delete(entryKey)
        }
        while (this.resolved.size > this.capacity) {
          this.resolved.delete(this.resolved.keys().next().value!)
        }
      }
      return data as T
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key)
    })
    this.pending.set(key, request)
    return request
  }

  invalidate(prefix?: string) {
    for (const key of this.resolved.keys()) {
      if (!prefix || key.startsWith(prefix)) this.resolved.delete(key)
    }
    for (const key of this.pending.keys()) {
      if (!prefix || key.startsWith(prefix)) this.pending.delete(key)
    }
  }

  size() { return { resolved: this.resolved.size, inFlight: this.pending.size } }
}
