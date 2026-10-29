/**
 * 学生信息模块类型定义。
 *
 * 对应后端 campus-student：
 *   GET /api/students       分页查询学生（权限 student.read）
 *   GET /api/students/{no}  按学号查询学生详情（本人无需权限，他人需 student.read + 数据范围）
 *
 * 供 api/students.ts 的请求函数与各视图复用；DateTime 统一使用 RFC3339 字符串。
 */
import type { PageQuery } from './common'

/** 学生学习状态（后端 serde 序列化为 snake_case） */
export type StudentStatus =
  | 'enrolled'
  | 'graduated'
  | 'suspended'
  | 'withdrawn'
  | 'retained'
  | 'dropped_out'
  | 'transferred'
  | 'expelled'
  | 'unregistered'

/** 学生列表项（api.json: StudentInfo） */
export interface StudentInfo {
  /** 学号（后端 No，字符串） */
  student_no: string
  /** 用户 ID（对应 users.id） */
  user_id: number
  name: string | null
  gender: string | null
  status: StudentStatus
}

/** 学生详情（api.json: StudentDetail） */
export interface StudentDetail {
  /** 学生记录 ID */
  sid: number
  user_id: number
  name: string | null
  student_no: string
  gender: string | null
  /** 入学年份 */
  enrollment_year: number
  status: StudentStatus
}

/** GET /api/students 分页查询参数（api.json: StudentQueryParams） */
export interface StudentQuery extends PageQuery {
  /** 按姓名或学号模糊搜索 */
  keyword?: string
  status?: StudentStatus
}
