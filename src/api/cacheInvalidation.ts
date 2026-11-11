/** 缓存失效事件中心。独立于 HTTP 与缓存实现，避免 http ↔ cache 循环依赖。 */
const listeners = new Set<(prefix?: string) => void>()

export function publishCacheInvalidation(prefix?: string): void {
  for (const listener of listeners) listener(prefix)
}

export function subscribeCacheInvalidation(listener: (prefix?: string) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
