/**
 * 课程管理常量集中定义（ai 要求 7：常量统一放 config/，便于复用）。
 * 文案走 i18n（course.type_*），这里只放配色、枚举顺序、分页与输入长度限制。
 */
import type { CourseType } from '../api/courses'

/** 课程类型 → Tag 配色（夜间模式下 antd Tag 自动适配） */
export const COURSE_TYPE_COLOR: Record<CourseType, string> = {
  compulsory: 'red',
  elective: 'blue',
  general: 'green',
}

/** 课程类型枚举顺序（筛选项与表单下拉选项共用） */
export const COURSE_TYPE_OPTIONS: CourseType[] = ['compulsory', 'elective', 'general']

/** 课程列表每页条数（ai 要求 12：表格每页最多 20 行） */
export const COURSE_PAGE_SIZE = 20

/** 课程代码最大长度（表单输入限制） */
export const COURSE_CODE_MAX_LENGTH = 50

/** 课程名称最大长度（表单输入限制） */
export const COURSE_NAME_MAX_LENGTH = 100

/** 及格分数取值范围（0~100，步进 0.5，与学分保持一致的高精度字符串输入） */
export const COURSE_SCORE_MIN = 0
export const COURSE_SCORE_MAX = 100

/** 学分取值范围（0~100，步进 0.5） */
export const COURSE_CREDIT_MIN = 0
export const COURSE_CREDIT_MAX = 100