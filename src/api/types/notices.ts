/**
 * 站内通知模块类型定义。
 * 对应运行中后端的 notice 接口（OpenAPI 由 /api-docs/openapi.json 提供）。
 * 供 api/notices.ts 的请求函数与通知相关视图复用。
 */
import type { PageQuery } from './common'

/** 通知分类（后端 NoticeCategory） */
export type NoticeCategory = 'system' | 'approval' | 'announcement'

/**
 * 通知详情（GET /api/notices/{id}，OpenAPI: Notice）。
 *
 * 说明：OpenAPI 的 Notice 未声明 is_read，但列表接口支持按 is_read 过滤，
 * 后端实际列表项可能带上该字段，因此这里声明为可选，避免类型断言错误。
 */
export interface Notice {
  /** 通知 ID */
  id: number
  /** 通知接收人 ID（仅接收人本人可查看/修改） */
  user_id: number
  /** 通知正文 */
  content: string
  /** 通知分类 */
  category: NoticeCategory
  /** 创建时间（RFC3339） */
  created_at: string
  /** 是否已读（列表接口可能返回；详情接口以实际响应为准） */
  is_read?: boolean
}

/** 分页查询通知参数（GET /api/notices） */
export interface NoticeQuery extends PageQuery {
  /** 按通知分类过滤（可选） */
  category?: NoticeCategory
  /** 按通知正文模糊搜索（可选） */
  keyword?: string
  /** 按已读状态过滤；不传则查询全部（可选） */
  is_read?: boolean
  /** 创建时间起始（含，RFC3339，可选） */
  from_at?: string
  /** 创建时间截止（含，RFC3339，可选） */
  to_at?: string
}

/** 创建通知请求体（POST /api/notices；仅 admin 角色可调用） */
export interface NoticeCreateRequest {
  /** 接收人用户 ID（必填） */
  user_id: number
  /** 通知正文（必填） */
  content: string
  /** 通知分类（可选，后端默认 system） */
  category?: NoticeCategory
}

/** 更新通知请求体（PATCH /api/notices/{id}；字段均可选，未传入的保持不变） */
export interface NoticeUpdateRequest {
  /** 通知正文（可选） */
  content?: string | null
  /** 通知分类（可选） */
  category?: NoticeCategory | null
}
