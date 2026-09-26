/**
 * 违规记录相关常量（代码要求 7：常量集中放 config/，便于复用）。
 * 文案走 i18n（memberDetail.severity_*），这里只放枚举顺序、配色与分页/长度限制。
 */
import type { ViolationSeverity } from '../api/types/violations'
import type { TranslateFn } from '../i18n'

/** 违规严重程度枚举顺序（筛选下拉与编辑表单共用） */
export const VIOLATION_SEVERITY_ORDER: ViolationSeverity[] = ['low', 'medium', 'high', 'critical']

/** 违规严重程度 → Tag 配色（夜间模式下 antd Tag 自动适配） */
export const VIOLATION_SEVERITY_COLOR: Record<ViolationSeverity, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  critical: 'red',
}

/** 违规记录列表每页条数（代码要求 12：表格每页最多 20 行） */
export const VIOLATION_PAGE_SIZE = 20

/**
 * 前端一次拉取的违规记录条数上限。
 * 后端 severity / category 筛选仅支持单值，无法承载代码要求 18 的「类型多选」，
 * 故学生端违规查询一次性取回后在前端完成多选筛选与分页；100 为后端允许的最大 page_size。
 */
export const VIOLATION_FETCH_SIZE = 100

/** 违规编辑表单字段长度上限 */
export const VIOLATION_TITLE_MAX_LENGTH = 200
export const VIOLATION_CATEGORY_MAX_LENGTH = 64
export const VIOLATION_LOCATION_MAX_LENGTH = 128
export const VIOLATION_DESC_MAX_LENGTH = 1000

/**
 * 违规严重程度展示文案（复用成员详情页已维护的 memberDetail.severity_* 文案，
 * 避免同一枚举在多处重复翻译，符合代码要求 1、16）。
 * @param severity 严重程度（必填，ViolationSeverity）
 * @param t 翻译函数（必填，来自 useT()）
 * @returns string 本地化文案（必返回）
 */
export function getViolationSeverityLabel(severity: ViolationSeverity, t: TranslateFn): string {
  return t(`memberDetail.severity_${severity}`)
}
