/** 公告模块, 提供公告相关 API */

import dayjs from 'dayjs'
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PageQuery, PaginatedResponse } from './common'

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

/** 公告详情（GET /api/announcements/{id}，含正文 content） */
export interface AnnouncementDetail extends AnnouncementListItem {
  content: string
}

export interface AnnouncementQuery extends PageQuery {
  keyword?: string
  e_type?: AnnouncementType
  priority?: AnnouncementPriority
  status?: AnnouncementStatus
  publisher_id?: number
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

/**
 * GET /api/announcements 分页查询公告列表（会话内缓存）。
 * api.json 契约为 PaginatedResponse，但当前运行中的后端实际返回裸数组，
 * 这里做一次归一化：裸数组时先按 created_at 倒序（最新发布在前）整体排序，
 * 再按分页参数切片，兼容两种形态。
 * force=true 可绕过缓存（手动刷新）。
 */
export async function queryAnnouncements(
  params: AnnouncementQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<AnnouncementListItem>> {
  const body = await cachedGet<
    PaginatedResponse<AnnouncementListItem> | AnnouncementListItem[]
  >('/announcements', params as Record<string, unknown>, { force })

  if (Array.isArray(body)) {
    // 后端裸数组默认按 id 升序（旧公告在前），这里统一归一为「最新发布在前」：
    // 必须先整体排序、再按页切片；body 可能是会话缓存的共享引用，故先复制再排序，
    // 避免原地 sort 污染缓存。created_at 相同的极端情况以 id 倒序兜底，保证顺序稳定。
    const ordered = [...body].sort((a, b) => {
      const byTime = dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf()
      return byTime !== 0 ? byTime : b.id - a.id
    })
    const page = params.page ?? 1
    const pageSize = params.page_size ?? 20
    const start = (page - 1) * pageSize
    return {
      data: ordered.slice(start, start + pageSize),
      total: ordered.length,
      page,
      page_size: pageSize,
      total_pages: Math.max(1, Math.ceil(ordered.length / pageSize)),
    }
  }
  return body
}

/**
 * 拉取全部公告列表（内部自动翻页，最多 100 页安全阀）。
 * 后端当前返回裸数组（queryAnnouncements 在前端按页切片），也兼容未来的真分页形态；
 * 每一页都走会话缓存，force=true 时整体绕过缓存（手动刷新）。
 * 用于需要在前端做多选筛选的场景。
 */
export async function listAllAnnouncements(
  force?: boolean,
): Promise<AnnouncementListItem[]> {
  const pageSize = 100
  const all: AnnouncementListItem[] = []
  for (let page = 1; page <= 100; page += 1) {
    const res = await queryAnnouncements({ page, page_size: pageSize }, force)
    all.push(...res.data)
    if (res.data.length < pageSize || all.length >= res.total) break
  }
  return all
}

/** POST /api/announcements 创建并直接发布公告，返回新公告 ID（权限 announcement.create） */
export async function createAnnouncement(
  payload: AnnouncementCreateRequest,
): Promise<number> {
  const res = await http.post<number>('/announcements', payload)
  invalidate('GET /announcements')
  return res.data
}

/**
 * GET /api/announcements/{id} 获取公告详情（含正文，列表不返回正文，需点击后单独请求；会话内缓存）。
 * force=true 可绕过缓存。
 */
export async function getAnnouncement(
  id: number,
  force?: boolean,
): Promise<AnnouncementDetail> {
  return cachedGet<AnnouncementDetail>(`/announcements/${id}`, undefined, { force })
}

/** PATCH /api/announcements/{id} 更新公告字段（如撤回 status=withdrawn，权限 announcement.update） */
export async function updateAnnouncement(
  id: number,
  payload: AnnouncementUpdateRequest,
): Promise<void> {
  await http.patch(`/announcements/${id}`, payload)
  invalidate('GET /announcements')
  invalidate(`GET /announcements/${id}`)
}

/** DELETE /api/announcements/{id} 删除公告（权限 announcement.delete） */
export async function deleteAnnouncement(id: number): Promise<void> {
  await http.delete(`/announcements/${id}`)
  invalidate('GET /announcements')
  invalidate(`GET /announcements/${id}`)
}
