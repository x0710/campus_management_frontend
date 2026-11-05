/**
 * 用户 ID → 姓名批量解析 Hook：
 * 传入任意数量的用户 ID，分批查询姓名（共享接口缓存），
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
import axios from 'axios'
import { useAuthStore } from '../store/auth'
import { resolveUserNames } from '../api/userNames'

/**
 * useUserNames 的参数与返回值说明。
 * @param ids 类型：number[]；默认值：无；是否必填：必填
 * @param onError 查询失败时的提示回调（可选）；取消、过期会话与登录失效由统一流程处理
 * @returns 类型：Map<number, string | null>
 */
export function useUserNames(ids: number[], onError?: (error: unknown) => void, refreshVersion = 0): Map<number, string | null> {
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
    const token = useAuthStore.getState().token
    const isCurrent = () => !cancelled && token === useAuthStore.getState().token
    let fetched = new Map<number, string | null>()

    void (async () => {
      try {
        const result = await resolveUserNames(uniqueIds, isCurrent)
        fetched = result.names
        if (isCurrent() && result.error) onError?.(result.error)
      } catch (err) {
        if (isCurrent() && !axios.isCancel(err) && !(axios.isAxiosError(err) && err.response?.status === 401)) {
          onError?.(err)
        }
        for (const id of uniqueIds) fetched.set(id, null)
      }

      if (isCurrent()) {
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
  }, [idsKey, onError, refreshVersion])

  return names
}
