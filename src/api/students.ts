/**
 * 学生信息接口（后端 campus-student）：
 * - GET /api/students       分页查询学生（权限 student.read）
 * - GET /api/students/{no}  按学号查询学生详情（本人可直接查询，他人需权限与数据范围）
 *
 * 查询统一走会话缓存 cachedGet：相同查询条件只请求一次，手动刷新传 force=true 绕过缓存。
 */
import { cachedGet } from './cache'
import type { PaginatedResponse } from './types/common'
import type { StudentDetail, StudentInfo, StudentQuery } from './types/students'

/** GET /api/students 分页查询学生（force=true 绕过会话缓存） */
export function queryStudents(
  params: StudentQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<StudentInfo>> {
  return cachedGet<PaginatedResponse<StudentInfo>>(
    '/students',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/students/{no} 按学号查询学生详情（force=true 绕过会话缓存） */
export function getStudent(studentNo: string, force?: boolean): Promise<StudentDetail> {
  return cachedGet<StudentDetail>(
    `/students/${encodeURIComponent(studentNo)}`,
    undefined,
    { force },
  )
}
