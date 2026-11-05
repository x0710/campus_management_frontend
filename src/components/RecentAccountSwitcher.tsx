import { Button } from 'antd'
import { useAccountSwitchHistory } from '../store/accountSwitchHistory'
import { useAuthStore } from '../store/auth'
import { useAccountSwitch } from '../composables/useAccountSwitch'
import { useT } from '../i18n'

export default function RecentAccountSwitcher() {
  const t = useT()
  const owner = useAuthStore((state) => state.originalAuth?.username ?? state.username)
  const currentUsername = useAuthStore((state) => state.username)
  const accounts = useAccountSwitchHistory((state) => owner ? state.accounts[owner] : undefined)
  const { switchAccount, switchingUid } = useAccountSwitch()

  if (!accounts?.length) return null

  return (
    <section className="recent-accounts" aria-label={t('adminUsers.recentAccounts')}>
      <span className="cell-sub">{t('adminUsers.recentAccounts')}</span>
      {accounts.map((account) => (
        <Button
          key={account.uid}
          size="small"
          title={`${account.name || account.username} · ${account.username} (${account.uid})`}
          disabled={switchingUid !== null || account.username === currentUsername}
          loading={switchingUid === account.uid}
          onClick={() => void switchAccount(account.uid, account.name)}
        >
          <span className="recent-account-name">{account.name || account.username} ({account.uid})</span>
        </Button>
      ))}
      <Button
        type="text"
        size="small"
        disabled={switchingUid !== null}
        onClick={() => { if (owner) useAccountSwitchHistory.getState().clear(owner) }}
      >
        {t('adminUsers.clearSwitchHistory')}
      </Button>
    </section>
  )
}
