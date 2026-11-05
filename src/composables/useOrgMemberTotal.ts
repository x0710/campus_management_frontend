/**
 * 组织成员总数统计（支部端 / 学院端 / 学校端工作台共用）。
 *
 * 调用 POST /api/organizations/member-counts，条件为 { org_id, recursive: true }：
 * 后端按用户 ID 去重统计该组织及全部下级组织的人数（同一成员跨组织任职也只计一次），
 * 取代了旧的 GET /api/organizations/{org_id}/member-counts。
 * 计数随成员变更实时变化，接口不走会话缓存，保证工作台展示的是最新人数。
 */
import { countOrganizationMembers } from '../api/organizations'

/**
 * 统计组织自身及其全部下级组织的成员总数。
 *
 * @param orgId 组织 ID（必填；通常为 usePortalOrg 解析出的支部 / 学院 / 学校组织）
 * @returns 该组织及所有下级组织去重后的成员总数（无成员时为 0）
 */
export async function countOrgMemberTotal(orgId: number): Promise<number> {
  return countOrganizationMembers({ org_id: orgId, recursive: true })
}
