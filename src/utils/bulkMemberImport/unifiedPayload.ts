import type { PartyProfileImportItem } from '../../api/partyProfileImports'
import type { ParsedMember } from '../bulkMemberCheck'
import { toProfileExtrasRequest, toUserUpdateRequest } from './payloads'

export function toImportItem(member: ParsedMember): PartyProfileImportItem {
  const gender = member.gender === '男' ? 'male' : member.gender === '女' ? 'female' : undefined
  return {
    user_id: member.uid,
    user: { uid: member.uid, username: member.username, name: member.name || undefined, gender },
    changes: toUserUpdateRequest(member, true) ?? undefined,
    profile: toProfileExtrasRequest(member) ?? undefined,
    party: {
      ...(member.partyNo ? { party_no: Number(member.partyNo) } : {}),
      ...(member.joinTime ? { join_time: member.joinTime } : {}),
    },
    ...(member.roleIds.length ? { role_ids: member.roleIds } : {}),
    members: member.orgIdentities.flatMap((org) => org.positions.map((position) => ({
      organization_id: org.orgId, user_id: member.uid, position, workplace: '',
    }))),
  }
}
