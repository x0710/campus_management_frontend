/**
 * 用户任职记录分组工具。
 *
 * GET /api/organization-members?uids= 的返回粒度是「一条记录 = 一个职位」，
 * 同一用户在同一个组织有多个职位时会有多条记录。成员详情等展示场景需要
 * 按组织合并成一张卡片，避免同一个人重复出现，职位栏并列展示该组织的全部职位。
 * 组织成员列表（GET /api/organizations/{id}/members）同样是「一条记录 = 一个职位」，
 * 列表展示需按 user_id 合并为一行（见 groupOrganizationMembers），避免列表出现重复人员。
 */
import type {
  OrganizationMember,
  UserOrganization,
} from '../api/types/organizations'

/** 按组织合并后的任职分组（items 保持接口返回顺序，保留各自的职位 / 工作地点） */
export interface UserOrganizationGroup<T extends UserOrganization = UserOrganization> {
  /** 组织 ID（分组依据） */
  organization_id: number
  /** 组织名称（取该组首条记录） */
  organization_name: string
  /** 该组织下的全部任职记录（含多个职位） */
  items: T[]
}

/**
 * 按 organization_id 把任职记录合并为「一个组织一项」，顺序按组织首次出现。
 * @param orgs 原始任职记录（必填，可为空数组）
 * @returns 分组数组
 */
export function groupUserOrganizationsByOrg<T extends UserOrganization>(
  orgs: T[],
): UserOrganizationGroup<T>[] {
  const map = new Map<number, UserOrganizationGroup<T>>()
  for (const org of orgs) {
    const group = map.get(org.organization_id)
    if (group) {
      group.items.push(org)
    } else {
      map.set(org.organization_id, {
        organization_id: org.organization_id,
        organization_name: org.organization_name,
        items: [org],
      })
    }
  }
  return [...map.values()]
}

/**
 * 提取分组内的职位编码（去重、去空，保留接口顺序），用于职位栏并列展示多个职位。
 * @param items 同一组织下的任职记录（必填）
 * @returns 职位编码数组（可能为空）
 */
export function uniquePositionCodes<T extends OrganizationMember>(items: T[]): string[] {
  const codes = new Set<string>()
  for (const item of items) {
    const code = item.position?.trim()
    if (code) codes.add(code)
  }
  return [...codes]
}

/**
 * 提取分组内的工作地点（去重、去空，保留接口顺序）。
 * @param items 同一组织下的任职记录（必填）
 * @returns 工作地点数组（可能为空）
 */
export function uniqueWorkplaces<T extends OrganizationMember>(items: T[]): string[] {
  const places = new Set<string>()
  for (const item of items) {
    const place = item.workplace?.trim()
    if (place) places.add(place)
  }
  return [...places]
}

/**
 * 去重用户任职组织：同一组织有多条职位记录时只保留第一条（用于「所属组织」标签展示）。
 * @param orgs 用户的任职记录（必填，可为空数组）
 * @returns 每个组织只出现一次的任职记录数组（顺序按首次出现）
 */
export function uniqueUserOrganizations(orgs: UserOrganization[]): UserOrganization[] {
  const map = new Map<number, UserOrganization>()
  for (const org of orgs) {
    if (!map.has(org.organization_id)) map.set(org.organization_id, org)
  }
  return [...map.values()]
}

/** 成员表展示行：同一用户在同一组织下的多条职位记录合并为一行 */
export interface UserMemberRow extends OrganizationMember {
  /** 该组织下的全部职位编码（去重、去空，保留接口顺序） */
  positions: string[]
  /** 该组织下的全部工作地点（去重、去空，保留接口顺序） */
  workplaces: string[]
  /** 该行对应的全部成员记录 ID（移除成员时需一并删除） */
  memberIds: number[]
}

/**
 * 按 user_id 把组织成员记录合并为一行：
 * GET /api/organizations/{id}/members 的粒度是「一条记录 = 一个职位」，
 * 同一成员在同一组织有多个职位时会返回多行；合并后只保留一行，职位 / 工作地点并列展示。
 * @param members 组织成员列表（必填，通常为当前页数据）
 * @returns 合并后的成员行（顺序按 user_id 首次出现）
 */
export function groupOrganizationMembers(members: OrganizationMember[]): UserMemberRow[] {
  const map = new Map<number, UserMemberRow>()
  for (const member of members) {
    const row = map.get(member.user_id)
    if (row) {
      row.memberIds.push(member.id)
      const code = member.position?.trim()
      if (code && !row.positions.includes(code)) row.positions.push(code)
      const place = member.workplace?.trim()
      if (place && !row.workplaces.includes(place)) row.workplaces.push(place)
    } else {
      map.set(member.user_id, {
        ...member,
        positions: uniquePositionCodes([member]),
        workplaces: uniqueWorkplaces([member]),
        memberIds: [member.id],
      })
    }
  }
  return [...map.values()]
}
