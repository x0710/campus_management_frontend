/** 共享资源订阅 hook（基于 useSyncExternalStore 与缓存资源）。 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { createSharedResource } from '../utils/sharedResource'

/**
 * useSharedResource 的参数与返回值说明。
 * @param resource 类型：ReturnType<typeof createSharedResource<T>>；默认值：无；是否必填：必填
 * @returns 类型：{ data: T; loading: boolean; error: unknown; loaded: boolean; }
 */
export function useSharedResource<T>(resource: ReturnType<typeof createSharedResource<T>>, enabled = true) {
  const subscribe = useCallback((listener: () => void) => enabled ? resource.subscribe(listener) : () => {}, [resource, enabled])
  const snapshot = useSyncExternalStore(subscribe, resource.getSnapshot)
  useEffect(() => {
    if (!enabled) return
    const refresh = () => { if (document.visibilityState === 'visible') void resource.load() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [resource, enabled])
  return snapshot
}
