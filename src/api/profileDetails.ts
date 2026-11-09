/**
 * 用户详细信息（profile_detail）API：
 * - GET    /api/profile-details        分页查询档案（支持 user_id/uids/keyword 筛选）
 * - GET    /api/profile-details/{id}   获取档案详情
 * - PUT    /api/profile-details        按 user_id 新增或更新档案（缺失或 null 的字段保留原值）
 * - POST   /api/profile-details        创建档案（成功 201 返回创建出的完整档案）
 * - PATCH  /api/profile-details/{id}   部分更新档案（成功 204 无 body）
 * - DELETE /api/profile-details/{id}   删除档案（成功 204 无 body）
 *
 * 查询走会话缓存 cachedGet；写操作后失效 /profile-details 前缀的全部缓存
 * （前缀匹配会连带清掉 GET /profile-details/{id}），保证下次读取拿到最新数据。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import { BATCH_REQUEST_TIMEOUT_MS } from '../config/http'
import type { PaginatedResponse } from './types/common'
import type {
  ProfileDetail,
  ProfileDetailCreateRequest,
  ProfileDetailQuery,
  ProfileDetailUpdateRequest,
} from './types/profileDetails'

/**
 * GET /api/profile-details 分页查询档案
 * @param params 类型：ProfileDetailQuery；默认值：{}；是否必填：可选
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<PaginatedResponse<ProfileDetail>>
 */
export async function queryProfileDetails(
  params: ProfileDetailQuery = {},
  force?: boolean,
): Promise<PaginatedResponse<ProfileDetail>> {
  return cachedGet<PaginatedResponse<ProfileDetail>>(
    '/profile-details',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * GET /api/profile-details/{id} 获取档案详情（会话内缓存；force=true 绕过缓存）
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param force 类型：boolean；默认值：无；是否必填：可选
 * @returns 类型：Promise<ProfileDetail>
 */
export function getProfileDetail(id: number, force?: boolean): Promise<ProfileDetail> {
  return cachedGet<ProfileDetail>(`/profile-details/${id}`, undefined, { force })
}

/**
 * POST /api/profile-details 创建档案，返回创建出的完整档案
 * @param body 类型：ProfileDetailCreateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<ProfileDetail>
 */
export async function createProfileDetail(
  body: ProfileDetailCreateRequest,
): Promise<ProfileDetail> {
  const res = await http.post<ProfileDetail>('/profile-details', body)
  invalidate('GET /profile-details')
  return res.data
}

/**
 * PATCH /api/profile-details 新增或更新档案（以 user_id 为键，缺失或 null 的字段保留原值）
 * @param body 类型：ProfileDetailCreateRequest；默认值：无；是否必填：必填
 * @param signal 取消信号（可选）
 * @returns 类型：Promise<ProfileDetail>
 */
export async function saveProfileDetail(
  body: ProfileDetailCreateRequest,
  signal?: AbortSignal,
): Promise<ProfileDetail> {
  const res = await http.patch<ProfileDetail>('/profile-details', body, { signal })
  invalidate('GET /profile-details')
  return res.data
}

/**
 * PATCH /api/profile-details 批量新增或更新档案（数组请求，按输入顺序返回，任一项失败整批回滚）。
 * 更新时缺省或 null 的字段保留原值。
 * @param body 类型：ProfileDetailCreateRequest[]；默认值：无；是否必填：必填
 * @param signal 取消信号（可选）
 * @returns 类型：Promise<ProfileDetail[]>
 */
export async function saveProfileDetails(
  body: ProfileDetailCreateRequest[],
  signal?: AbortSignal,
): Promise<ProfileDetail[]> {
  const res = await http.patch<ProfileDetail[]>('/profile-details', body, {
    signal,
    timeout: BATCH_REQUEST_TIMEOUT_MS,
  })
  invalidate('GET /profile-details')
  return res.data
}

/**
 * PATCH /api/profile-details/{id} 部分更新档案
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param body 类型：ProfileDetailUpdateRequest；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updateProfileDetail(
  id: number,
  body: ProfileDetailUpdateRequest,
): Promise<void> {
  await http.patch(`/profile-details/${id}`, body)
  invalidate('GET /profile-details')
}

/**
 * DELETE /api/profile-details/{id} 删除档案
 * @param id 类型：number；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function deleteProfileDetail(id: number): Promise<void> {
  await http.delete(`/profile-details/${id}`)
  invalidate('GET /profile-details')
}
