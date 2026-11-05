import { useEffect, useSyncExternalStore } from 'react'
import type { createSharedResource } from '../utils/sharedResource'

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
