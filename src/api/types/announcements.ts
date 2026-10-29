/**
 * 公告模块类型定义：公告类型/等级/状态枚举、列表项、详情、查询参数与创建/更新请求体。
 * 供 api/announcements.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 公告类型（api.json: AnnouncementType） */
export type AnnouncementType =
  | 'system'
  | 'academic'
  | 'administration'
  | 'activity'
  | 'security'
  | 'emergency'
  | 'exam'
  | 'admission'
  | 'library'
  | 'career'

/** 通知等级（api.json: AnnouncementPriority） */
export type AnnouncementPriority = 'trivial' | 'normal' | 'high' | 'urgent' | 'critical'

/** 公告状态（api.json: AnnouncementStatus） */
export type AnnouncementStatus = 'draft' | 'published' | 'withdrawn'

/** 公告列表项（api.json: AnnouncementListItem，不含正文） */
export interface AnnouncementListItem {
  id: number
  title: string
  e_type: AnnouncementType
  priority: AnnouncementPriority
  publisher_id: number
  status: AnnouncementStatus
  created_at: string
  expire_time: string | null
  preview: string | null
}

/**
 * 公告详情（GET /api/announcements/{id}，含正文 content）。
 * 后端详情不返回列表项专用的 status / preview，这里保留为可选字段以兼容运行中实例。
 */
export interface AnnouncementDetail {
  id: number
  title: string
  content: string
  e_type: AnnouncementType
  priority: AnnouncementPriority
  publisher_id: number
  expire_time: string | null
  created_at: string
  updated_at: string
  status?: AnnouncementStatus
  preview?: string | null
}

/** 公告分页查询参数 */
export interface AnnouncementQuery extends PageQuery {
  keyword?: string
  e_type?: AnnouncementType
  priority?: AnnouncementPriority
  status?: AnnouncementStatus
  publisher_id?: number
  /** 创建时间起始（含，RFC3339） */
  from_at?: string
  /** 创建时间截止（含，RFC3339） */
  to_at?: string
}

/** 公告阅读记录（GET /api/announcements/{id}/readers 返回元素） */
export interface AnnouncementReadRecord {
  announcement_id: number
  user_id: number
  user_name: string | null
  read_time: string
}

/** 创建公告请求（api.json: AnnouncementCreateRequest；后端创建后状态直接为 published） */
export interface AnnouncementCreateRequest {
  title: string
  content: string
  e_type: AnnouncementType
  priority: AnnouncementPriority
  /** RFC3339，可空表示长期有效 */
  expire_time: string | null
  /** 可见组织 ID 列表（至少一个，决定哪些组织的人能看到） */
  org_id: number[]
}

/** 更新公告请求（api.json: AnnouncementUpdateRequest，字段均可选） */
export interface AnnouncementUpdateRequest {
  title?: string
  content?: string
  e_type?: AnnouncementType
  priority?: AnnouncementPriority
  status?: AnnouncementStatus
  expire_time?: string | null
}