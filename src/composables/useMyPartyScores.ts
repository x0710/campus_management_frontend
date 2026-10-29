/**
 * 当前登录用户党建加分申请记录 Hook（党员端首页 / 我的成绩记录共用）。
 *
 * 数据来源：
 *   GET /api/credentials/me                   当前用户 uid（仅需登录）
 *   GET /api/party-scores?user_id={uid}       本人全部加分申请（按页拉取，走会话缓存）
 *   GET /api/party-scores/{id}                补齐列表摘要可能缺失的 template_id / created_at
 *
 * 返回按创建时间倒序排列的完整记录数组，并统一处理加载、错误与手动刷新。
 */
import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentUser } from '../api/auth'
import { extractErrorReason } from '../api/common'
import { hydratePartyScoreRows, queryPartyScores } from '../api/partyScores'
import type { PartyScore } from '../api/types/partyScores'
import { PARTY_DECLARATION_PAGE_SIZE } from '../config/partyDeclaration'
import { useT } from '../i18n'

export interface MyPartyScoresState {
  /** 本人全部加分申请（按 created_at 倒序） */
  records: PartyScore[]
  loading: boolean
  error: string | null
  /** 手动刷新；force=true 时绕过会话缓存 */
  refresh: (force?: boolean) => void
}

/**
 * 拉取当前登录用户本人的全部加分申请记录。
 *
 * @returns MyPartyScoresState
 *   - records：PartyScore[]，按创建时间倒序
 *   - loading：是否仍在加载
 *   - error：加载错误文案（含状态码），无错误为 null
 *   - refresh：手动刷新函数，传入 true 时强制绕过缓存
 */
export function useMyPartyScores(): MyPartyScoresState {
  const t = useT()
  const [records, setRecords] = useState<PartyScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const forceRef = useRef(false)

  const load = useCallback(async () => {
    const force = forceRef.current
    forceRef.current = false
    setLoading(true)
    setError(null)

    try {
      const me = await getCurrentUser()
      const pageSize = PARTY_DECLARATION_PAGE_SIZE
      const first = await queryPartyScores(
        { user_id: me.uid, page: 1, page_size: pageSize },
        force,
      )
      const collected = [...first.data]
      const totalPages = Math.max(1, first.total_pages)

      for (let page = 2; page <= totalPages; page += 1) {
        const res = await queryPartyScores(
          { user_id: me.uid, page, page_size: pageSize },
          force,
        )
        collected.push(...res.data)
      }

      const enriched = await hydratePartyScoreRows(collected, force)
      enriched.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      setRecords(enriched)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      setError(extractErrorReason(err, t))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const refresh = useCallback((force = false) => {
    forceRef.current = force
    setReloadKey((key) => key + 1)
  }, [])

  return { records, loading, error, refresh }
}
