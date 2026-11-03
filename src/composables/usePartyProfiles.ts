/**
 * 党员档案（党员编号 / 入党时间）批量解析 Hook。
 *
 * 传入用户 ID，经 `GET /api/party/profiles?uids=` 一次查询（走会话缓存），
 * 返回 Map<用户 ID, PartyProfile> 与加载状态；无档案的用户不会出现在 Map 中。
 * 适用于党员端「我的」与成员详情「党员信息」等需要展示党员编号 / 入党时间的场景。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { queryPartyProfiles } from '../api/partyProfiles'
import type { PartyProfile } from '../api/types/partyProfiles'

/** usePartyProfiles 返回结果 */
export interface PartyProfilesState {
  /** 用户 ID → 党员档案（无档案的用户不在 Map 中） */
  profiles: Map<number, PartyProfile>
  /** 是否仍在加载 */
  loading: boolean
  /** 查询成功但结果中不存在的用户 ID（用于区分「无记录 → 未查到」与「字段为空 → 暂无数据」） */
  notFound: Set<number>
  /** 重新查询（保存党员档案后调用，使展示立即刷新） */
  refresh: () => void
}

/**
 * 批量查询党员档案。
 * @param uids 用户 ID 数组（可为空；为空时不发请求并清空结果）
 * @returns 党员档案 Map、加载状态与未查到的用户 ID
 */
export function usePartyProfiles(uids: number[]): PartyProfilesState {
  const [profiles, setProfiles] = useState<Map<number, PartyProfile>>(new Map())
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState<Set<number>>(new Set())
  const [reloadSeq, setReloadSeq] = useState(0)
  const refresh = useCallback(() => setReloadSeq((seq) => seq + 1), [])

  // 用稳定字符串作为依赖，避免调用方每次渲染新建数组导致重复请求
  const uidsKey = useMemo(() => {
    const set = new Set(uids.filter((id) => Number.isFinite(id) && id > 0))
    return [...set].sort((a, b) => a - b).join(',')
  }, [uids])

  useEffect(() => {
    if (!uidsKey) {
      setProfiles(new Map())
      setNotFound(new Set())
      setLoading(false)
      return
    }
    const ids = uidsKey.split(',').map(Number)
    let cancelled = false
    setLoading(true)
    queryPartyProfiles(ids)
      .then((items) => {
        if (cancelled) return
        const found = new Map(items.map((item) => [item.user_id, item]))
        setProfiles(found)
        // 接口只返回有党员档案的用户：请求成功但结果中缺失的 ID 即「未查到」
        setNotFound(new Set(ids.filter((id) => !found.has(id))))
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles(new Map())
          // 请求失败属于异常，不标记为未查到，由调用方回退「暂无数据」
          setNotFound(new Set())
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uidsKey, reloadSeq])

  return { profiles, loading, notFound, refresh }
}
