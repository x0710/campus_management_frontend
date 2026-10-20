/**
 * 党委支部端 / 学院端 / 学校端共用：按组织树祖先深度解析当前登录用户所属的各级党委组织（代码要求 1、2）。
 *
 * 判定规则（需求：按组织树层级区分支部 / 学院 / 学校）：
 *   GET /api/organizations/{id}/tree 返回「根 → 该组织」链路，链条数 - 1 即上级组织数量（= 链路首项 level）；
 *   命中目标深度（支部 3/4、学院 1、学校 0，见 config/organization）即为目标组织。用户在多个组织任职时
 *   按任职顺序逐个判定，均未命中则回退为第一个任职组织，保证非该层级账号进入对应门户也能看到自己组织的数据
 *   （而非空白）。
 *
 * 支部工作台、支部管理页、学院工作台、学校总览共用本模块，避免同一判定规则在多处漂移。
 * 组织 / 任职查询均走会话缓存（cachedGet），退出登录由 invalidate() 统一清空。
 */
import { getCurrentUser } from '../api/auth'
import { getOrganizationTree, listUserOrganizations } from '../api/organizations'
import type { UserOrganization } from '../api/types/organizations'

/**
 * 按组织树链路深度判定目标组织（需求：祖先深度命中给定值即算目标组织）。
 *
 * @param orgIds 该用户的全部任职组织 ID（必填；按任职顺序逐个判定）
 * @param depths 目标祖先深度列表（必填；如支部 [3,4]、学院 [1]、学校 [0]）
 * @returns 第一个命中深度的组织 ID；均不满足时返回 null
 */
export async function findOrgByDepths(
  orgIds: number[],
  depths: readonly number[],
): Promise<number | null> {
  for (const id of orgIds) {
    const chain = await getOrganizationTree(id)
    // 链条数 - 1 即上级组织数量（等于链路首项的 level）
    if (depths.includes(chain.length - 1)) return id
  }
  return null
}

/** 解析结果：目标组织及其任职组织 */
export interface ResolvedPortalOrg {
  /** 目标组织 ID（未命中时回退第一个任职组织）；该用户无任何任职组织时为 null */
  orgId: number | null
  /** 目标组织展示名称（接口未返回时为空串） */
  orgName: string
  /** 该用户的全部任职组织（供调用方继续取组织范围） */
  mine: UserOrganization[]
}

/**
 * 解析当前登录用户所属的指定层级组织：任职组织 → 按组织树深度判定 → 未命中回退第一个任职组织。
 *
 * @param depths 目标祖先深度列表（必填；见 config/organization 各门户深度常量）
 * @returns 目标组织 ID、名称与全部任职组织（无任职组织时 orgId 为 null）
 */
export async function resolvePortalOrg(depths: readonly number[]): Promise<ResolvedPortalOrg> {
  const me = await getCurrentUser()
  const mine = await listUserOrganizations(me.uid)
  if (mine.length === 0) return { orgId: null, orgName: '', mine }

  const orgId =
    (await findOrgByDepths(mine.map((o) => o.organization_id), depths)) ?? mine[0].organization_id
  const self = mine.find((o) => o.organization_id === orgId)
  return { orgId, orgName: self?.organization_name ?? '', mine }
}
