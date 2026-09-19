/**
 * 成绩接口：
 * - GET   /api/examinations       分页查询成绩（权限 examination.select）
 * - GET   /api/examinations/{id}  成绩详情（权限 examination.select）
 * - PATCH /api/examinations/{id}  更新成绩（权限 examination.update，成功 204 无 body）
 *
 * 查询统一走会话缓存 cachedGet：相同查询条件（页码、学生、课程、学期、考试类型、是否及格）
 * 只请求一次，手动刷新传 force=true 绕过缓存。
 *
 * 注意：后端 score 为 rust_decimal，未开启 serde-float，
 * 因此 JSON 中表现为**字符串**（如 "70.00"）。前端按字符串接收/提交，避免浮点精度丢失。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PageQuery, PaginatedResponse } from './common'

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

/** GET /api/examinations 分页查询成绩（force=true 绕过会话缓存） */
export function queryScores(params: CourseScoreQuery = {}, force?: boolean) {
  return cachedGet<PaginatedResponse<CourseScoreInfo>>(
    '/examinations',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/examinations/{id} 获取成绩详情（force=true 绕过会话缓存） */
export function getScore(id: number, force?: boolean) {
  return cachedGet<CourseScoreDetail>(`/examinations/${id}`, undefined, { force })
}

/** PATCH /api/examinations/{id} 部分更新成绩，成功后失效成绩列表与详情缓存 */
export async function updateScore(id: number, body: CourseScoreUpdateRequest): Promise<void> {
  await http.patch(`/examinations/${id}`, body)
  invalidate('GET /examinations')
}

/** 单次拉取成绩的分页大小（后端 page_size 上限 100） */
const SCORE_FETCH_PAGE_SIZE = 100

/** 拉取指定学生的全部成绩（分页循环取满，force=true 绕过缓存） */
export async function listAllScoresForUser(
  uid: number,
  force?: boolean,
): Promise<CourseScoreInfo[]> {
  const all: CourseScoreInfo[] = []
  for (let page = 1; ; page += 1) {
    const res = await queryScores({ uid, page, page_size: SCORE_FETCH_PAGE_SIZE }, force)
    all.push(...res.data)
    if (page >= res.total_pages) break
  }
  return all
}
