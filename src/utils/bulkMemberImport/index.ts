/** 统一综合导入：整批事务提交，不自动拆批或重放写请求。 */
import axios from 'axios'
import { importPartyProfiles } from '../../api/partyProfileImports'
import { extractErrorReason } from '../../api/common'
import type { TranslateFn } from '../../i18n'
import type { ParsedMember } from '../bulkMemberCheck'
import { toImportItem } from './unifiedPayload'
import type { MemberImportOutcome, MemberImportRequestLog } from './types'
export type { MemberImportOutcome, MemberImportRequestLog } from './types'

export async function importMemberRows(params: {
  members: ParsedMember[]
  t: TranslateFn
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  onLog?: (entry: MemberImportRequestLog) => void
}): Promise<MemberImportOutcome[]> {
  const { members, t, signal, onProgress, onLog } = params
  if (!members.length) return []
  const base = (member: ParsedMember): MemberImportOutcome => ({
    row: member.row, name: member.name, username: member.username, uid: member.uid,
    action: 'update', status: 'failed',
  })
  if (signal?.aborted) return members.map((member) => ({ ...base(member), status: 'cancelled' }))
  onProgress?.(0, 1)
  let status: MemberImportRequestLog['status'] = 'success'
  let message: string | undefined
  try {
    const results = await importPartyProfiles(members.map(toImportItem), signal)
    const byUid = new Map(results.map((result) => [result.user_id, result]))
    return members.map((member) => {
      const result = byUid.get(member.uid)
      if (!result) return { ...base(member), message: t('bulkMembers.importUncertain') }
      return {
        ...base(member), action: result.user_created ? 'create' : 'update', status: 'success',
        ...(result.new_password ? { newPassword: result.new_password } : {}),
      }
    })
  } catch (err) {
    status = axios.isCancel(err) ? 'aborted' : 'failed'
    // 取消、超时、网络中断或服务端错误不能证明事务已回滚，不自动重试。
    const uncertain = !axios.isAxiosError(err) || !err.response || err.response.status >= 500
    message = uncertain ? t('bulkMembers.importUncertain') : extractErrorReason(err, t)
    return members.map((member) => ({ ...base(member), message }))
  } finally {
    onLog?.({ seq: 1, at: new Date().toLocaleTimeString(),
      phaseKey: 'bulkMembers.requestLog.phaseUnifiedImport', method: 'POST',
      path: '/party-profile-imports', count: members.length, status, message,
    })
    onProgress?.(1, 1)
  }
}
