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
}