import type { CreatedDateAliasQuery, CreatedDateQuery } from '../api/types/common'

/** 日期选择器的日历日期直接传给后端，不转 ISO，避免时区导致日期前移。 */
export function toCreatedDateQuery(start?: string | null, end?: string | null): CreatedDateQuery {
  return { ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}) }
}

export function toCreatedDateAliases(query: CreatedDateQuery): CreatedDateAliasQuery {
  return {
    ...(query.start_date ? { created_start_date: query.start_date } : {}),
    ...(query.end_date ? { created_end_date: query.end_date } : {}),
  }
}

/** 模拟导入新增数据的创建日期按与后端相同的 UTC 边界过滤。 */
export function isCreatedDateInRange(timestamp: string, query: CreatedDateQuery): boolean {
  if (!query.start_date && !query.end_date) return true
  const time = Date.parse(timestamp)
  if (!Number.isFinite(time)) return false
  const date = new Date(time).toISOString().slice(0, 10)
  return (!query.start_date || date >= query.start_date) && (!query.end_date || date <= query.end_date)
}
