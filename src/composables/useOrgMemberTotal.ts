/**
 * 组织成员总数统计（党委支部端 / 学院端 / 学校端工作台共用）。
 *
 * 直接调用 GET /api/organizations/{org_id}/member-counts?recursive=true：
 * 后端返回去重后的成员数量并包含全部下级组织（单个对象，API 层已归一化为数组），
 * 前端把各项计数相加即得含下级的总数。
 * 计数随成员变更实时变化，接口不走会话缓存，保证工作台展示的是最新人数。
 */
import { queryOrganizationMemberCounts } from '../api/organizations'

/**
 * 统计组织自身及其全部下级组织的成员总数。
 *
 * @param orgId 组织 ID（必填；通常为 usePortalOrg 解析出的支部 / 学院 / 学校组织）
 * @returns 该组织及所有下级组织的成员总数（各组织去重计数之和）
 */
export async function countOrgMemberTotal(orgId: number): Promise<number> {
  const items = await queryOrganizationMemberCounts(orgId, true)
  return items.reduce((sum, item) => sum + item.member_count, 0)
}
