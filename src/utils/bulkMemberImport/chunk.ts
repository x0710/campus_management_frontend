/**
 * 分片流水线：先批量建号，随后立刻把这一片里所有账号的全部信息写完。
 *
 * 任一步失败只标记对应行，不中断整片；取消时抛出异常由外层统一收尾。
 * 组织任职按导入的「组织:身份」同步：缺少的添加，导入里没有的移除；仅比对组织与身份，不改动原有工作地点。
 */
import axios from 'axios'
import { extractErrorReason } from '../../api/common'
import {
  addOrgMember,
  addOrgMembers,
  removeOrgMember,
  removeOrgMembers,
} from '../../api/organizations'
import {
  createPartyProfile,
  createPartyProfiles,
  updatePartyProfile,
  updatePartyProfiles,
} from '../../api/partyProfiles'
import { saveProfileDetail, saveProfileDetails } from '../../api/profileDetails'
import { assignUserRoles, batchAssignUserRoles } from '../../api/rbac'
import type { ProfileDetailCreateRequest } from '../../api/types/profileDetails'
import type { UserRolesBatchItem } from '../../api/types/rbac'
import type { UserBatchUpdate } from '../../api/types/users'
import { batchUpdateUsers, createUsers, updateUser } from '../../api/users'
import { BULK_IMPORT_SKIP_READS } from '../../config/bulkMembers'
import type { ParsedMember } from '../bulkMemberCheck'
import {
  addWarning,
  canRetryPerItem,
  collectOrgChanges,
  collectPartyChanges,
  toCreateRequest,
  toFailedOutcome,
  toProfileExtrasRequest,
  toUserUpdateRequest,
} from './payloads'
import { readPartyProfiles, readUserOrganizations, readUserRoles } from './reads'
import { submitBatch } from './submitBatch'
import { isAbortError, runRequest } from './telemetry'
import type { ImportState } from './types'

/**
 * 处理一个分片：先批量建号，随后立刻把这一片里所有账号的全部信息写完。
 * 任一步失败只标记对应行，不中断整片；取消时抛出异常由外层统一收尾。
 * @param chunk 一个分片的成员（必填）
 * @param shared 跨分片共享状态（必填）
 */
export async function processChunk(
  chunk: ParsedMember[],
  shared: ImportState,
): Promise<void> {
  const {
    state,
    existingUids,
    existingRoles,
    orgByUid,
    partyProfileUids,
    warningsByRow,
    failed,
    createdRows,
    completedRows,
  } = shared

  // 1) 批量创建本片里不存在的账号
  const toCreate = chunk.filter((member) => !existingUids.has(member.uid))
  if (toCreate.length > 0) {
    try {
      await runRequest(
        state,
        {
          phaseKey: 'bulkMembers.requestLog.phaseCreateAccount',
          method: 'POST',
          path: '/users',
          count: toCreate.length,
        },
        () => createUsers(toCreate.map(toCreateRequest), state.signal),
      )
      for (const member of toCreate) createdRows.add(member.row)
    } catch (err) {
      if (isAbortError(err)) throw err
      if (!canRetryPerItem(err)) {
        // 权限 / 服务端异常不是某一行的问题，直接标记失败，避免再打 N 次请求
        const message = extractErrorReason(err, state.t)
        for (const member of toCreate) failed.set(member.row, toFailedOutcome(member, message))
      } else {
        // 当前分片已回滚（没有写入任何数据），逐行重试以找出具体是哪一行不合法
        for (const member of toCreate) {
          state.total += 1
          try {
            await runRequest(
              state,
              {
                phaseKey: 'bulkMembers.requestLog.phaseCreateAccount',
                method: 'POST',
                path: '/users',
                count: 1,
              },
              () => createUsers([toCreateRequest(member)], state.signal),
            )
            createdRows.add(member.row)
          } catch (itemError) {
            if (isAbortError(itemError)) throw itemError
            // 并发 / 重复导入时，预检查可能漏掉别的请求刚创建的账号：
            // 409（users.id 唯一键冲突）说明该 UID 已存在，按「更新」继续，而不是失败。
            if (axios.isAxiosError(itemError) && itemError.response?.status === 409) {
              existingUids.add(member.uid)
              continue
            }
            failed.set(member.row, toFailedOutcome(member, extractErrorReason(itemError, state.t)))
          }
        }
      }
    }
  }

  const active = chunk.filter((member) => !failed.has(member.row))
  if (active.length === 0) return

  // 2) 取回本片账号已有角色（用于合并，避免覆盖默认角色）
  const roleUids = active.filter((member) => member.roleIds.length > 0).map((member) => member.uid)
  let roleReadError: string | null = null
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
      roleReadError = extractErrorReason(err, state.t)
    }
  }

  // 3) 取回本片已有账号的组织任职（只有需要同步「组织:身份」的行才查）
  const orgLookupUids = Array.from(
    new Set(
      active
        .filter((member) => existingUids.has(member.uid) && member.orgIdentities.length > 0)
        .map((member) => member.uid),
    ),
  )
  let orgReadError: string | null = null
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
      orgReadError = extractErrorReason(err, state.t)
    }
  }

  // 4) 判断本片已有账号是否已有党员档案（新账号刚创建，必然没有档案）
  const partyLookupUids = Array.from(
    new Set(
      active
        .filter(
          (member) =>
            existingUids.has(member.uid) && (member.partyNo || member.joinTime),
        )
        .map((member) => member.uid),
    ),
  )
  let partyReadError: string | null = null
  if (!BULK_IMPORT_SKIP_READS.partyProfiles && partyLookupUids.length > 0) {
    try {
      const profiles = await readPartyProfiles(state, partyLookupUids)
      for (const profile of profiles) partyProfileUids.add(profile.user_id)
    } catch (err) {
      if (isAbortError(err)) throw err
      partyReadError = extractErrorReason(err, state.t)
    }
  }

  // 5) 更新用户资料：已有账号更新姓名 / 性别，新账号补手机号 / 邮箱 / 生日
  const userUpdateRows: number[] = []
  const userUpdatePayloads: UserBatchUpdate[] = []
  for (const member of active) {
    const body = toUserUpdateRequest(member, existingUids.has(member.uid))
    if (!body) continue
    userUpdateRows.push(member.row)
    userUpdatePayloads.push({ user_id: member.uid, ...body })
  }
  await submitBatch({
    state,
    meta: {
      phaseKey: 'bulkMembers.requestLog.phaseUserUpdate',
      method: 'PATCH',
      path: '/users',
      count: 0,
    },
    rows: userUpdateRows,
    payloads: userUpdatePayloads,
    batch: (payloads) => batchUpdateUsers(payloads, state.signal),
    single: ({ user_id, ...body }) => updateUser(user_id, body, state.signal),
    warningsByRow,
    messageKey: 'bulkMembers.import.contactFailed',
  })

  // 6) 同步已有账号的组织任职：先批量移除多余任职，再批量添加缺少的任职
  const orgSyncMembers: ParsedMember[] = []
  for (const member of active) {
    if (!existingUids.has(member.uid) || member.orgIdentities.length === 0) continue
    if (orgReadError) {
      addWarning(
        warningsByRow,
        member.row,
        state.t('bulkMembers.import.orgFailed', { reason: orgReadError }),
      )
      continue
    }
    orgSyncMembers.push(member)
  }
  const { removalRows, removals, additionRows, additions } = collectOrgChanges(
    orgSyncMembers,
    orgByUid,
  )
  await submitBatch({
    state,
    meta: {
      phaseKey: 'bulkMembers.requestLog.phaseOrgRemove',
      method: 'DELETE',
      path: '/organization-members',
      count: 0,
    },
    rows: removalRows,
    payloads: removals,
    batch: (payloads) => removeOrgMembers(payloads, state.signal),
    single: ({ organization_id, member_id }) =>
      removeOrgMember(organization_id, member_id, state.signal),
    warningsByRow,
    messageKey: 'bulkMembers.import.orgFailed',
  })
  await submitBatch({
    state,
    meta: {
      phaseKey: 'bulkMembers.requestLog.phaseOrgAdd',
      method: 'POST',
      path: '/organization-members',
      count: 0,
    },
    rows: additionRows,
    payloads: additions,
    batch: (payloads) => addOrgMembers(payloads, state.signal),
    single: ({ organization_id, user_id, position, workplace }) =>
      addOrgMember(organization_id, { user_id, position, workplace }, state.signal),
    warningsByRow,
    messageKey: 'bulkMembers.import.orgFailed',
  })

  // 7) 写党员档案：没有档案的创建，已有档案的更新
  const partyMembers: ParsedMember[] = []
  for (const member of active) {
    if (!member.partyNo && !member.joinTime) continue
    if (partyReadError && existingUids.has(member.uid)) {
      addWarning(
        warningsByRow,
        member.row,
        state.t('bulkMembers.import.partyFailed', { reason: partyReadError }),
      )
      continue
    }
    partyMembers.push(member)
  }
  const {
    createRows: partyCreateRows,
    createPayloads: partyCreatePayloads,
    updateRows: partyUpdateRows,
    updatePayloads: partyUpdatePayloads,
  } = collectPartyChanges(partyMembers, partyProfileUids)
  await submitBatch({
    state,
    meta: {
      phaseKey: 'bulkMembers.requestLog.phasePartyCreate',
      method: 'POST',
      path: '/party/profiles',
      count: 0,
    },
    rows: partyCreateRows,
    payloads: partyCreatePayloads,
    batch: (payloads) => createPartyProfiles(payloads, state.signal),
    single: (payload) => createPartyProfile(payload, state.signal),
    warningsByRow,
    messageKey: 'bulkMembers.import.partyFailed',
  })
  await submitBatch({
    state,
    meta: {
      phaseKey: 'bulkMembers.requestLog.phasePartyUpdate',
      method: 'PATCH',
      path: '/party/profiles',
      count: 0,
    },
    rows: partyUpdateRows,
    payloads: partyUpdatePayloads,
    batch: (payloads) => updatePartyProfiles(payloads, state.signal),
    single: async ({ user_id, ...body }) => {
      await updatePartyProfile(user_id, body, state.signal)
    },
    warningsByRow,
    messageKey: 'bulkMembers.import.partyFailed',
  })

  // 8) 保存个人档案信息（PUT 按 user_id upsert，未传字段保留原值）
  const profileRows: number[] = []
  const profilePayloads: ProfileDetailCreateRequest[] = []
  for (const member of active) {
    const body = toProfileExtrasRequest(member)
    if (!body) continue
    profileRows.push(member.row)
    profilePayloads.push(body)
  }
  await submitBatch({
    state,
    meta: {
      phaseKey: 'bulkMembers.requestLog.phaseProfile',
      method: 'PUT',
      path: '/profile-details',
      count: 0,
    },
    rows: profileRows,
    payloads: profilePayloads,
    batch: (payloads) => saveProfileDetails(payloads, state.signal),
    single: (payload) => saveProfileDetail(payload, state.signal),
    warningsByRow,
    messageKey: 'bulkMembers.import.profileFailed',
  })

  // 9) 覆盖角色：导入角色与已有角色取并集，避免把默认基础角色冲掉
  const roleRows: number[] = []
  const rolePayloads: UserRolesBatchItem[] = []
  for (const member of active) {
    if (member.roleIds.length === 0) continue
    if (roleReadError) {
      addWarning(
        warningsByRow,
        member.row,
        state.t('bulkMembers.import.roleFailed', { reason: roleReadError }),
      )
      continue
    }
    roleRows.push(member.row)
    rolePayloads.push({
      user_id: member.uid,
      role_ids: Array.from(
        new Set([...(existingRoles.get(member.uid) ?? []), ...member.roleIds]),
      ),
    })
  }
  await submitBatch({
    state,
    meta: {
      phaseKey: 'bulkMembers.requestLog.phaseRoleWrite',
      method: 'POST',
      path: '/rbac/users',
      count: 0,
    },
    rows: roleRows,
    payloads: rolePayloads,
    batch: (payloads) => batchAssignUserRoles(payloads, state.signal),
    single: ({ user_id, role_ids }) => assignUserRoles(user_id, role_ids, state.signal),
    warningsByRow,
    messageKey: 'bulkMembers.import.roleFailed',
  })

  // 本片全部信息处理完毕
  for (const member of active) completedRows.add(member.row)
}
