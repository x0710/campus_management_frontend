/**
 * 成绩相关常量集中定义（ai 要求 7：常量统一放 config/，便于复用）。
 * 文案走 i18n（teacherGrades.examType_*），这里只放枚举顺序、配色与分页限制。
 */
import type { ExamType } from '../api/examinations'

/** 考试类型枚举顺序（筛选下拉与表格文案共用） */
export const EXAM_TYPE_ORDER: ExamType[] = ['start', 'middle', 'final', 'makeup', 'retake']

/** 考试类型 → Tag 配色（夜间模式下 antd Tag 自动适配） */
export const EXAM_TYPE_COLOR: Record<ExamType, string> = {
  start: 'default',
  middle: 'blue',
  final: 'geekblue',
  makeup: 'orange',
  retake: 'purple',
}

/**
 * 学生列表每页人数（ai 要求 12：表格每页最多 20 行）
 * （数据范围改为组织内的全体成员，不再按职位筛选学生）
 */
export const SCORE_STUDENT_PAGE_SIZE = 20

/** 拉取组织成员时的分页大小（后端 page_size 上限 100） */
export const ORG_MEMBER_FETCH_PAGE_SIZE = 100

/** 优秀成绩分数线（仅用于成绩文本着色，及格与否以后端 is_pass 为准） */
export const SCORE_EXCELLENT = 90

/** 成绩文本配色：不及格红、优秀绿、其余沿用主题默认色 */
export function scoreColor(score: string, isPass: boolean): string | undefined {
  if (!isPass) return '#cf1322'
  const value = Number(score)
  return Number.isFinite(value) && value >= SCORE_EXCELLENT ? '#389e0d' : undefined
}

/** 学生端本人成绩列表每页条数（ai 要求 12：表格每页最多 20 行） */
export const STUDENT_SCORE_PAGE_SIZE = 20
