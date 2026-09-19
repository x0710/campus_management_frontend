/** 分页加载状态管理, 提供通用的分页加载状态管理逻辑 */

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import type { PaginatedResponse, PageQuery } from '../api/common'

interface PaginatedState<T> {
  data: T[]
  total: number
  loading: boolean
  error: string | null
}

/**
 * 通用服务端分页加载：
 * page 从 1 开始（与后端分页接口约定一致），pageSize 变化时回到第 1 页。
 * fetcher 第二参 force=true 表示用户手动刷新，应绕过本地缓存请求最新数据。
 */
export function usePaginated<T, Q extends PageQuery = PageQuery>(
  fetcher: (query: Q, force?: boolean) => Promise<PaginatedResponse<T>>,
  initialQuery?: Omit<Q, 'page' | 'page_size'>,
) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(10)
  const [state, setState] = useState<PaginatedState<T>>({
    data: [],
    total: 0,
    loading: true,
    error: null,
  })
  const [reloadKey, setReloadKey] = useState(0)
  const initialQueryRef = useRef(initialQuery)
  initialQueryRef.current = initialQuery
  // 手动刷新标记：refresh() 置位，effect 消费后立即复位
  const forceRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const force = forceRef.current
    forceRef.current = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher({ ...(initialQueryRef.current as Q), page, page_size: pageSize }, force)
      .then((res) => {
        if (!cancelled) setState({ data: res.data, total: res.total, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled || (axios.isAxiosError(err) && err.response?.status === 401)) return
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: axios.isAxiosError(err) && !err.response
              ? 'network'
              : 'failed',
          }))
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, reloadKey])

  const setPageSize = useCallback((size: number) => {
    setPage(1)
    setPageSizeState(size)
  }, [])

  const refresh = useCallback(() => {
    forceRef.current = true
    setReloadKey((k) => k + 1)
  }, [])

  /** 重新加载当前查询（走会话缓存，不强制绕过）：用于筛选条件变化、依赖就绪等场景 */
  const reload = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  return { page, setPage, pageSize, setPageSize, refresh, reload, ...state }
}
