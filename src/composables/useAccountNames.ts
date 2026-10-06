/**
 * 用户 ID → 账户用户名批量解析 Hook：
 * 传入任意数量的用户 ID，去重后并行调用 getCredential（GET /api/credentials/{uid}，走会话内缓存），
 * 返回 Map<id, username | null>。无 credential.read 权限或请求失败的 ID 映射为 null，不阻塞其他解析。
 * 适用于组织成员表等需要展示账户用户名的场景（与展示真实姓名的 useUserNames 区分）。
 *
 * 命名说明：不使用 useUsernames，因其与 useUserNames 在大小写不敏感的文件系统（Windows）上同名冲突。
 *
 * 渲染层区分两种状态：
 *   Map 中不存在 key → 尚未解析，展示 loading
 *   Map 中存在 key 但值为 null → 解析失败/无权，展示 '-'
 *   Map 中存在 key 且值为 string → 解析成功，展示用户名
 *
 * 新结果以函数式 setState 与旧状态合并，避免列表刷新时已解析用户名短暂闪回 loading；
 * 已解析 ID 再次进入时由 API 层缓存直接返回，不会产生额外网络请求。
 */
import { useEffect, useMemo, useState } from 'react'
import { getCredential } from '../api/auth'

export function useAccountNames(ids: number[]): Map<number, string | null> {
  const [names, setNames] = useState<Map<number, string | null>>(new Map())

  const uniqueIds = useMemo(() => {
    const set = new Set(ids.filter((id) => Number.isFinite(id) && id > 0))
    return [...set]
  }, [ids])

  useEffect(() => {
    if (uniqueIds.length === 0) return

    let cancelled = false
    const fetched = new Map<number, string | null>()

    void (async () => {
      // 并行请求，每个独立容错；重复 ID 由 API 层缓存命中，不发额外请求
      await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            fetched.set(id, (await getCredential(id)).username)
          } catch {
            fetched.set(id, null)
          }
        }),
      )
      if (!cancelled) {
        // 与旧状态合并，保留其它 ID 的已解析结果
        setNames((prev) => {
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

  return names
}