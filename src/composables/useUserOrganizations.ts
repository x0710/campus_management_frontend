/**
 * 用户 ID → 任职组织列表批量解析 Hook：
 * 传入任意数量的用户 ID，去重后一次性批量调用 listUserOrganizationsBatch
 * （GET /api/organization-members?uids=1,2,3，走会话内缓存 cachedGet），
 * 返回 Map<uid, UserOrganization[]>。批量请求失败的 ID 映射为空数组，不阻塞页面其他内容。
 * 适用于组织架构成员表展示用户所属组织等场景。
 *
 * Map 中不存在 key 表示尚未解析，存在 key（含空数组）表示解析完成。
 * 新结果以函数式 setState 与旧状态合并，避免列表刷新时已解析数据闪回 loading；
 * 已解析 ID 再次进入时由 API 层缓存直接返回，不会产生额外网络请求。
 */
import { useEffect, useMemo, useState } from 'react'
import { listUserOrganizationsBatch } from '../api/organizations'
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

    void (async () => {
      // 先按请求的 ID 全部初始化为空数组，再按返回结果分组；
      // 一次批量请求即可覆盖全部 ID，避免逐用户请求（接口支持 uids 批量）
      const fetched = new Map<number, UserOrganization[]>()
      for (const id of uniqueIds) fetched.set(id, [])
      try {
        const list = await listUserOrganizationsBatch(uniqueIds)
        for (const item of list) {
          const arr = fetched.get(item.user_id)
          if (arr) arr.push(item)
          else fetched.set(item.user_id, [item])
        }
      } catch {
        // 批量请求失败：全部 ID 保持空数组，不影响页面其他内容
      }
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
