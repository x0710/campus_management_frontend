/**
 * 违规记录相关常量（ai 要求 7：常量集中放 config/，便于复用）。
 * 文案走 i18n（memberDetail.severity_*），这里只放枚举顺序、配色与分页/长度限制。
 */
import type { ViolationSeverity } from '../api/violations'

/** 违规严重程度枚举顺序（筛选下拉与编辑表单共用） */
export const VIOLATION_SEVERITY_ORDER: ViolationSeverity[] = ['low', 'medium', 'high', 'critical']

/** 违规严重程度 → Tag 配色（夜间模式下 antd Tag 自动适配） */
export const VIOLATION_SEVERITY_COLOR: Record<ViolationSeverity, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  critical: 'red',
}

/** 违规记录列表每页条数（ai 要求 12：表格每页最多 20 行） */
export const VIOLATION_PAGE_SIZE = 20

/** 违规编辑表单字段长度上限 */
export const VIOLATION_TITLE_MAX_LENGTH = 200
export const VIOLATION_CATEGORY_MAX_LENGTH = 64
export const VIOLATION_LOCATION_MAX_LENGTH = 128
export const VIOLATION_DESC_MAX_LENGTH = 1000
