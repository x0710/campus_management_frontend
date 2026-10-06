/** 用户详细信息（profile_detail）API */
import { cachedGet } from './cache'
import type { PaginatedResponse } from './types/common'
import type {
  ProfileDetail,
  ProfileDetailQuery,
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
