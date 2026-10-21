/**
 * 用户 ID → 姓名批量解析 Hook：
 * 传入任意数量的用户 ID，去重后通过 queryUsers 的 uid 批量参数一次查询（走会话内缓存 cachedGet），
 * 返回 Map<id, name | null>。请求失败或不存在的 ID 映射为 null，不阻塞其他解析。
 * 适用于公告列表发布人列、公告详情发布人、组织成员表等需要批量展示姓名的场景。
 *
 * 渲染层区分两种状态：
 *   Map 中不存在 key → 尚未解析，展示 loading
 *   Map 中存在 key 但值为 null → 解析失败，展示 '-'
 *   Map 中存在 key 且值为 string → 解析成功，展示姓名
 *
 * 新结果以函数式 setState 与旧状态合并，避免列表刷新时已解析姓名短暂闪回 loading；
 * 已解析 ID 再次进入时由 API 层缓存直接返回，不会产生额外网络请求。
 */
import { useEffect, useMemo, useState } from 'react'
import { queryUsers } from '../api/users'

export function useUserNames(ids: number[]): Map<number, string | null> {
  const [names, setNames] = useState<Map<number, string | null>>(new Map())

  // 依赖稳定的字符串 key 而不是数组引用：调用方常写成
  // useUserNames(detail ? [detail.user_id] : [])，每次渲染都会新建数组。
  // 若直接依赖数组，会出现 effect → setNames → 重渲染 → 新数组 → effect 的无限循环；
  // 请求失败（如缺少 user.read 权限返回 403）时失败结果不进缓存，表现为持续重复请求。
  const idsKey = useMemo(() => {
    const set = new Set(ids.filter((id) => Number.isFinite(id) && id > 0))
    return [...set].sort((a, b) => a - b).join(',')
  }, [ids])

  useEffect(() => {
    if (!idsKey) return

    const uniqueIds = idsKey.split(',').map(Number)
    let cancelled = false
    const fetched = new Map<number, string | null>()

    void (async () => {
      try{
        // 后端已支持 uid 批量查询：一次请求取回所有用户姓名
        const res = await queryUsers({
          ids: uniqueIds.join(','),
          page: 1,
          page_size: Math.min(uniqueIds.length, 100),
        })
        for (const user of res.data) {
          fetched.set(user.uid, user.name || null)
        }
      }catch{
        // 批量请求失败时保持 Map 缺失，由渲染层兜底
        for (const id of uniqueIds) fetched.set(id, null)
      }

      if (!cancelled) {
        // 与旧状态合并，保留其它 ID 的已解析结果
        setNames((prev) => {
          const next = new Map(prev)
          for (const id of uniqueIds) next.set(id, fetched.get(id) ?? null)
          return next
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [idsKey])

  return names
}
