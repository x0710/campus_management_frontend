/**
 * 日常记录模块类型定义（后端 campus-record）。
 *
 *   GET    /api/records       分页查询日常记录（权限 record.read）
 *   GET    /api/records/{id}  日常记录详情（权限 record.read + 数据范围）
 *   POST   /api/records       创建日常记录（权限 record.create，返回新 ID）
 *   PATCH  /api/records/{id}  部分更新日常记录（权限 record.update，成功 204）
 *   DELETE /api/records/{id}  删除日常记录（权限 record.delete，成功 204）
 *
 * 供 api/records.ts 的请求函数与各视图复用；DateTime 统一使用 RFC3339 字符串。
 */
import type { PageQuery } from './common'

/** 记录性质（后端 RecordType，serde 序列化为 snake_case） */
export type RecordType = 'positive' | 'negative' | 'neutral'

/** 日常记录列表项（api.json: DailyRecordInfo） */
export interface DailyRecordInfo {
  id: number
  /** 记录对象（学生）用户 ID */
  user_id: number
  nature: RecordType
  occurred_at: string
  /** 记录人姓名；历史数据可能为空 */
  recorder_name: string | null
}

/** 日常记录详情（api.json: DailyRecordDetail） */
export interface DailyRecordDetail {
  id: number
  user_id: number
  nature: RecordType
  content: string
  occurred_at: string
  recorder_id: number
  created_at: string
  updated_at: string
}

/** 创建日常记录请求（api.json: DailyRecordCreateDto） */
export interface DailyRecordCreateRequest {
  user_id: number
  nature: RecordType
  content: string
  /** RFC3339 */
  occurred_at: string
}

/** 更新日常记录请求（api.json: DailyRecordUpdateDto，字段可选，省略即保留原值） */
export interface DailyRecordUpdateRequest {
  nature?: RecordType
  content?: string
  /** RFC3339 */
  occurred_at?: string
}

/** GET /api/records 分页查询参数（api.json: DailyRecordQueryParams） */
export interface DailyRecordQuery extends PageQuery {
  /** 按记录对象（学生）用户 ID 筛选 */
  user_id?: number
  nature?: RecordType
  /** 按内容模糊搜索 */
  keyword?: string
  /** 发生时间起始（含，RFC3339） */
  from_at?: string
  /** 发生时间截止（含，RFC3339） */
  to_at?: string
}
