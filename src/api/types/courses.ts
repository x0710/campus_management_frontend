/**
 * 课程模块类型定义：课程类型枚举、列表项/详情、分页查询参数与创建/更新请求体。
 * 注意：后端 credit / pass_score 为 rust_decimal，未开启 serde-float，
 * 因此 JSON 中表现为**字符串**（如 "3.00"）。前端按字符串处理，避免浮点精度丢失。
 * 供 api/courses.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 课程类型（api.json: CourseType） */
export type CourseType = 'compulsory' | 'elective' | 'general'

/** 课程列表项（api.json: CourseInfo） */
export interface CourseInfo {
  id: number
  /** 课程代码（可为空） */
  course_code: string | null
  course_name: string
  course_type: CourseType
  /** 学分（后端 Decimal → 字符串，如 "3.00"） */
  credit: string
}

/** 课程详情（api.json: CourseDetail） */
export interface CourseDetail extends CourseInfo {
  /** 及格分数（后端 Decimal → 字符串） */
  pass_score: string
  created_at: string
  updated_at: string
}

/** 课程分页查询参数 */
export interface CourseQuery extends PageQuery {
  /** 按课程代码或课程名称模糊搜索 */
  keyword?: string
  course_type?: CourseType
}

/** 创建课程请求（POST /api/courses） */
export interface CourseCreateRequest {
  course_code?: string | null
  course_name: string
  course_type: CourseType
  /** 学分，需以字符串提交（后端 Decimal 由字符串反序列化） */
  credit: string
  /** 及格分数（不传由后端默认 60） */
  pass_score?: string | null
}

/** 更新课程请求（PATCH /api/courses/{id}，字段均可选） */
export type CourseUpdateRequest = Partial<CourseCreateRequest>