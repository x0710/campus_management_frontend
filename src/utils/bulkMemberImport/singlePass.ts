/**
 * 一次性全量导入：每个阶段先按最大 1000 条发送批量请求（最快路径）。
 *
 * 写入失败且可能是批次过大 / 单项数据问题时，按 100 → 10 → 1 自动降级；
 * 读取类 GET 按 100 个 UID 分片，避免 URL / 请求行过长（431 / 414）。
 * 仍有无法处理的请求时返回 false，由调用方回退到分片流水线；
 * 已成功创建的账号会记入状态，回退时不会重复创建。
 */
import axios from 'axios'
import { addOrgMembers, removeOrgMembers } from '../../api/organizations'
import { createPartyProfiles, updatePartyProfiles } from '../../api/partyProfiles'
import { saveProfileDetails } from '../../api/profileDetails'
import { batchAssignUserRoles } from '../../api/rbac'
import type { ProfileDetailCreateRequest } from '../../api/types/profileDetails'
import type { UserRolesBatchItem } from '../../api/types/rbac'
import type { UserBatchUpdate } from '../../api/types/users'
import { batchUpdateUsers, createUsers, queryUsers } from '../../api/users'
import { BULK_IMPORT_SKIP_READS } from '../../config/bulkMembers'
import type { ParsedMember } from '../bulkMemberCheck'
import { sendInTiers } from './batching'
import {
  collectOrgChanges,
  collectPartyChanges,
  toCreateRequest,
  toProfileExtrasRequest,
  toUserUpdateRequest,
} from './payloads'
import { readPartyProfiles, readUserOrganizations, readUserRoles } from './reads'
import { EXISTING_LOOKUP_BATCH_SIZE, isAbortError, runRequest } from './telemetry'
import type { ImportState } from './types'

/**
 * 一次性全量导入：每个阶段先按最大 1000 条发批量请求，失败后按 100 → 10 → 1 降级。
 * 仍有请求失败时返回 false，由调用方回退到分片流水线；已成功创建的账号会记入状态，回退时不会重复创建。
 * 取消时抛异常，由外层统一收尾。
 * @param members 全部成员（必填）
 * @param shared 导入状态（必填，读取结果会写入其中）
 * @returns Promise<boolean> 是否全量一次导入成功
 */
export async function trySinglePass(
  members: ParsedMember[],
  shared: ImportState,
): Promise<boolean> {
  const {
    state,
    existingUids,
    existingRoles,
    orgByUid,
    partyProfileUids,
    createdRows,
    completedRows,
  } = shared
  // 本次导入之前的存量账号（新建账号在下面的创建请求成功后才并入 existingUids）
  const preExistingUids = new Set(existingUids)

  // 1) 创建全部新账号：先 1000 条一批，失败后自动降级
  const toCreate = members.filter((member) => !preExistingUids.has(member.uid))
  if (toCreate.length > 0) {
    const createResult = await sendInTiers({
      state,
      meta: {
        phaseKey: 'bulkMembers.requestLog.phaseCreateAccount',
        method: 'POST',
        path: '/users',
        count: 0,
      },
      payloads: toCreate.map(toCreateRequest),
      batch: (payloads) => createUsers(payloads, state.signal),
      onItemSuccess: (_payload, index) => {
        const member = toCreate[index]
        createdRows.add(member.row)
        existingUids.add(member.uid)
      },
    })

    if (createResult.errors.size > 0) {
      let needsFallback = false
      for (const [index, error] of createResult.errors) {
        // 并发 / 重复导入时，预检查可能漏掉别的请求刚创建的账号：
        // 409（users.id 唯一键冲突）说明该 UID 已存在，按「更新」继续，而不是失败。
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          existingUids.add(toCreate[index].uid)
          // 该账号本来就在系统里，后续同步任职 / 档案 / 姓名时要按「已存在」处理
          preExistingUids.add(toCreate[index].uid)
        } else {
          needsFallback = true
        }
      }
      if (needsFallback) {
        // 创建请求可能已在服务端生效（例如网关超时），先核对一次，避免回退时把账号再建一遍
        // 临时测试开关：existingUsers = true 时跳过该核对，回退后由 409 兜底识别已存在账号
        if (!BULK_IMPORT_SKIP_READS.existingUsers) {
          const createUids = toCreate.map((member) => member.uid)
          for (let start = 0; start < createUids.length; start += EXISTING_LOOKUP_BATCH_SIZE) {
            const batch = createUids.slice(start, start + EXISTING_LOOKUP_BATCH_SIZE)
            state.total += 1
            try {
              const res = await runRequest(
                state,
                {
                  phaseKey: 'bulkMembers.requestLog.phaseCheckExisting',
                  method: 'GET',
                  path: '/users',
                  count: batch.length,
                },
                () => queryUsers({ page: 1, page_size: batch.length, ids: batch.join(',') }, true),
              )
              for (const item of res.data) existingUids.add(item.uid)
            } catch (lookupError) {
              if (isAbortError(lookupError)) throw lookupError
              break
            }
          }
        }
        return false
      }
    }
  }

  // 2) 读取所有账号已有角色（按 100 个 UID 分片；与表格里的角色合并，避免冲掉默认角色）
  const roleUids = Array.from(
    new Set(
      members.filter((member) => member.roleIds.length > 0).map((member) => member.uid),
    ),
  )
  if (!BULK_IMPORT_SKIP_READS.roles && roleUids.length > 0) {
    try {
      const roleList = await readUserRoles(state, roleUids)
      for (const item of roleList) {
        const list = existingRoles.get(item.uid) ?? []
        list.push(item.id)
        existingRoles.set(item.uid, list)
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      return false
    }
  }

  // 3) 读取已有账号的组织任职（按 100 个 UID 分片）
  const orgLookupUids = Array.from(
    new Set(
      members
        .filter(
          (member) => preExistingUids.has(member.uid) && member.orgIdentities.length > 0,
        )
        .map((member) => member.uid),
    ),
  )
  if (!BULK_IMPORT_SKIP_READS.organizations && orgLookupUids.length > 0) {
    try {
      const relations = await readUserOrganizations(state, orgLookupUids)
      for (const rel of relations) {
        const list = orgByUid.get(rel.user_id) ?? []
        // 全量导入失败回退后可能重复查询，按任职 id 去重，避免重复发删除请求
        if (!list.some((item) => item.id === rel.id)) list.push(rel)
        orgByUid.set(rel.user_id, list)
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      return false
    }
  }

  // 4) 判断已有账号是否已建党员档案（按 100 个 UID 分片）
  const partyLookupUids = Array.from(
    new Set(
      members
        .filter(
          (member) =>
            preExistingUids.has(member.uid) && (member.partyNo || member.joinTime),
        )
        .map((member) => member.uid),
    ),
  )
  if (!BULK_IMPORT_SKIP_READS.partyProfiles && partyLookupUids.length > 0) {
    try {
      const profiles = await readPartyProfiles(state, partyLookupUids)
      for (const profile of profiles) partyProfileUids.add(profile.user_id)
    } catch (err) {
      if (isAbortError(err)) throw err
      return false
    }
  }

  // 5) 更新全部用户资料
  const userUpdatePayloads: UserBatchUpdate[] = []
  for (const member of members) {
    const body = toUserUpdateRequest(member, preExistingUids.has(member.uid))
    if (!body) continue
    userUpdatePayloads.push({ user_id: member.uid, ...body })
  }
  if (userUpdatePayloads.length > 0) {
    const { errors } = await sendInTiers({
      state,
      meta: {
        phaseKey: 'bulkMembers.requestLog.phaseUserUpdate',
        method: 'PATCH',
        path: '/users',
        count: 0,
      },
      payloads: userUpdatePayloads,
      batch: (payloads) => batchUpdateUsers(payloads, state.signal),
    })
    if (errors.size > 0) return false
  }

  // 6) 同步已有账号的组织任职
  const orgChanges = collectOrgChanges(
    members.filter((member) => preExistingUids.has(member.uid)),
    orgByUid,
  )
  if (orgChanges.removals.length > 0) {
    const { errors } = await sendInTiers({
      state,
      meta: {
        phaseKey: 'bulkMembers.requestLog.phaseOrgRemove',
        method: 'DELETE',
        path: '/organization-members',
        count: 0,
      },
      payloads: orgChanges.removals,
      batch: (payloads) => removeOrgMembers(payloads, state.signal),
    })
    if (errors.size > 0) return false
  }
  if (orgChanges.additions.length > 0) {
    const { errors } = await sendInTiers({
      state,
      meta: {
        phaseKey: 'bulkMembers.requestLog.phaseOrgAdd',
        method: 'POST',
        path: '/organization-members',
        count: 0,
      },
      payloads: orgChanges.additions,
      batch: (payloads) => addOrgMembers(payloads, state.signal),
    })
    if (errors.size > 0) return false
  }

  // 7) 写入党员档案（新建 / 更新分两个阶段）
  const partyChanges = collectPartyChanges(members, partyProfileUids)
  if (partyChanges.createPayloads.length > 0) {
    const { errors } = await sendInTiers({
      state,
      meta: {
        phaseKey: 'bulkMembers.requestLog.phasePartyCreate',
        method: 'POST',
        path: '/party/profiles',
        count: 0,
      },
      payloads: partyChanges.createPayloads,
      batch: (payloads) => createPartyProfiles(payloads, state.signal),
    })
    if (errors.size > 0) return false
  }
  if (partyChanges.updatePayloads.length > 0) {
    const { errors } = await sendInTiers({
      state,
      meta: {
        phaseKey: 'bulkMembers.requestLog.phasePartyUpdate',
        method: 'PATCH',
        path: '/party/profiles',
        count: 0,
      },
      payloads: partyChanges.updatePayloads,
      batch: (payloads) => updatePartyProfiles(payloads, state.signal),
    })
    if (errors.size > 0) return false
  }

  // 8) 写入个人档案信息
  const profilePayloads: ProfileDetailCreateRequest[] = []
  for (const member of members) {
    const body = toProfileExtrasRequest(member)
    if (body) profilePayloads.push(body)
  }
  if (profilePayloads.length > 0) {
    const { errors } = await sendInTiers({
      state,
      meta: {
        phaseKey: 'bulkMembers.requestLog.phaseProfile',
        method: 'PUT',
        path: '/profile-details',
        count: 0,
      },
      payloads: profilePayloads,
      batch: (payloads) => saveProfileDetails(payloads, state.signal),
    })
    if (errors.size > 0) return false
  }

  // 9) 分配系统角色
  const rolePayloads: UserRolesBatchItem[] = []
  for (const member of members) {
    if (member.roleIds.length === 0) continue
    rolePayloads.push({
      user_id: member.uid,
      role_ids: Array.from(
        new Set([...(existingRoles.get(member.uid) ?? []), ...member.roleIds]),
      ),
    })
  }
  if (rolePayloads.length > 0) {
    const { errors } = await sendInTiers({
      state,
      meta: {
        phaseKey: 'bulkMembers.requestLog.phaseRoleWrite',
        method: 'POST',
        path: '/rbac/users',
        count: 0,
      },
      payloads: rolePayloads,
      batch: (payloads) => batchAssignUserRoles(payloads, state.signal),
    })
    if (errors.size > 0) return false
  }

  for (const member of members) completedRows.add(member.row)
  return true
}
