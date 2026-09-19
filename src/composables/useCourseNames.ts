/**
 * 课程 ID → 课程详情 / 课程名称 批量解析 Hook：
 * 传入任意数量的课程 ID，去重后并行调用 getCourse（走会话内缓存 cachedGet），
 * 请求失败或不存在的 ID 映射为 null，不阻塞其他解析。
 *
 * 渲染层区分两种状态：
 *   Map 中不存在 key → 尚未解析，展示 loading
 *   Map 中存在 key 但值为 null → 解析失败，展示课程 ID 兜底
 *   Map 中存在 key 且值为对象 → 解析成功
 *
 * 新结果以函数式 setState 与旧状态合并，避免列表刷新时已解析数据短暂闪回 loading；
 * 已解析 ID 再次进入时由 API 层缓存直接返回，不会产生额外网络请求。
 *
 * 两个导出：
 *   useCourseDetails —— 需要学分、课程代码等完整字段时使用（如成绩统计）
 *   useCourseNames   —— 只需课程名称时的轻量封装（内部复用 useCourseDetails）
 */
import { useEffect, useMemo, useState } from 'react'
import { getCourse, type CourseDetail } from '../api/courses'

/** 批量解析课程详情：Map<courseId, CourseDetail | null> */
export function useCourseDetails(ids: number[]): Map<number, CourseDetail | null> {
  const [details, setDetails] = useState<Map<number, CourseDetail | null>>(new Map())

  const uniqueIds = useMemo(() => {
    const set = new Set(ids.filter((id) => Number.isFinite(id) && id > 0))
    return [...set]
  }, [ids])

  useEffect(() => {
    if (uniqueIds.length === 0) return

    let cancelled = false
    const fetched = new Map<number, CourseDetail | null>()

    void (async () => {
      // 并行请求，每个独立容错；重复 ID 由 API 层缓存命中，不发额外请求
      await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            fetched.set(id, await getCourse(id))
          } catch {
            fetched.set(id, null)
          }
        }),
      )
      if (!cancelled) {
        // 与旧状态合并，保留其它 ID 的已解析结果
        setDetails((prev) => {
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

  return details
}

/** 批量解析课程名称：Map<courseId, course_name | null>（内部复用 useCourseDetails） */
export function useCourseNames(ids: number[]): Map<number, string | null> {
  const details = useCourseDetails(ids)

  return useMemo(() => {
    const names = new Map<number, string | null>()
    for (const [id, detail] of details) names.set(id, detail ? detail.course_name : null)
    return names
  }, [details])
}
