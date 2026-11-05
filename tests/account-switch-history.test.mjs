import assert from 'node:assert/strict'
import test from 'node:test'

const storage = new Map()
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
}
const { useAccountSwitchHistory } = await import('../src/store/accountSwitchHistory.ts')

test('切换历史按管理员隔离，重复账户置顶，最多保留 10 个且不存凭据', () => {
  const history = useAccountSwitchHistory.getState()
  history.clear('admin-a')
  history.clear('admin-b')
  for (let uid = 1; uid <= 12; uid += 1) {
    history.remember('admin-a', { uid, username: `user-${uid}`, name: null })
  }
  history.remember('admin-b', { uid: 90, username: 'other', name: '其他用户' })
  history.remember('admin-a', { uid: 5, username: 'renamed', name: '测试用户', token: 'must-not-persist' })
  const accounts = useAccountSwitchHistory.getState().accounts
  assert.equal(accounts['admin-a'].length, 10)
  assert.deepEqual(accounts['admin-a'][0], { uid: 5, username: 'renamed', name: '测试用户' })
  assert.equal(accounts['admin-a'].filter((item) => item.uid === 5).length, 1)
  assert.equal(accounts['admin-b'][0].uid, 90)
  assert.ok(!JSON.stringify([...storage.values()]).includes('must-not-persist'))
  history.clear('admin-a')
  assert.equal(useAccountSwitchHistory.getState().accounts['admin-a'], undefined)
  assert.equal(useAccountSwitchHistory.getState().accounts['admin-b'].length, 1)
  history.clear('admin-b')
})

test('会话存储可恢复历史记录，清空记录后不会重新出现', async () => {
  const history = useAccountSwitchHistory.getState()
  history.remember('restore-test', { uid: 20, username: 'member', name: '成员' })
  const saved = storage.get('campus-account-switch-history')
  history.clear('restore-test')
  storage.set('campus-account-switch-history', saved)
  await useAccountSwitchHistory.persist.rehydrate()
  assert.equal(useAccountSwitchHistory.getState().accounts['restore-test'][0].uid, 20)
  history.clear('restore-test')
  await useAccountSwitchHistory.persist.rehydrate()
  assert.equal(useAccountSwitchHistory.getState().accounts['restore-test'], undefined)
})
