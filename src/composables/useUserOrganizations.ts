/**
 * 用户 ID → 任职组织列表批量解析 Hook：
 * 传入任意数量的用户 ID，去重后并行调用 listUserOrganizations（走会话内缓存 cachedGet），
 * 返回 Map<uid, UserOrganization[]>。请求失败的 ID 映射为空数组，不阻塞其他解析。
 * 适用于组织架构成员表展示用户所属组织等场景。
 *
 * Map 中不存在 key 表示尚未解析，存在 key（含空数组）表示解析完成。
 * 新结果以函数式 setState 与旧状态合并，避免列表刷新时已解析数据闪回 loading；
 * 已解析 ID 再次进入时由 API 层缓存直接返回，不会产生额外网络请求。
 */
import { useEffect, useMemo, useState } from 'react'
import { listUserOrganizations } from '../api/organizations'
import type { UserOrganization } from '../api/types/organizations'

export function useUserOrganizations(
  ids: number[],
): Map<number, UserOrganization[]> {
  const [orgMap, setOrgMap] = useState<Map<number, UserOrganization[]>>(new Map())

  const uniqueIds = useMemo(() => {
    const set = new Set(ids.filter((id) => Number.isFinite(id) && id > 0))
    return [...set]
  }, [ids])

  useEffect(() => {
    if (uniqueIds.length === 0) return

    let cancelled = false
    const fetched = new Map<number, UserOrganization[]>()

    void (async () => {
      // 并行请求，每个独立容错；重复 ID 由 API 层缓存命中，不发额外请求
      await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            fetched.set(id, await listUserOrganizations(id))
          } catch {
            fetched.set(id, [])
          }
        }),
      )
      if (!cancelled) {
        // 与旧状态合并，保留其它 ID 的已解析结果
        setOrgMap((prev) => {
          const next = new Map(prev)
          for (const [k, v] of fetched) next.set(k, v)
          return next
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [uniqueIds])

  return orgMap
}
