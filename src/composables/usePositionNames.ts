/**
 * 职位编码 → 职位名称解析 Hook：
 * 一次性拉取全部职位（listAllPositions 内部走会话内缓存 cachedGet，多组件复用不重复请求），
 * 返回 Map<code, name>，供成员表等只拿到职位编码（position）的场景展示中文名称。
 *
 * 展示时通过 usePositionLabel 统一处理名称缺失与管理员编号；
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
        setNameMap(new Map(list.map((p) => [p.code, p.name])))
      } catch {
        // 无权限或加载失败：保持空映射，由展示层显示未知职位。
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return nameMap
}