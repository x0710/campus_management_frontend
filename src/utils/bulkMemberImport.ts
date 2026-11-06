/**
 * 「批量添加新成员」写入逻辑（可复用，代码要求 1）。
 *
 * 请求策略（尽可能批量，减少往返）：
 *   1. GET  /api/users?ids=                一次性判断哪些 UID 已存在（已存在则走更新，不重复创建）
 *   2. POST /api/users                    仅对不存在的 UID 整批创建账号（一次请求提交全部新行）
 *      - 后端在单个事务里写入，任一行不合法会整批回滚；此时自动退化为逐行重试，定位到具体出错的行
 *   3. GET  /api/rbac/users/roles?uids=    一次性取回这批账号已有角色（用于与表格里的角色合并）
 *   4. 逐行写入：
 *      - 新账号：POST /api/party/profiles、PATCH /api/users/{uid} 补充资料、POST /api/rbac/users/{uid} 追加角色
 *      - 已有账号：PATCH /api/users/{uid} 更新资料、按「组织:身份」同步组织任职、
 *        POST/PATCH /api/party/profiles 写入党员档案、合并系统角色
 *   5. 个人档案：GET /api/profile-details?uids= 一次性取回这批账号的档案，
 *      表格填了民族 / 籍贯 / 户口所在地 / 户口性质时，PATCH /api/profile-details/{id} 更新对应字段；
 *      没有档案的账号不会自动创建档案，只在结果里记录提示。
 *   6. 组织任职只有单条增删接口，更新时按导入内容同步：缺少的添加，导入里没有的移除；
 *      仅比对组织与身份，不改动原有工作地点。
 *
 * 任一步失败都不会中断整批：该行标记为「失败」或「部分成功」，并把原因带回报错弹窗。
 * 注意：本模块会真实写库，页面在调用前必须让用户二次确认。
 */
import axios from 'axios'
import { extractErrorReason } from '../api/common'
import { addOrgMember, listUserOrganizations, removeOrgMember } from '../api/organizations'
import { createPartyProfile, queryPartyProfiles, updatePartyProfile } from '../api/partyProfiles'
import { queryProfileDetails, updateProfileDetail } from '../api/profileDetails'
import { assignUserRoles, queryUserRoles } from '../api/rbac'
import type { UserCreateRequest, UserUpdateRequest } from '../api/types/users'
import { createUsers, queryUsers, updateUser } from '../api/users'
import type { TranslateFn } from '../i18n'
import type { ParsedMember } from './bulkMemberCheck'

/** 单行导入结果 */
export interface MemberImportOutcome {
  /** Excel 行号（1 基，必填） */
  row: number
  /** 姓名（必填，可能为空串） */
  name: string
  /** 登录账号名（必填） */
  username: string
  /** 用户 ID（必填；导入时由登录账号名得到） */
  uid: number | null
  /** create = 新建账号；update = 账号已存在，更新其资料 */
  action: 'create' | 'update'
  /** success = 全部写入成功；partial = 账号已建/已更新但部分信息失败；failed = 账号创建失败 */
  status: 'success' | 'partial' | 'failed'
  /** 失败 / 部分成功的原因（已翻译，可空） */
  message?: string
}

/** 单次判重查询的最大 UID 数量（对应 GET /api/users?ids= 的 page_size 上限） */
const EXISTING_LOOKUP_BATCH_SIZE = 100

/**
 * 把一行解析结果转成 POST /api/users 的请求元素。
 * 组织与身份按下标一一对应；工作地点留空字符串（后端要求三个数组等长）。
 * @param member 已通过校验的成员（必填）
 * @returns UserCreateRequest 创建请求
 */
function toCreateRequest(member: ParsedMember): UserCreateRequest {
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
 * 批量判断哪些用户 ID 已存在（存在则导入时走更新，不再创建）。
 * 查询失败时按「不存在」处理，由创建接口的 409 逐行兜底。
 * @param uids 待查询的用户 ID 列表（必填）
 * @returns Promise<Set<number>> 已存在的用户 ID 集合
 */
async function findExistingUids(uids: number[]): Promise<Set<number>> {
  const existing = new Set<number>()
  const unique = Array.from(new Set(uids))
  for (let start = 0; start < unique.length; start += EXISTING_LOOKUP_BATCH_SIZE) {
    const chunk = unique.slice(start, start + EXISTING_LOOKUP_BATCH_SIZE)
    try {
      const res = await queryUsers(
        { page: 1, page_size: chunk.length, ids: chunk.join(',') },
        true,
      )
      for (const item of res.data) existing.add(item.uid)
    } catch {
      // 判重失败不阻塞导入：这些行会按新账号创建，已存在时由 409 报错
    }
  }
  return existing
}

/**
 * 批量查询这批账号的个人档案 ID（没有档案的用户不会出现在结果里）。
 * 查询失败时按「没有档案」处理，该行会记录「个人档案未写入」的提示。
 * @param uids 待查询的用户 ID 列表（必填）
 * @returns Promise<Map<number, number>> 用户 ID → 档案主键 ID
 */
async function findProfileIdsByUid(uids: number[]): Promise<Map<number, number>> {
  const profileIdByUid = new Map<number, number>()
  const unique = Array.from(new Set(uids))
  for (let start = 0; start < unique.length; start += EXISTING_LOOKUP_BATCH_SIZE) {
    const chunk = unique.slice(start, start + EXISTING_LOOKUP_BATCH_SIZE)
    try {
      const res = await queryProfileDetails(
        { page: 1, page_size: chunk.length, uids: chunk.join(',') },
        true,
      )
      for (const profile of res.data) profileIdByUid.set(profile.user_id, profile.id)
    } catch {
      // 查询失败不阻塞导入：这些行会记录「个人档案未写入」的提示
    }
  }
  return profileIdByUid
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
 * 把表格里的民族 / 籍贯 / 户口所在地 / 户口性质写入已有个人档案。
 * 没有档案时不自动创建（后端创建档案还要求身份证号 / 生日 / 班级 ID），只记录提示。
 * @param member 成员数据（必填）
 * @param profileIdByUid 用户 ID → 档案 ID（必填）
 * @param warnings 失败原因收集数组（必填）
 * @param t 翻译函数（必填）
 */
async function writeProfileExtras(
  member: ParsedMember,
  profileIdByUid: Map<number, number>,
  warnings: string[],
  t: TranslateFn,
): Promise<void> {
  if (!hasProfileExtras(member)) return
  const profileId = profileIdByUid.get(member.uid)
  if (!profileId) {
    warnings.push(t('bulkMembers.import.profileMissing'))
    return
  }
  const body = {
    ...(member.ethnic ? { ethnic: member.ethnic } : {}),
    ...(member.nativePlace ? { native_place: member.nativePlace } : {}),
    ...(member.householdLocation ? { household_location: member.householdLocation } : {}),
    ...(member.householdType ? { household_type: member.householdType } : {}),
  }
  try {
    await updateProfileDetail(profileId, body)
  } catch (err) {
    warnings.push(t('bulkMembers.import.profileFailed', { reason: extractErrorReason(err, t) }))
  }
}

/**
 * 批量创建账号；整批失败时退化为逐行重试，定位具体出错的行。
 * @param members 待创建的成员（必填）
 * @param t 翻译函数（必填）
 * @returns Promise<{ created: ParsedMember[]; failed: Map<number, MemberImportOutcome> }>
 *   created 为账号创建成功的行，failed 为创建失败的行（键为行号）
 */
async function createAccounts(
  members: ParsedMember[],
  t: TranslateFn,
): Promise<{ created: ParsedMember[]; failed: Map<number, MemberImportOutcome> }> {
  const created: ParsedMember[] = []
  const failed = new Map<number, MemberImportOutcome>()
  if (members.length === 0) return { created, failed }

  const toFailed = (member: ParsedMember, err: unknown): MemberImportOutcome => ({
    row: member.row,
    name: member.name,
    username: member.username,
    uid: member.uid,
    action: 'create',
    status: 'failed',
    message: extractErrorReason(err, t),
  })

  try {
    // 一次请求创建全部账号（后端单事务，失败则整批回滚）
    await createUsers(members.map(toCreateRequest))
    created.push(...members)
    return { created, failed }
  } catch (batchError) {
    const status = axios.isAxiosError(batchError) ? batchError.response?.status : undefined
    // 权限 / 服务端异常不是某一行的问题，直接整批标记失败，避免再打 N 次请求
    const canRetryPerRow =
      status === undefined || status === 400 || status === 409 || status === 412

    if (!canRetryPerRow) {
      const message = extractErrorReason(batchError, t)
      for (const member of members) {
        failed.set(member.row, {
          row: member.row,
          name: member.name,
          username: member.username,
          uid: member.uid,
          action: 'create',
          status: 'failed',
          message,
        })
      }
      return { created, failed }
    }

    // 整批已回滚（没有写入任何数据），逐行重试以找出具体是哪一行不合法
    for (const member of members) {
      try {
        await createUsers([toCreateRequest(member)])
        created.push(member)
      } catch (err) {
        failed.set(member.row, toFailed(member, err))
      }
    }
    return { created, failed }
  }
}

/**
 * 写入 / 更新党员档案（党员编号与入党时间，有值才写）。
 * @param member 成员数据（必填）
 * @param warnings 失败原因收集数组（必填）
 * @param t 翻译函数（必填）
 * @param isExisting 目标账号是否已存在（已存在时先查询档案，存在则 PATCH，否则 POST）
 */
async function writePartyProfile(
  member: ParsedMember,
  warnings: string[],
  t: TranslateFn,
  isExisting: boolean,
): Promise<void> {
  if (!member.partyNo && !member.joinTime) return
  const body = {
    party_no: member.partyNo ? Number(member.partyNo) : null,
    join_time: member.joinTime || null,
  }
  try {
    if (isExisting) {
      const profiles = await queryPartyProfiles([member.uid], true)
      if (profiles.some((profile) => profile.user_id === member.uid)) {
        await updatePartyProfile(member.uid, body)
        return
      }
    }
    await createPartyProfile({ user_id: member.uid, ...body })
  } catch (err) {
    warnings.push(t('bulkMembers.import.partyFailed', { reason: extractErrorReason(err, t) }))
  }
}

/**
 * 写入联系方式：新账号仅补写手机号 / 邮箱 / 生日；已有账号同时更新姓名与性别。
 * @param member 成员数据（必填）
 * @param warnings 失败原因收集数组（必填）
 * @param t 翻译函数（必填）
 * @param isExisting 目标账号是否已存在（必填）
 */
async function writeProfileFields(
  member: ParsedMember,
  warnings: string[],
  t: TranslateFn,
  isExisting: boolean,
): Promise<void> {
  if (!isExisting && !member.phone && !member.email && !member.birthday) return
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
  try {
    await updateUser(member.uid, body)
  } catch (err) {
    warnings.push(t('bulkMembers.import.contactFailed', { reason: extractErrorReason(err, t) }))
  }
}

/**
 * 合并系统角色：读取已有角色后与导入的角色 ID 取并集，避免把默认基础角色冲掉。
 * @param member 成员数据（必填）
 * @param existingRoles 该用户已有的角色 ID 列表（必填，可为空）
 * @param roleReadError 批量读取角色时的失败原因（可为 null）
 * @param warnings 失败原因收集数组（必填）
 * @param t 翻译函数（必填）
 */
async function mergeRoles(
  member: ParsedMember,
  existingRoles: number[],
  roleReadError: string | null,
  warnings: string[],
  t: TranslateFn,
): Promise<void> {
  if (member.roleIds.length === 0) return
  if (roleReadError) {
    warnings.push(t('bulkMembers.import.roleFailed', { reason: roleReadError }))
    return
  }
  try {
    const merged = Array.from(new Set([...existingRoles, ...member.roleIds]))
    await assignUserRoles(member.uid, merged)
  } catch (err) {
    warnings.push(t('bulkMembers.import.roleFailed', { reason: extractErrorReason(err, t) }))
  }
}

/**
 * 同步已有账号的组织任职：以导入的「组织:身份」为准，缺少的添加、导入里没有的移除。
 * 仅比对组织与职位，不改动原有工作地点。
 * @param member 成员数据（必填）
 * @param warnings 失败原因收集数组（必填）
 * @param t 翻译函数（必填）
 */
async function syncMemberRelations(
  member: ParsedMember,
  warnings: string[],
  t: TranslateFn,
): Promise<void> {
  const target = new Map<string, { orgId: number; position: string }>()
  for (const entry of member.orgIdentities) {
    for (const position of entry.positions) {
      target.set(`${entry.orgId}:${position}`, { orgId: entry.orgId, position })
    }
  }
  if (target.size === 0) return

  let existing: Awaited<ReturnType<typeof listUserOrganizations>>
  try {
    existing = await listUserOrganizations(member.uid, true)
  } catch (err) {
    warnings.push(t('bulkMembers.import.orgFailed', { reason: extractErrorReason(err, t) }))
    return
  }

  const existingKeys = new Set(existing.map((rel) => `${rel.organization_id}:${rel.position}`))

  // 移除导入里不再包含的任职（保留导入仍然存在的任职，避免误删工作地点）
  for (const rel of existing) {
    if (target.has(`${rel.organization_id}:${rel.position}`)) continue
    try {
      await removeOrgMember(rel.organization_id, rel.id)
    } catch (err) {
      warnings.push(t('bulkMembers.import.orgFailed', { reason: extractErrorReason(err, t) }))
    }
  }

  // 补充导入里新增的任职
  for (const [key, rel] of target) {
    if (existingKeys.has(key)) continue
    try {
      await addOrgMember(rel.orgId, {
        user_id: member.uid,
        position: rel.position,
        workplace: null,
      })
    } catch (err) {
      warnings.push(t('bulkMembers.import.orgFailed', { reason: extractErrorReason(err, t) }))
    }
  }
}

/**
 * 更新一个已存在的账号：资料、组织任职、党员档案与角色。
 * @param member 成员数据（必填）
 * @param existingRoles 该用户已有的角色 ID 列表（必填，可为空）
 * @param roleReadError 批量读取角色时的失败原因（可为 null）
 * @param profileIdByUid 用户 ID → 个人档案 ID（必填）
 * @param t 翻译函数（必填）
 * @returns Promise<MemberImportOutcome> 该行的更新结果
 */
async function updateExistingMember(
  member: ParsedMember,
  existingRoles: number[],
  roleReadError: string | null,
  profileIdByUid: Map<number, number>,
  t: TranslateFn,
): Promise<MemberImportOutcome> {
  const warnings: string[] = []
  await writeProfileFields(member, warnings, t, true)
  await syncMemberRelations(member, warnings, t)
  await writePartyProfile(member, warnings, t, true)
  await writeProfileExtras(member, profileIdByUid, warnings, t)
  await mergeRoles(member, existingRoles, roleReadError, warnings, t)
  return {
    row: member.row,
    name: member.name,
    username: member.username,
    uid: member.uid,
    action: 'update',
    status: warnings.length > 0 ? 'partial' : 'success',
    message: warnings.length > 0 ? warnings.join('；') : undefined,
  }
}

/**
 * 新账号创建成功后的补写：党员档案、联系方式与系统角色。
 * @param member 成员数据（必填）
 * @param existingRoles 该用户已有的角色 ID 列表（必填，可为空）
 * @param roleReadError 批量读取角色时的失败原因（可为 null）
 * @param profileIdByUid 用户 ID → 个人档案 ID（必填）
 * @param t 翻译函数（必填）
 * @returns Promise<MemberImportOutcome> 该行的结果
 */
async function finalizeCreatedMember(
  member: ParsedMember,
  existingRoles: number[],
  roleReadError: string | null,
  profileIdByUid: Map<number, number>,
  t: TranslateFn,
): Promise<MemberImportOutcome> {
  const warnings: string[] = []
  await writePartyProfile(member, warnings, t, false)
  await writeProfileFields(member, warnings, t, false)
  await writeProfileExtras(member, profileIdByUid, warnings, t)
  await mergeRoles(member, existingRoles, roleReadError, warnings, t)
  return {
    row: member.row,
    name: member.name,
    username: member.username,
    uid: member.uid,
    action: 'create',
    status: warnings.length > 0 ? 'partial' : 'success',
    message: warnings.length > 0 ? warnings.join('；') : undefined,
  }
}

/**
 * 逐行导入成员（批量建号 + 已存在账号更新 + 单条补写，真实写库）。
 * @param params.members 已通过校验的成员（必填）
 * @param params.t 翻译函数（必填）
 * @param params.onProgress 进度回调（可选，(已完成行数, 总行数) => void）
 * @returns Promise<MemberImportOutcome[]> 与 members 顺序一致的逐行结果
 */
export async function importMemberRows(params: {
  members: ParsedMember[]
  t: TranslateFn
  onProgress?: (done: number, total: number) => void
}): Promise<MemberImportOutcome[]> {
  const { members, t, onProgress } = params
  const total = members.length

  // 1) 先判断哪些 UID 已存在：已存在走更新，其余走创建
  const existingUids = await findExistingUids(members.map((member) => member.uid))
  const toCreate = members.filter((member) => !existingUids.has(member.uid))

  // 2) 批量创建新账号
  const { created, failed } = await createAccounts(toCreate, t)
  const createdRows = new Set(created.map((member) => member.row))

  // 3) 一次性取回这批账号已有的角色（用于合并，避免覆盖默认角色）
  const existingRoles = new Map<number, number[]>()
  const roleLookupUids = members
    .filter(
      (member) =>
        member.roleIds.length > 0 &&
        (existingUids.has(member.uid) || createdRows.has(member.row)),
    )
    .map((member) => member.uid)
  let roleReadError: string | null = null
  if (roleLookupUids.length > 0) {
    try {
      const roleList = await queryUserRoles(roleLookupUids, true)
      for (const item of roleList) {
        const list = existingRoles.get(item.uid) ?? []
        list.push(item.id)
        existingRoles.set(item.uid, list)
      }
    } catch (err) {
      roleReadError = extractErrorReason(err, t)
    }
  }

  // 4) 一次性取回这批账号的个人档案 ID（用于写入民族 / 籍贯 / 户口信息）
  const profileIdByUid = await findProfileIdsByUid(
    members
      .filter(
        (member) =>
          hasProfileExtras(member) &&
          (existingUids.has(member.uid) || createdRows.has(member.row)),
      )
      .map((member) => member.uid),
  )

  // 5) 逐行写入（已存在：更新；新建：补写），并按行汇报进度
  const outcomes: MemberImportOutcome[] = []
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]

    if (existingUids.has(member.uid)) {
      outcomes.push(
        await updateExistingMember(
          member,
          existingRoles.get(member.uid) ?? [],
          roleReadError,
          profileIdByUid,
          t,
        ),
      )
    } else if (!createdRows.has(member.row)) {
      // 账号创建失败：沿用 createAccounts 记录的具体原因
      outcomes.push(
        failed.get(member.row) ?? {
          row: member.row,
          name: member.name,
          username: member.username,
          uid: member.uid,
          action: 'create',
          status: 'failed',
          message: t('bulkMembers.import.createFailed'),
        },
      )
    } else {
      outcomes.push(
        await finalizeCreatedMember(
          member,
          existingRoles.get(member.uid) ?? [],
          roleReadError,
          profileIdByUid,
          t,
        ),
      )
    }
    onProgress?.(index + 1, total)
  }

  return outcomes
}
