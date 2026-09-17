/**
 * 课程接口：
 * - GET  /api/courses        分页查询课程（权限 course.select）
 * - GET  /api/courses/{id}   课程详情（权限 course.select）
 * - POST /api/courses        创建课程（权限 course.create）
 * - PATCH /api/courses/{id}  更新课程（权限 course.update）
 * - DELETE /api/courses/{id} 删除课程（权限 course.delete）
 *
 * 查询统一走会话缓存 cachedGet：相同查询条件（页码、关键词、类型）只请求一次，
 * 手动刷新传 force=true 绕过缓存；写操作后失效全部课程缓存，保证下次读取拿到最新数据。
 *
 * 注意：后端 credit / pass_score 为 rust_decimal，未开启 serde-float，
 * 因此 JSON 中表现为**字符串**（如 "3.00"）。前端按字符串处理，避免浮点精度丢失。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PageQuery, PaginatedResponse } from './common'

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

/** GET /api/courses 分页查询课程（force=true 绕过会话缓存） */
export function queryCourses(params: CourseQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<CourseInfo>>(
    '/courses',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/courses/{id} 获取课程详情（force=true 绕过会话缓存） */
export function getCourse(id: number, force?: boolean) {
  return cachedGet<CourseDetail>(`/courses/${id}`, undefined, { force })
}

/** POST /api/courses 创建课程，返回新课程 ID */
export async function createCourse(body: CourseCreateRequest): Promise<number> {
  const res = await http.post<number>('/courses', body)
  invalidate('GET /courses')
  return res.data
}

/** PATCH /api/courses/{id} 更新课程 */
export async function updateCourse(
  id: number,
  body: CourseUpdateRequest,
): Promise<void> {
  await http.patch(`/courses/${id}`, body)
  invalidate('GET /courses')
}

/** DELETE /api/courses/{id} 删除课程 */
export async function deleteCourse(id: number): Promise<void> {
  await http.delete(`/courses/${id}`)
  invalidate('GET /courses')
}