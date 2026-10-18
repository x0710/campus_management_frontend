/**
 * 党委支部端 / 学院端共用：解析当前登录用户所属的「支部」组织（代码要求 1）。
 *
 * 判定规则（需求：支部位于组织树第 3 / 4 层）：
 *   GET /api/organizations/{id}/tree 返回「根 → 该组织」链路，链条数 - 1 即上级组织数量；
 *   命中 BRANCH_ANCESTOR_DEPTHS（3 或 4）即为支部。用户在多个组织任职时按任职顺序逐个判定，
 *   均未命中则回退为第一个任职组织，保证学院层级等非支部账号也能看到自己组织的数据（而非空白）。
 *
 * 支部管理页（BranchManageView）与支部工作台（BranchWorkbenchView）共用本模块，
 * 避免同一条判定规则在两处漂移。组织/任职查询均走会话缓存（cachedGet）。
 */
import { getCurrentUser } from '../api/auth'
import { getOrganizationTree, listUserOrganizations } from '../api/organizations'
import type { UserOrganization } from '../api/types/organizations'
import { BRANCH_ANCESTOR_DEPTHS } from '../config/organization'

/**
 * 按组织树链路深度判定支部（需求：上级组织数量为 3 或 4）。
 *
 * @param orgIds 该用户的全部任职组织 ID（必填；按任职顺序逐个判定）
 * @returns 第一个被判定为支部的组织 ID；均不满足时返回 null
 */
export async function findBranchOrg(orgIds: number[]): Promise<number | null> {
  for (const id of orgIds) {
    const chain = await getOrganizationTree(id)
    // 链条数 - 1 即上级组织数量（等于链路首项的 level）
    if (BRANCH_ANCESTOR_DEPTHS.includes(chain.length - 1)) return id
  }
  return null
}

/** 解析结果：当前用户所属支部及其任职组织 */
export interface ResolvedBranchOrg {
  /** 判定出的支部 ID（未命中时回退第一个任职组织）；该用户无任何任职组织时为 null */
  branchId: number | null
  /** 支部展示名称（接口未返回时为空串） */
  branchName: string
  /** 该用户的全部任职组织（供调用方继续取组织范围） */
  mine: UserOrganization[]
}

/**
 * 解析当前登录用户所属支部：任职组织 → 按组织树深度判定 → 未命中回退第一个任职组织。
 *
 * @returns 支部 ID、名称与全部任职组织（无任职组织时 branchId 为 null）
 */
export async function resolveBranchOrg(): Promise<ResolvedBranchOrg> {
  const me = await getCurrentUser()
  const mine = await listUserOrganizations(me.uid)
  if (mine.length === 0) return { branchId: null, branchName: '', mine }

  const branchId =
    (await findBranchOrg(mine.map((o) => o.organization_id))) ?? mine[0].organization_id
  const self = mine.find((o) => o.organization_id === branchId)
  return { branchId, branchName: self?.organization_name ?? '', mine }
}
