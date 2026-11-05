/** 共享资源订阅 hook（基于 useSyncExternalStore 与缓存资源）。 */

import { useEffect, useSyncExternalStore } from 'react'
import type { createSharedResource } from '../utils/sharedResource'

/**
 * useSharedResource 的参数与返回值说明。
 * @param resource 类型：ReturnType<typeof createSharedResource<T>>；默认值：无；是否必填：必填
 * @returns 类型：{ data: T; loading: boolean; error: unknown; loaded: boolean; }
 */
export function useSharedResource<T>(resource: ReturnType<typeof createSharedResource<T>>) {
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot)
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void resource.load() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [resource])
  return snapshot
}
