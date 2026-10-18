/**
 * 用户详细信息（profile_detail）API：
 * - GET    /api/profile-details        分页查询档案（支持 user_id/class_id/keyword 筛选）
 * - GET    /api/profile-details/{id}   获取档案详情
 * - POST   /api/profile-details        创建档案（成功 201 返回创建出的完整档案）
 * - PATCH  /api/profile-details/{id}   部分更新档案（成功 204 无 body）
 * - DELETE /api/profile-details/{id}   删除档案（成功 204 无 body）
 *
 * 查询走会话缓存 cachedGet；写操作后失效 /profile-details 前缀的全部缓存
 * （前缀匹配会连带清掉 GET /profile-details/{id}），保证下次读取拿到最新数据。
 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type { PaginatedResponse } from './types/common'
import type {
  ProfileDetail,
  ProfileDetailCreateRequest,
  ProfileDetailQuery,
  ProfileDetailUpdateRequest,
} from './types/profileDetails'

/** GET /api/profile-details 分页查询档案 */
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

/** POST /api/profile-details 创建档案，返回创建出的完整档案 */
export async function createProfileDetail(
  body: ProfileDetailCreateRequest,
): Promise<ProfileDetail> {
  const res = await http.post<ProfileDetail>('/profile-details', body)
  invalidate('GET /profile-details')
  return res.data
}

/** PATCH /api/profile-details/{id} 部分更新档案 */
export async function updateProfileDetail(
  id: number,
  body: ProfileDetailUpdateRequest,
): Promise<void> {
  await http.patch(`/profile-details/${id}`, body)
  invalidate('GET /profile-details')
}

/** DELETE /api/profile-details/{id} 删除档案 */
export async function deleteProfileDetail(id: number): Promise<void> {
  await http.delete(`/profile-details/${id}`)
  invalidate('GET /profile-details')
}
