/**
 * 职位编码 → 职位名称解析 Hook：
 * 一次性拉取全部职位（listAllPositions 内部走会话内缓存 cachedGet，多组件复用不重复请求），
 * 返回 Map<code, name>，供成员表等只拿到职位编码（position）的场景展示中文名称。
 *
 * 未命中的编码由调用方回退显示编码本身，兼容职位已被删除的历史数据；
 * 无 position.read 权限或加载失败时返回空 Map，不影响页面其余内容展示。
 */
import { useEffect, useState } from 'react'
import { listAllPositions } from '../api/positions'

export function usePositionNames(): Map<string, string> {
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listAllPositions()
        if (cancelled) return
        setNameMap(new Map(list.map((p) => [p.code, p.name || p.code])))
      } catch {
        // 无权限或加载失败：保持空映射，调用方回退显示职位编码
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return nameMap
}