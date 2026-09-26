/**
 * 成绩模块类型定义：考试类型枚举、成绩列表项/详情、更新请求体与分页查询参数。
 * 注意：后端 score 为 rust_decimal，未开启 serde-float，
 * 因此 JSON 中表现为**字符串**（如 "70.00"）。前端按字符串接收/提交，避免浮点精度丢失。
 * 供 api/examinations.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 考试类型（api.json: ExamType，后端枚举序列化为 snake_case） */
export type ExamType = 'start' | 'middle' | 'final' | 'makeup' | 'retake'

/** 成绩列表项（api.json: CourseScoreInfo） */
export interface CourseScoreInfo {
  id: number
  /** 学生 ID（对应 users.id） */
  uid: number
  course_id: number
  /** 学期标识，后端可能为多学期合并串（如 "2025-2026-1,2025-2026-2"） */
  semester: string
  /** 成绩（后端 Decimal → 字符串，如 "70.00"） */
  score: string
  is_pass: boolean
  exam_type: ExamType
}

/** 成绩详情（api.json: CourseScoreDetail） */
export interface CourseScoreDetail extends CourseScoreInfo {
  remark: string
  created_at: string
  updated_at: string
}

/**
 * 成绩更新请求（api.json: CourseScoreUpdateRequest）。
 * 唯一键 uid/course_id/semester 不可修改，其余字段可选；省略即保留原值。
 * score 提交为字符串（后端 Decimal 按字符串解析，避免浮点精度丢失）。
 */
export interface CourseScoreUpdateRequest {
  score?: string
  is_pass?: boolean
  exam_type?: ExamType
  remark?: string
}

/** 成绩分页查询参数（api.json: CourseScoreQueryParams） */
export interface CourseScoreQuery extends PageQuery {
  /** 按学生 ID 筛选（接口仅支持单个 uid，不支持数组） */
  uid?: number
  course_id?: number
  semester?: string
  exam_type?: ExamType
  is_pass?: boolean
}