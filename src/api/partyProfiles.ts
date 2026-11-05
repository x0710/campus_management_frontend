/** 党员档案（party-profile）模块 API：党员编号 / 入党时间查询与维护 */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type {
  PartyProfile,
  PartyProfileCreateRequest,
  PartyProfileUpdateRequest,
} from './types/partyProfiles'

/**
 * GET /api/party/profiles?uids=1,2,3 批量查询党员编号与入党时间（会话内缓存）。
 *
 * 仅查询本人无需额外权限；包含他人时需要 `party_profile.read`。
 * 仅返回数据范围内且有党员档案的用户，无匹配记录时返回空数组。
 *
 * @param uids 用户 ID 数组（必填；为空时直接返回空数组，不发请求）
 * @param force 是否绕过会话缓存重新请求（可选，默认 false）
 * @returns Promise<PartyProfile[]> 党员档案数组（可能为空）
 */
export async function queryPartyProfiles(
  uids: number[],
  force?: boolean,
): Promise<PartyProfile[]> {
  if (uids.length === 0) return []
  return cachedGet<PartyProfile[]>(
    '/party/profiles',
    { uids: uids.join(',') },
    { force },
  )
}

/**
 * POST /api/party/profiles 创建党员档案。
 * 需要 `party_profile.create` 权限及目标用户的数据范围。
 * @param body 创建请求（user_id 必填）
 * @returns Promise<PartyProfile> 新建的党员档案
 */
export async function createPartyProfile(
  body: PartyProfileCreateRequest,
): Promise<PartyProfile> {
  const res = await http.post<PartyProfile>('/party/profiles', body)
  invalidate('GET /party/profiles')
  return res.data
}

/**
 * PATCH /api/party/profiles/{user_id} 更新指定用户的党员档案。
 * 缺省字段保持原值，显式传 null 表示清空；需要 `party_profile.update` 权限。
 * @param userId 用户 ID（必填）
 * @param body 更新请求
 * @returns Promise<PartyProfile> 更新后的党员档案
 */
export async function updatePartyProfile(
  userId: number,
  body: PartyProfileUpdateRequest,
): Promise<PartyProfile> {
  const res = await http.patch<PartyProfile>(`/party/profiles/${userId}`, body)
  invalidate('GET /party/profiles')
  return res.data
}

/**
 * DELETE /api/party/profiles/{user_id} 删除指定用户的党员档案。
 * 需要 `party_profile.delete` 权限及目标用户的数据范围。
 * @param userId 用户 ID（必填）
 * @returns 类型：Promise<void>
 */
export async function deletePartyProfile(userId: number): Promise<void> {
  await http.delete(`/party/profiles/${userId}`)
  invalidate('GET /party/profiles')
}
