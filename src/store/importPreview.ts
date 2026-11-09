/** 模拟导入只保存在内存，切换身份立即清除，绝不持久化密码。 */
import { create } from 'zustand'
import { useAuthStore } from './auth'
import type { ParsedMember } from '../utils/bulkMemberCheck'
import type { OrganizationInfo } from '../api/types/organizations'
import type { RoleInfo } from '../api/types/rbac'
import type { PositionDetail } from '../api/types/positions'

export interface ImportPreview {
  owner: string
  fileName: string
  returnTo: string
  members: Omit<ParsedMember, 'password'>[]
  existingUids: Set<number>
  organizations: OrganizationInfo[]
  roles: RoleInfo[]
  positions: PositionDetail[]
  startedAt: string
}
interface PreviewState {
  preview: ImportPreview | null
  revision: number
  start: (input: Omit<ImportPreview, 'owner' | 'startedAt' | 'members'> & { members: ParsedMember[] }) => void
  clear: () => void
}
export const useImportPreview = create<PreviewState>((set) => ({
  preview: null, revision: 0,
  start: (input) => {
    const owner = useAuthStore.getState().token
    if (!owner) throw new Error('No active session')
    const { members, ...rest } = input
    const sanitized = members.map(({ password: _password, ...member }) => member)
    set((state) => ({ revision: state.revision + 1, preview: {
      ...structuredClone(rest), members: structuredClone(sanitized), owner, startedAt: new Date().toISOString(),
    } }))
  },
  clear: () => set((state) => ({ preview: null, revision: state.revision + 1 })),
}))
export function activeImportPreview() {
  const preview = useImportPreview.getState().preview
  return preview?.owner === useAuthStore.getState().token ? preview : null
}
useAuthStore.subscribe((state, previous) => {
  if (state.token !== previous.token) useImportPreview.getState().clear()
})
