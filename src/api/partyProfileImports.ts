import { http } from './http'
import { invalidate } from './cache'
import { BATCH_REQUEST_TIMEOUT_MS } from '../config/http'
import type { UserCreateRequest, UserUpdateRequest } from './types/users'
import type { ProfileDetailCreateRequest } from './types/profileDetails'
import type { PartyProfileUpdateRequest } from './types/partyProfiles'
import type { MemberBatchCreate } from './types/organizations'

export interface PartyProfileImportItem {
  user_id: number
  user?: Pick<UserCreateRequest, 'uid' | 'username' | 'name' | 'gender'>
  changes?: UserUpdateRequest
  profile?: ProfileDetailCreateRequest
  party: PartyProfileUpdateRequest
  role_ids?: number[]
  members?: MemberBatchCreate[]
}

export interface PartyProfileImportResult {
  user_id: number
  user_created: boolean
  new_password: string | null
  party_created: boolean
  profile_id: number | null
}

/** 整批事务提交；不缓存包含初始密码的响应。 */
export async function importPartyProfiles(body: PartyProfileImportItem[], signal?: AbortSignal) {
  try {
    const res = await http.post<PartyProfileImportResult[]>('/party-profile-imports', body, {
      signal, timeout: BATCH_REQUEST_TIMEOUT_MS,
    })
    return res.data
  } finally {
    // 网络断开或取消时，服务端仍可能已提交，失效缓存以便重新核对。
    for (const prefix of ['/users', '/credentials', '/profile-details', '/party/profiles', '/organization-members', '/organizations', '/rbac', '/party/scores']) {
      invalidate(`GET ${prefix}`)
    }
  }
}
