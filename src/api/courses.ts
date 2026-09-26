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
import type { PaginatedResponse } from './types/common'
import type {
  CourseCreateRequest,
  CourseDetail,
  CourseInfo,
  CourseQuery,
  CourseUpdateRequest,
} from './types/courses'

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