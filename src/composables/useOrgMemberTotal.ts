/**
 * 组织成员总数统计（党委学院端 / 学校端工作台共用）。
 *
 * 背景：GET /api/organizations/{id}/members 的分页 total 只统计直接挂在该组织下的成员，
 * 不含下级组织成员；因此「全院党员」「全校党员」需要递归汇总全部下级组织。
 *
 * 做法：GET /api/organizations/{id}/subsidiaries 取直接下级组织（会话缓存）→
 * 对每个组织取分页 total（page_size=1，只需总数）→ 递归累加。
 * 注意：下级组织数量有限，请求均走会话缓存；手动刷新时通过 force=true 绕过成员缓存。
 */
import { listSubsidiaries, queryOrgMembers } from '../api/organizations'

/**
 * 统计组织自身及其全部下级组织的成员总数。
 *
 * @param orgId 组织 ID（必填；通常为 usePortalOrg 解析出的学院 / 学校组织）
 * @param force 是否绕过成员分页缓存（可选，默认 false；手动刷新时传 true）
 * @returns 该组织及所有下级组织的成员总数
 */
export async function countOrgMemberTotal(orgId: number, force?: boolean): Promise<number> {
  const [selfPage, children] = await Promise.all([
    queryOrgMembers(orgId, { page: 1, page_size: 1 }, force),
    listSubsidiaries(orgId),
  ])
  if (children.length === 0) return selfPage.total

  const childTotals = await Promise.all(
    children.map((child) => countOrgMemberTotal(child.id, force)),
  )
  return childTotals.reduce((sum, total) => sum + total, selfPage.total)
}
