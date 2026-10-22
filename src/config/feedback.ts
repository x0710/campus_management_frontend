/**
 * 意见反馈相关常量（代码要求 7：常量集中放 config/，便于复用）。
 * 文案走 i18n（feedback.*），这里只放枚举顺序、配色与分页/长度限制。
 */
import type { FeedbackCategory } from '../api/types/feedbacks'
import type { TranslateFn } from '../i18n'

/** 反馈分类枚举顺序（筛选下拉与表单共用） */
export const FEEDBACK_CATEGORY_ORDER: FeedbackCategory[] = [
  'suggestion',
  'bug',
  'complaint',
  'praise',
  'other',
]

/** 反馈分类 → Tag 配色 */
export const FEEDBACK_CATEGORY_COLOR: Record<FeedbackCategory, string> = {
  suggestion: 'blue',
  bug: 'red',
  complaint: 'orange',
  praise: 'green',
  other: 'default',
}

/** 反馈列表每页条数 */
export const FEEDBACK_PAGE_SIZE = 20

/** 反馈表单字段长度上限 */
export const FEEDBACK_TITLE_MAX_LENGTH = 120
export const FEEDBACK_CONTENT_MAX_LENGTH = 2000
export const FEEDBACK_CONTACT_MAX_LENGTH = 255

/** 反馈分类展示文案（统一走 feedback.category_*，避免同一枚举在多处重复翻译） */
export function getFeedbackCategoryLabel(
  category: FeedbackCategory,
  t: TranslateFn,
): string {
  return t(`feedback.category_${category}`)
}
