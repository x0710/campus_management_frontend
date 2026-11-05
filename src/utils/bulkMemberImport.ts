/**
 * 「批量添加新成员」写入逻辑（可复用，代码要求 1）。
 *
 * 请求策略（尽可能批量，减少往返）：
 *   1. POST /api/users                     整批创建账号（一次请求提交全部行，含组织任职与身份）
 *      - 后端在单个事务里写入，任一行不合法会整批回滚；此时自动退化为逐行重试，定位到具体出错的行
 *   2. GET  /api/credentials?username=     回查 uid（创建接口只返回条数；只查需要补写信息的行）
 *   3. GET  /api/rbac/users/roles?uids=    一次性取回这批账号已有角色（用于与表格里的角色合并）
 *   4. POST /api/party/profiles            写入党员编号与入党时间（单条接口，有值才写）
 *   5. PATCH /api/users/{uid}              补充手机号 / 邮箱 / 生日（单条接口，有值才写）
 *   6. POST /api/rbac/users/{uid}          追加系统角色（单条接口，与已有角色合并，不覆盖默认角色）
 *
 * 说明：目前只有「创建用户」是批量写接口，党员档案 / 用户资料 / 角色分配都只有单条写接口，
 * 因此这三步仍需按行调用；但「读取已有角色」已改为一次批量查询。
 *
 * 任一步失败都不会中断整批：该行标记为「失败」或「部分成功」，并把原因带回报错弹窗。
 * 注意：本模块会真实写库，页面在调用前必须让用户二次确认。
 */
import axios from 'axios'
import { queryCredentials } from '../api/auth'
import { extractErrorReason } from '../api/common'
import { createPartyProfile } from '../api/partyProfiles'
import { assignUserRoles, queryUserRoles } from '../api/rbac'
import type { UserCreateRequest } from '../api/types/users'
import { createUsers, updateUser } from '../api/users'
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
  /** 新账号的用户 ID（未取到或无需补写时为 null） */
  uid: number | null
  /** success = 全部写入成功；partial = 账号已建但部分信息失败；failed = 账号创建失败 */
  status: 'success' | 'partial' | 'failed'
  /** 失败 / 部分成功的原因（已翻译，可空） */
  message?: string
}

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
 * 该行是否还需要补写党员档案 / 联系方式 / 角色（不需要时就不用回查 uid）。
 * @param member 已通过校验的成员（必填）
 * @returns boolean 是否需要后续写入
 */
function needsFollowUp(member: ParsedMember): boolean {
  return Boolean(
    member.partyNo ||
      member.joinTime ||
      member.phone ||
      member.email ||
      member.birthday ||
      member.roleIds.length > 0,
  )
}

/**
 * 按用户名精确查询用户 ID（创建接口只返回条数，需要回查）。
 * @param username 登录账号名（必填）
 * @returns Promise<number | null> 命中返回 uid，未命中或接口失败返回 null
 */
async function findUserIdByUsername(username: string): Promise<number | null> {
  try {
    const res = await queryCredentials({ username, page: 1, page_size: 10 }, true)
    const matched = res.data.find((item) => item.username === username)
    return matched?.uid ?? null
  } catch {
    return null
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

  const toFailed = (member: ParsedMember, err: unknown): MemberImportOutcome => ({
    row: member.row,
    name: member.name,
    username: member.username,
    uid: null,
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
          uid: null,
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
 * 逐行导入成员（批量建号 + 单条补写，真实写库）。
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

  // 1) 批量创建账号
  const { created, failed } = await createAccounts(members, t)

  // 2) 只为需要补写信息的行回查 uid
  const uidByRow = new Map<number, number>()
  for (const member of created) {
    if (!needsFollowUp(member)) continue
    const uid = await findUserIdByUsername(member.username)
    if (uid === null) {
      failed.set(member.row, {
        row: member.row,
        name: member.name,
        username: member.username,
        uid: null,
        status: 'partial',
        message: t('bulkMembers.import.uidNotFound'),
      })
    } else {
      uidByRow.set(member.row, uid)
    }
  }

  // 3) 一次性取回这批账号已有的角色（用于合并，避免覆盖默认角色）
  const existingRoles = new Map<number, number[]>()
  const uids = Array.from(uidByRow.values())
  let roleReadError: string | null = null
  if (uids.length > 0) {
    try {
      const roleList = await queryUserRoles(uids, true)
      for (const item of roleList) {
        const list = existingRoles.get(item.uid) ?? []
        list.push(item.id)
        existingRoles.set(item.uid, list)
      }
    } catch (err) {
      roleReadError = extractErrorReason(err, t)
    }
  }

  // 4) 逐行补写党员档案 / 联系方式 / 角色，并按行汇报进度
  const outcomes: MemberImportOutcome[] = []
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]
    const base = { row: member.row, name: member.name, username: member.username }
    const early = failed.get(member.row)
    if (early) {
      outcomes.push(early)
      onProgress?.(index + 1, total)
      continue
    }

    const uid = uidByRow.get(member.row) ?? null
    if (uid === null) {
      // 账号已创建且没有需要补写的信息
      outcomes.push({ ...base, uid: null, status: 'success' })
      onProgress?.(index + 1, total)
      continue
    }

    const warnings: string[] = []

    // 党员档案（党员编号 / 入党时间，有值才写）
    if (member.partyNo || member.joinTime) {
      try {
        await createPartyProfile({
          user_id: uid,
          party_no: member.partyNo ? Number(member.partyNo) : null,
          join_time: member.joinTime || null,
        })
      } catch (err) {
        warnings.push(t('bulkMembers.import.partyFailed', { reason: extractErrorReason(err, t) }))
      }
    }

    // 联系方式（手机号 / 邮箱 / 生日，有值才写）
    if (member.phone || member.email || member.birthday) {
      try {
        await updateUser(uid, {
          phone: member.phone || undefined,
          email: member.email || undefined,
          birthday: member.birthday || undefined,
        })
      } catch (err) {
        warnings.push(
          t('bulkMembers.import.contactFailed', { reason: extractErrorReason(err, t) }),
        )
      }
    }

    // 系统角色：读取已有角色（批量查询结果）后合并，避免把默认基础角色冲掉
    if (member.roleIds.length > 0) {
      if (roleReadError) {
        warnings.push(t('bulkMembers.import.roleFailed', { reason: roleReadError }))
      } else {
        try {
          const merged = Array.from(
            new Set([...(existingRoles.get(uid) ?? []), ...member.roleIds]),
          )
          await assignUserRoles(uid, merged)
        } catch (err) {
          warnings.push(t('bulkMembers.import.roleFailed', { reason: extractErrorReason(err, t) }))
        }
      }
    }

    outcomes.push({
      ...base,
      uid,
      status: warnings.length > 0 ? 'partial' : 'success',
      message: warnings.length > 0 ? warnings.join('；') : undefined,
    })
    onProgress?.(index + 1, total)
  }

  return outcomes
}
