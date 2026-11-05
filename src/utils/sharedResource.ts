/**
 * 多个组件共享一份派生数据；失效或会话切换后，旧请求不能恢复旧快照。
 * @param loadData 类型：(force?: boolean) => Promise<T>；默认值：无；是否必填：必填
 * @param initial 类型：T；默认值：无；是否必填：必填
 * @param maxAgeMs 类型：number；默认值：无；是否必填：必填
 * @returns 类型：{ getSnapshot: () => { data: T; loading: boolean; error: unknown; loaded: boolean; }; subscribe(listener: () => void): () => void; load: (force?: boolean) => Promise<void>; invalidate(clear?: boolean): void; }
 */
export function createSharedResource<T>(loadData: (force?: boolean) => Promise<T>, initial: T, maxAgeMs: number) {
  let snapshot = { data: initial, loading: false, error: null as unknown, loaded: false }
  let loadedAt = -Infinity
  let sequence = 0
  let pending: Promise<void> | undefined
  const listeners = new Set<() => void>()
  const publish = () => { for (const listener of listeners) listener() }

  function load(force = false): Promise<void> {
    if (pending && !force) return pending
    if (!force && Date.now() - loadedAt < maxAgeMs) return Promise.resolve()
    const current = ++sequence
    snapshot = { ...snapshot, loading: true, error: null }
    const request = Promise.resolve().then(() => current === sequence ? loadData(force) : initial).then((data) => {
      if (current !== sequence) return
      loadedAt = Date.now()
      snapshot = { data, loading: false, error: null, loaded: true }
    }, (error: unknown) => {
      if (current !== sequence) return
      // 失败保留现有数据，并短暂限流，避免大量组件连续重试同一失败请求。
      loadedAt = Date.now() - maxAgeMs + Math.min(maxAgeMs, 5_000)
      snapshot = { ...snapshot, loading: false, error, loaded: true }
    }).finally(() => {
      if (current !== sequence) return
      pending = undefined
      publish()
    })
    pending = request
    publish()
    return request
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      void load()
      return () => { listeners.delete(listener) }
    },
    load,
    invalidate(clear = false) {
      sequence += 1
      pending = undefined
      loadedAt = -Infinity
      snapshot = {
        data: clear ? initial : snapshot.data,
        loading: false,
        error: null,
        loaded: clear ? false : snapshot.loaded,
      }
      publish()
      // 等同步身份切换完成再加载，不能使用切换前的凭据请求新会话数据。
      queueMicrotask(() => { if (listeners.size) void load() })
    },
  }
}
