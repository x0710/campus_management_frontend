import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface RecentAccount {
  uid: number
  username: string
  name: string | null
}

interface HistoryState {
  accounts: Record<string, RecentAccount[]>
  remember: (owner: string, account: RecentAccount) => void
  clear: (owner: string) => void
}

/** 按管理员账号隔离，最多保留最近 10 项；仅保存展示信息，不保存凭据。 */
export const useAccountSwitchHistory = create<HistoryState>()(persist((set) => ({
  accounts: {},
  remember: (owner, account) => set((state) => ({
    accounts: {
      ...state.accounts,
      [owner]: [
        { uid: account.uid, username: account.username, name: account.name },
        ...(state.accounts[owner] ?? []).filter((item) => item.uid !== account.uid),
      ].slice(0, 10),
    },
  })),
  clear: (owner) => set((state) => {
    const accounts = { ...state.accounts }
    delete accounts[owner]
    return { accounts }
  }),
}), {
  name: 'campus-account-switch-history',
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({ accounts: state.accounts }),
}))
