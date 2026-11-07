/**
 * 表格数据 → 后端请求体的转换，以及组织任职 / 党员档案的差集计算。
 *
 * 约定：组织与身份按下标一一对应；工作地点留空字符串（后端要求三个数组等长）。
 */
import axios from 'axios'
import type {
  MemberBatchCreate,
  MemberBatchDelete,
  UserOrganization,
} from '../../api/types/organizations'
import type { PartyProfileBatchUpdate, PartyProfileCreateRequest } from '../../api/types/partyProfiles'
import type { ProfileDetailCreateRequest } from '../../api/types/profileDetails'
import type { UserCreateRequest, UserUpdateRequest } from '../../api/types/users'
import type { ParsedMember } from '../bulkMemberCheck'
import type { MemberImportOutcome } from './types'

/**
 * 把一行解析结果转成 POST /api/users 的请求元素。
 * 组织与身份按下标一一对应；工作地点留空字符串（后端要求三个数组等长）。
 * @param member 已通过校验的成员（必填）
 * @returns UserCreateRequest 创建请求
 */
export function toCreateRequest(member: ParsedMember): UserCreateRequest {
  const orgs: number[] = []
  const positions: string[] = []
  const workplaces: string[] = []
  for (const entry of member.orgIdentities) {
    for (const code of entry.positions) {
      orgs.push(entry.orgId)
      positions.push(code)
      workplaces.push('')
    }
  }
  return {
    uid: member.uid,
    username: member.username,
    password: member.password,
    name: member.name || undefined,
    gender: member.gender === '男' ? 'male' : member.gender === '女' ? 'female' : undefined,
    org: orgs,
    pos: positions,
    workplaces,
  }
}

/**
 * 该行是否填写了个人档案信息（民族 / 籍贯 / 户口所在地 / 户口性质）。
 * @param member 成员数据（必填）
 * @returns boolean 是否填写了任一项
 */
function hasProfileExtras(member: ParsedMember): boolean {
  return Boolean(
    member.ethnic ||
      member.nativePlace ||
      member.householdLocation ||
      member.householdType,
  )
}

/**
 * 把表格里的民族 / 籍贯 / 户口所在地 / 户口性质转成批量保存请求；未填写的字段不传。
 * PUT /api/profile-details 按 user_id upsert，未传字段保留原值。
 * @param member 成员数据（必填）
 * @returns ProfileDetailCreateRequest | null 没有可写字段时返回 null
 */
export function toProfileExtrasRequest(member: ParsedMember): ProfileDetailCreateRequest | null {
  if (!hasProfileExtras(member)) return null
  return {
    user_id: member.uid,
    ...(member.ethnic ? { ethnic: member.ethnic } : {}),
    ...(member.nativePlace ? { native_place: member.nativePlace } : {}),
    ...(member.householdLocation ? { household_location: member.householdLocation } : {}),
    ...(member.householdType ? { household_type: member.householdType } : {}),
  }
}

/**
 * 把表格里的资料字段转成批量更新请求。
 * 新账号创建时已写入姓名 / 性别，这里只补手机号 / 邮箱 / 生日；已有账号同时更新姓名与性别。
 * @param member 成员数据（必填）
 * @param isExisting 目标账号是否已存在（必填）
 * @returns UserUpdateRequest | null 没有可更新字段时返回 null
 */
export function toUserUpdateRequest(
  member: ParsedMember,
  isExisting: boolean,
): UserUpdateRequest | null {
  const body: UserUpdateRequest = {
    ...(isExisting
      ? {
          name: member.name || undefined,
          gender: member.gender === '男' ? 'male' : member.gender === '女' ? 'female' : undefined,
        }
      : {}),
    phone: member.phone || undefined,
    email: member.email || undefined,
    birthday: member.birthday || undefined,
  }
  return Object.keys(body).length > 0 ? body : null
}

/**
 * 批量写失败后是否值得拆分 / 逐项重试。
 * 400 / 409 / 412 可能由单项数据引起；413 / 414 / 431 是请求过大，拆分后通常可成功；
 * 网络异常（无 status）也允许拆分重试。401 / 403 等整批权限问题直接整批标记，避免打 N 次请求。
 * @param err 批量调用抛出的异常（必填）
 * @returns boolean 是否拆分 / 逐项重试
 */
export function canRetryPerItem(err: unknown): boolean {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined
  return (
    status === undefined ||
    status === 400 ||
    status === 409 ||
    status === 412 ||
    status === 413 ||
    status === 414 ||
    status === 431
  )
}

/**
 * 给指定行追加失败原因。
 * @param warningsByRow 行号 → 失败原因列表（必填）
 * @param row Excel 行号（必填）
 * @param message 已翻译的失败原因（必填）
 */
export function addWarning(
  warningsByRow: Map<number, string[]>,
  row: number,
  message: string,
): void {
  const list = warningsByRow.get(row)
  if (list) list.push(message)
  else warningsByRow.set(row, [message])
}

/**
 * 预估一个分片最多可能发出的请求数（用于进度条分母）。
 * 预估只看「这一片填了哪些信息」，不看账号是否已存在，因此可以在导入开始前算好。
 * @param chunk 一个分片的成员（必填）
 * @returns number 该分片的预估请求数
 */
export function planChunkRequests(chunk: ParsedMember[]): number {
  if (chunk.length === 0) return 0
  const hasRoles = chunk.some((member) => member.roleIds.length > 0)
  const hasOrg = chunk.some((member) => member.orgIdentities.length > 0)
  const hasParty = chunk.some((member) => member.partyNo || member.joinTime)
  const hasProfile = chunk.some(hasProfileExtras)
  // 账号创建 1 + 用户资料更新 1
  let total = 2
  if (hasRoles) total += 2 // 读取已有角色 + 写入角色
  if (hasOrg) total += 3 // 读取已有任职 + 移除多余 + 新增缺少
  if (hasParty) total += 3 // 读取已有档案 + 创建档案 + 更新档案
  if (hasProfile) total += 1
  return total
}

/**
 * 把创建失败的信息转成逐行结果。
 * @param member 成员（必填）
 * @param message 失败原因（必填，已翻译）
 * @returns MemberImportOutcome 失败结果
 */
export function toFailedOutcome(member: ParsedMember, message: string): MemberImportOutcome {
  return {
    row: member.row,
    name: member.name,
    username: member.username,
    uid: member.uid,
    action: 'create',
    status: 'failed',
    message,
  }
}

/**
 * 按导入内容与现有任职做差集，得到需要移除 / 新增的组织任职。
 * @param members 需要同步任职的成员（必填）
 * @param orgByUid 已有账号的任职列表（必填）
 * @returns 移除 / 新增的任职及对应行号
 */
export function collectOrgChanges(
  members: ParsedMember[],
  orgByUid: Map<number, UserOrganization[]>,
): {
  removalRows: number[]
  removals: MemberBatchDelete[]
  additionRows: number[]
  additions: MemberBatchCreate[]
} {
  const removalRows: number[] = []
  const removals: MemberBatchDelete[] = []
  const additionRows: number[] = []
  const additions: MemberBatchCreate[] = []
  for (const member of members) {
    if (member.orgIdentities.length === 0) continue
    const existing = orgByUid.get(member.uid) ?? []
    const target = new Map<string, { orgId: number; position: string }>()
    for (const entry of member.orgIdentities) {
      for (const position of entry.positions) {
        target.set(`${entry.orgId}:${position}`, { orgId: entry.orgId, position })
      }
    }
    const existingKeys = new Set(
      existing.map((rel) => `${rel.organization_id}:${rel.position}`),
    )
    for (const rel of existing) {
      if (target.has(`${rel.organization_id}:${rel.position}`)) continue
      removalRows.push(member.row)
      removals.push({ organization_id: rel.organization_id, member_id: rel.id })
    }
    for (const [key, relation] of target) {
      if (existingKeys.has(key)) continue
      additionRows.push(member.row)
      additions.push({
        organization_id: relation.orgId,
        user_id: member.uid,
        position: relation.position,
        workplace: null,
      })
    }
  }
  return { removalRows, removals, additionRows, additions }
}

/**
 * 按是否已有党员档案，把表格里的党员信息拆成「创建」与「更新」两组。
 * @param members 需要写党员档案的成员（必填）
 * @param partyProfileUids 已有党员档案的 UID 集合（必填）
 * @returns 创建 / 更新的请求及对应行号
 */
export function collectPartyChanges(
  members: ParsedMember[],
  partyProfileUids: Set<number>,
): {
  createRows: number[]
  createPayloads: PartyProfileCreateRequest[]
  updateRows: number[]
  updatePayloads: PartyProfileBatchUpdate[]
} {
  const createRows: number[] = []
  const createPayloads: PartyProfileCreateRequest[] = []
  const updateRows: number[] = []
  const updatePayloads: PartyProfileBatchUpdate[] = []
  for (const member of members) {
    if (!member.partyNo && !member.joinTime) continue
    const body = {
      party_no: member.partyNo ? Number(member.partyNo) : null,
      join_time: member.joinTime || null,
    }
    if (partyProfileUids.has(member.uid)) {
      updateRows.push(member.row)
      updatePayloads.push({ user_id: member.uid, ...body })
    } else {
      createRows.push(member.row)
      createPayloads.push({ user_id: member.uid, ...body })
    }
  }
  return { createRows, createPayloads, updateRows, updatePayloads }
}
