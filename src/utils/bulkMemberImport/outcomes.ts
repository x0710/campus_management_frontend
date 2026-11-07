/**
 * 汇总逐行导入结果：账号创建失败沿用创建失败原因，未处理的行走「取消」。
 */
import type { TranslateFn } from '../../i18n'
import type { ParsedMember } from '../bulkMemberCheck'
import type { ImportState, MemberImportOutcome } from './types'

/**
 * 把跨分片共享状态汇总成与 members 顺序一致的逐行结果。
 * @param members 全部成员（必填）
 * @param shared 跨分片共享状态（必填）
 * @param t 翻译函数（必填）
 * @returns MemberImportOutcome[] 逐行结果
 */
export function buildOutcomes(
  members: ParsedMember[],
  shared: ImportState,
  t: TranslateFn,
): MemberImportOutcome[] {
  const outcomes: MemberImportOutcome[] = []
  for (const member of members) {
    const createFailure = shared.failed.get(member.row)
    if (createFailure) {
      outcomes.push(createFailure)
      continue
    }
    const warnings = shared.warningsByRow.get(member.row) ?? []
    const action: MemberImportOutcome['action'] = shared.createdRows.has(member.row)
      ? 'create'
      : shared.existingUids.has(member.uid)
        ? 'update'
        : 'create'
    if (shared.completedRows.has(member.row)) {
      outcomes.push({
        row: member.row,
        name: member.name,
        username: member.username,
        uid: member.uid,
        action,
        status: warnings.length > 0 ? 'partial' : 'success',
        message: warnings.length > 0 ? warnings.join('；') : undefined,
      })
      continue
    }
    if (shared.createdRows.has(member.row)) {
      // 账号已创建，但后续资料 / 任职 / 档案 / 角色还没写完（通常是被取消）
      outcomes.push({
        row: member.row,
        name: member.name,
        username: member.username,
        uid: member.uid,
        action: 'create',
        status: 'partial',
        message: t('bulkMembers.import.cancelledPartial'),
      })
      continue
    }
    if (warnings.length > 0) {
      outcomes.push({
        row: member.row,
        name: member.name,
        username: member.username,
        uid: member.uid,
        action,
        status: 'partial',
        message: warnings.join('；'),
      })
      continue
    }
    outcomes.push({
      row: member.row,
      name: member.name,
      username: member.username,
      uid: member.uid,
      action,
      status: 'cancelled',
      message: t('bulkMembers.import.cancelledRow'),
    })
  }
  return outcomes
}
