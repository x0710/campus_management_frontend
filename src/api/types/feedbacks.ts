/**
 * 意见反馈模块类型定义：反馈分类枚举、反馈详情、分页查询参数与创建/更新请求体。
 * 供 api/feedbacks.ts 的请求函数与反馈页面复用。
 */
import type { PageQuery } from './common'

/** 反馈分类（api.json: FeedbackCategory，序列化为 snake_case） */
export type FeedbackCategory = 'suggestion' | 'bug' | 'complaint' | 'praise' | 'other'

/** 反馈详情（api.json: Feedback） */
export interface FeedbackDto {
  id: number
  /** 提交人用户 ID */
  user_id: number
  category: FeedbackCategory
  title: string
  content: string
  /** 提交人联系方式（选填） */
  contact: string | null
  /** 创建时间（RFC3339） */
  created_at: string
  /** 更新时间（RFC3339） */
  updated_at: string
}

/** 反馈分页查询参数（api.json: FeedbackQueryParams） */
export interface FeedbackQuery extends PageQuery {
  /** 按提交人 ID 筛选 */
  user_id?: number
  category?: FeedbackCategory
  /** 标题或正文模糊搜索 */
  keyword?: string
  /** 创建时间起始（含，RFC3339） */
  from_at?: string
  /** 创建时间截止（含，RFC3339） */
  to_at?: string
}

/** 创建反馈请求体（api.json: FeedbackCreateRequest，提交人由后端从当前登录用户传入） */
export interface FeedbackCreateRequest {
  category: FeedbackCategory
  title: string
  content: string
  contact?: string | null
}

/** 更新反馈请求体（api.json: FeedbackUpdateRequest，所有字段可选，省略即保留原值） */
export interface FeedbackUpdateRequest {
  category?: FeedbackCategory
  title?: string
  content?: string
  contact?: string | null
}
