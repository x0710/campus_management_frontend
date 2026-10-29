/**
 * 日常记录接口（后端 campus-record）：
 * - GET    /api/records       分页查询日常记录（权限 record.read）
 * - GET    /api/records/{id}  日常记录详情（权限 record.read）
 * - POST   /api/records       创建日常记录（权限 record.create，201 返回新 ID）
 * - PATCH  /api/records/{id}  部分更新日常记录（权限 record.update，成功 204）
 * - DELETE /api/records/{id}  删除日常记录（权限 record.delete，成功 204）
 *
 * 查询统一走会话缓存 cachedGet：相同查询条件只请求一次，手动刷新传 force=true 绕过缓存。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  DailyRecordCreateRequest,
  DailyRecordDetail,
  DailyRecordInfo,
  DailyRecordQuery,
  DailyRecordUpdateRequest,
} from './types/records'

/** GET /api/records 分页查询日常记录（force=true 绕过会话缓存） */
export function queryRecords(
  params: DailyRecordQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<DailyRecordInfo>> {
  return cachedGet<PaginatedResponse<DailyRecordInfo>>(
    '/records',
    params as Record<string, unknown>,
    { force },
  )
}

/** GET /api/records/{id} 获取日常记录详情（force=true 绕过会话缓存） */
export function getRecord(id: number, force?: boolean): Promise<DailyRecordDetail> {
  return cachedGet<DailyRecordDetail>(`/records/${id}`, undefined, { force })
}

/** POST /api/records 创建日常记录，返回新记录 ID，成功后失效列表缓存 */
export async function createRecord(body: DailyRecordCreateRequest): Promise<number> {
  const res = await http.post<number>('/records', body)
  invalidate('GET /records')
  return res.data
}

/** PATCH /api/records/{id} 部分更新日常记录，成功后失效列表与详情缓存 */
export async function updateRecord(
  id: number,
  body: DailyRecordUpdateRequest,
): Promise<void> {
  await http.patch(`/records/${id}`, body)
  invalidate('GET /records')
}

/** DELETE /api/records/{id} 删除日常记录，成功后失效列表与详情缓存 */
export async function deleteRecord(id: number): Promise<void> {
  await http.delete(`/records/${id}`)
  invalidate('GET /records')
}
