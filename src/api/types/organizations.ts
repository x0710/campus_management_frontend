/**
 * 组织模块类型定义：组织信息、组织成员、用户-组织任职详情与查询参数。
 * 供 api/organizations.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 组织信息（api.json: OrganizationInfoDto） */
export interface OrganizationInfo {
  id: number
  code: string
  name: string
  parent_id: number | null
  created_at: string
  updated_at: string
}

/** 组织成员新增请求体（POST /organizations/{id}/members body；position 为字符串编码） */
export interface OrganizationMemberInput {
  user_id: number
  position: string
  workplace: string | null
}

/** POST /api/organization-members 批量添加任职元素 */
export interface MemberBatchCreate extends OrganizationMemberInput {
  organization_id: number
}

/** PATCH /api/organization-members 批量删除任职元素 */
export interface MemberBatchDelete {
  organization_id: number
  member_id: number
}

/** 组织成员记录（GET /organizations/{id}/members 返回项，含成员记录 id 与创建时间） */
export interface OrganizationMember {
  id: number
  user_id: number
  position: string
  workplace: string | null
  created_at: string
}

/** 用户-组织任职详情（GET /organization-members?uids= 返回项） */
export interface UserOrganization extends OrganizationMember {
  organization_id: number
  organization_name: string
}

/** PATCH /organization-members/{id}/workplace：字段必传，null 表示清空。 */
export interface WorkplaceUpdateRequest {
  workplace: string | null
}

/**
 * 批量人数统计条件（POST /organizations/member-counts 请求体单项）。
 * 接口要求每批 1～100 项，每项必须包含 org_id。
 */
export interface OrganizationMemberCountRequest {
  /** 组织 ID（必填，必须大于 0） */
  org_id: number
  /** 职位编码，精确匹配；不传或为 null 时统计全部职位 */
  position?: string | null
  /** 是否包含数据范围内的子组织（默认 false） */
  recursive?: boolean
}

/**
 * 批量人数统计可额外返回的信息（POST /organizations/member-counts?include=...）。
 * 多个选项用英文逗号拼接，统一作用于请求体中的每一项：
 * - ethnic：返回 ethnic_counts（民族名称 → 人数）；
 * - gender：返回 gender_counts；
 * - organization_name：返回根组织名称 organization_name；
 * - personnel：返回 personnel_counts（学生 / 职工 / 其他）。
 */
export type OrganizationMemberCountInclude =
  | 'ethnic'
  | 'gender'
  | 'organization_name'
  | 'personnel'

/** 当前统计范围内的性别分布：未填写、异常值或无对应用户归入 unknown；三项之和等于 member_count */
export interface OrganizationMemberGenderCounts {
  male: number
  female: number
  unknown: number
}

/**
 * 当前统计范围内按档案是否存在划分的人数：学生与职工身份可重叠（不按在读 / 在职状态过滤），
 * other_count 仅统计两种档案都不存在的成员，因此三项之和可能大于 member_count。
 */
export interface OrganizationMemberPersonnelCounts {
  student_count: number
  staff_count: number
  other_count: number
}

/**
 * 批量人数统计结果（POST /organizations/member-counts 返回项，与请求逐项对应且顺序一致）。
 * member_count 按用户 ID 去重，跨组织任职也只计一次。
 */
export interface OrganizationMemberCountItem {
  /** 组织 ID */
  org_id: number
  /** 统计条件中的职位编码（未指定时为 null） */
  position?: string | null
  /** 是否包含子组织 */
  recursive: boolean
  /** 按用户 ID 去重的人数（非负；无匹配成员时为 0） */
  member_count: number
  /**
   * 仅 ?include=ethnic 时返回的民族分布（民族名称 → 人数）。
   * 名称已去除首尾空格，未填写或无档案归入 `unknown`，各项之和等于 member_count。
   */
  ethnic_counts?: Record<string, number> | null
  /** 仅 ?include=gender 时返回的性别分布 */
  gender_counts?: OrganizationMemberGenderCounts | null
  /** 仅 ?include=organization_name 时返回（递归统计仍为根组织名称；组织不存在时为 null） */
  organization_name?: string | null
  /** 仅 ?include=personnel 时返回的学生 / 职工 / 其他人数 */
  personnel_counts?: OrganizationMemberPersonnelCounts | null
}

/** 组织树链路节点（GET /organizations/{id}/tree 返回项；链路顺序为「根 → 查询组织」） */
export interface OrganizationTreeNode {
  id: number
  name: string
  code: string
  /** 距查询组织自身的层级：链上最后一项恒为 0，越靠根越大（根节点的 level 即链路深度） */
  level: number
}

/** 组织分页查询参数 */
export interface OrganizationQuery {
  page?: number
  page_size?: number
  keyword?: string
  parent_id?: number
}

/** 组织成员分页查询参数 */
export interface OrganizationMemberQuery extends PageQuery {
  position?: string
  user_id?: number
  /** 按用户 ID 批量筛选（逗号分隔，如 "1,2,3"） */
  uids?: string
}
