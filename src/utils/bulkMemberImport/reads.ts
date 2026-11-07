/**
 * 批量查询的 UID 分片读取。
 *
 * `/rbac/users/roles`、`/organization-members`、`/party/profiles` 都把 UID 拼在
 * `uids=…` 查询串里；数据量大时 URL / 请求行会过长（431 / 414），
 * 因此统一按 BULK_UID_QUERY_BATCH_SIZE 分片，再把结果合并。
 */
import { listUserOrganizationsBatch } from '../../api/organizations'
import { queryPartyProfiles } from '../../api/partyProfiles'
import { queryUserRoles } from '../../api/rbac'
import type { UserOrganization } from '../../api/types/organizations'
import type { PartyProfile } from '../../api/types/partyProfiles'
import type { UserRoleInfo } from '../../api/types/rbac'
import { BULK_UID_QUERY_BATCH_SIZE } from '../../config/bulkMembers'
import { chunkItems } from './batching'
import { runRequest } from './telemetry'
import type { ImportTelemetry } from './types'

/**
 * 按固定大小分批执行一个查询，并合并结果。
 * @param state 进度记录器（必填）
 * @param uids 用户 ID（必填；为空时直接返回空数组）
 * @param meta 请求元信息（必填，count 由分片大小覆盖）
 * @param send 单个分片的查询调用（必填）
 * @returns 合并后的结果
 */
async function readInBatches<T>(
  state: ImportTelemetry,
  uids: number[],
  meta: { phaseKey: string; path: string },
  send: (batch: number[]) => Promise<T[]>,
): Promise<T[]> {
  const batches = chunkItems(uids, BULK_UID_QUERY_BATCH_SIZE)
  if (batches.length > 1) state.total += batches.length - 1
  const result: T[] = []
  for (const batch of batches) {
    const items = await runRequest(
      state,
      {
        phaseKey: meta.phaseKey,
        method: 'GET',
        path: meta.path,
        count: batch.length,
      },
      () => send(batch),
    )
    result.push(...items)
  }
  return result
}

/**
 * 批量读取用户已有角色（按 100 个 UID 分片）。
 * @param state 进度记录器（必填）
 * @param uids 用户 ID（必填）
 * @returns 用户角色列表
 */
export function readUserRoles(
  state: ImportTelemetry,
  uids: number[],
): Promise<UserRoleInfo[]> {
  return readInBatches(
    state,
    uids,
    {
      phaseKey: 'bulkMembers.requestLog.phaseRoleRead',
      path: '/rbac/users/roles',
    },
    (batch) => queryUserRoles(batch, true),
  )
}

/**
 * 批量读取用户已有组织任职（按 100 个 UID 分片）。
 * @param state 进度记录器（必填）
 * @param uids 用户 ID（必填）
 * @returns 组织任职列表
 */
export function readUserOrganizations(
  state: ImportTelemetry,
  uids: number[],
): Promise<UserOrganization[]> {
  return readInBatches(
    state,
    uids,
    {
      phaseKey: 'bulkMembers.requestLog.phaseOrgRead',
      path: '/organization-members',
    },
    (batch) => listUserOrganizationsBatch(batch, true),
  )
}

/**
 * 批量读取用户已有党员档案（按 100 个 UID 分片）。
 * @param state 进度记录器（必填）
 * @param uids 用户 ID（必填）
 * @returns 党员档案列表
 */
export function readPartyProfiles(
  state: ImportTelemetry,
  uids: number[],
): Promise<PartyProfile[]> {
  return readInBatches(
    state,
    uids,
    {
      phaseKey: 'bulkMembers.requestLog.phasePartyRead',
      path: '/party/profiles',
    },
    (batch) => queryPartyProfiles(batch, true),
  )
}
