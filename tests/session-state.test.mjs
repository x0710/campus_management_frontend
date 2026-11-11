import assert from 'node:assert/strict'
import { test } from 'node:test'

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
}
globalThis.window = { localStorage: globalThis.localStorage }
const { useAuthStore } = await import('../src/store/auth.ts')
const { useUiStateStore } = await import('../src/store/uiState.ts')

function remember() {
  const ui = useUiStateStore.getState()
  ui.setSelectedOrgId('admin_m3', 12)
  ui.setOrgTreeCollapsed('admin_m3', true)
  ui.setOrgTreeExpanded('admin_m3', [12])
  ui.setMemberPage('admin_m3', 7)
  ui.setMemberDateFilter('admin_m3', { start_date: '2026-11-01' })
  ui.setMemberSearchState('admin_m3', { query: 'previous account', matches: [{ uid: 100 }] })
}
function assertEmpty() {
  const ui = useUiStateStore.getState()
  for (const key of ['selectedOrgIds', 'collapsedOrgTrees', 'expandedOrgTreeKeys', 'memberPages', 'memberSearchStates', 'userLists', 'memberDateFilters']) {
    assert.deepEqual(ui[key], {}, key)
  }
}

test('代登录隔离视图，恢复原账号还原视图；普通登录和退出清空状态', () => {
  const auth = useAuthStore.getState()
  auth.setAuth({ token: 'admin', username: 'admin', lastLoginAt: '2026-01-01' })
  remember()
  auth.finishPasswordChange()
  assert.equal(useUiStateStore.getState().memberPages.admin_m3, 7)
  const originalView = useUiStateStore.getState()
  auth.impersonate({ token: 'member', username: 'member', lastLoginAt: null }, '/portal/admin/admin_m1?filter=all#users')
  assertEmpty()
  remember()
  useUiStateStore.getState().setMemberPage('admin_m3', 99)
  assert.equal(useAuthStore.getState().originalAuth.returnTo, '/portal/admin/admin_m1?filter=all#users')
  auth.restoreAuth()
  assert.equal(useAuthStore.getState().token, 'admin')
  assert.equal(useUiStateStore.getState().memberPages.admin_m3, 7)
  assert.deepEqual(useUiStateStore.getState().memberSearchStates, originalView.memberSearchStates)
  assert.deepEqual(useUiStateStore.getState().memberDateFilters.admin_m3, { start_date: '2026-11-01' })
  remember()
  auth.clearAuth()
  assertEmpty()
  remember()
  auth.setAuth({ token: 'other', username: 'other', lastLoginAt: null })
  assertEmpty()
  auth.clearAuth()
})

test('连续切换目标账号保留最初的返回位置和用户列表筛选', () => {
  const auth = useAuthStore.getState()
  auth.setAuth({ token: 'root', username: 'root', lastLoginAt: '2026-01-01' })
  const list = { page: 4, keyword: '张', uidFilter: '', status: 'active' }
  useUiStateStore.getState().setUserListState('admin:admin_m1', list)
  auth.impersonate({ token: 'first', username: 'first', lastLoginAt: null }, '/portal/admin/admin_m1')
  assertEmpty()
  auth.impersonate({ token: 'second', username: 'second', lastLoginAt: null }, '/portal/party')
  assert.equal(useAuthStore.getState().originalAuth.returnTo, '/portal/admin/admin_m1')
  auth.restoreAuth()
  assert.deepEqual(useUiStateStore.getState().userLists['admin:admin_m1'], list)
  auth.clearAuth()
})

test('代登录退出后丢弃原视图，后续账号不能恢复旧状态', () => {
  const auth = useAuthStore.getState()
  auth.setAuth({ token: 'root', username: 'root', lastLoginAt: '2026-01-01' })
  remember()
  auth.impersonate({ token: 'member', username: 'member', lastLoginAt: null }, '/portal/admin/admin_m1')
  auth.clearAuth()
  auth.setAuth({ token: 'next', username: 'next', lastLoginAt: '2026-01-01' })
  auth.restoreAuth()
  assertEmpty()
  auth.clearAuth()
})

const { cachedGet, cacheSize, invalidate } = await import('../src/api/cache.ts')
const { http } = await import('../src/api/http.ts')
const { getMyRoles } = await import('../src/api/auth.ts')
const { updatePosition } = await import('../src/api/positions.ts')
const { updateRole } = await import('../src/api/rbac.ts')
const { positionNamesResource, myRolesResource } = await import('../src/store/referenceData.ts')
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} })

test('反复展开端切换复用角色和任职缓存，并发打开不重复请求', async () => {
  const { myPortalPositionsResource } = await import('../src/store/referenceData.ts')
  const previousAdapter = http.defaults.adapter
  const urls = []
  http.defaults.adapter = async (config) => {
    urls.push(config.url)
    if (config.url === '/credentials/me') return response(config, { uid: 42 })
    if (config.url === '/rbac/users/roles') return response(config, [{ uid: 42, code: 'admin' }])
    if (config.url === '/organization-members') return response(config, [{ user_id: 42, position: 'party_branch' }])
    throw new Error(`Unexpected endpoint: ${config.url}`)
  }
  try {
    useAuthStore.getState().setAuth({ token: 'portal-cache', username: 'portal-cache', lastLoginAt: null })
    const openSwitcher = () => Promise.all([myRolesResource.load(), myPortalPositionsResource.load()])
    await Promise.all([openSwitcher(), openSwitcher()])
    await openSwitcher()
    await openSwitcher()
    assert.equal(urls.filter((url) => url === '/credentials/me').length, 1)
    assert.equal(urls.filter((url) => url === '/rbac/users/roles').length, 1)
    assert.equal(urls.filter((url) => url === '/organization-members').length, 1)
    assert.deepEqual(myPortalPositionsResource.getSnapshot().data, [{ code: 'party_branch' }])
  } finally {
    http.defaults.adapter = previousAdapter
    useAuthStore.getState().clearAuth()
  }
})

test('真实接口缓存随账号变化清空，并使用新账号凭据重新请求（模拟接口）', async () => {
  const previousAdapter = http.defaults.adapter
  http.defaults.adapter = async (config) => response(config, config.headers.Authorization)
  try {
    useAuthStore.getState().setAuth({ token: 'first', username: 'first', lastLoginAt: null })
    assert.equal(await cachedGet('/session-test'), 'Bearer first')
    assert.equal(cacheSize().resolved, 1)
    useAuthStore.getState().setAuth({ token: 'second', username: 'second', lastLoginAt: null })
    assert.deepEqual(cacheSize(), { resolved: 0, inFlight: 0 })
    assert.equal(await cachedGet('/session-test'), 'Bearer second')
  } finally {
    http.defaults.adapter = previousAdapter
    useAuthStore.getState().clearAuth()
  }
})

test('切换账号后，旧身份查询不能用新凭据继续查旧用户角色（模拟接口）', async () => {
  let resolveMe, signalStarted
  const started = new Promise((resolve) => { signalStarted = resolve })
  const requests = []
  const previousAdapter = http.defaults.adapter
  http.defaults.adapter = (config) => {
    requests.push(config.url)
    signalStarted()
    return new Promise((resolve) => { resolveMe = () => resolve(response(config, { uid: 1 })) })
  }
  try {
    useAuthStore.getState().setAuth({ token: 'first', username: 'first', lastLoginAt: null })
    const old = getMyRoles()
    await started
    useAuthStore.getState().setAuth({ token: 'second', username: 'second', lastLoginAt: null })
    resolveMe()
    await assert.rejects(old, { code: 'ERR_CANCELED' })
    assert.deepEqual(requests, ['/credentials/me'])
  } finally {
    http.defaults.adapter = previousAdapter
    useAuthStore.getState().clearAuth()
  }
})

test('修改职位和角色后，已订阅的名称数据自动刷新（模拟接口）', async () => {
  let positionName = '旧职位', roleName = '旧角色'
  const previousAdapter = http.defaults.adapter
  http.defaults.adapter = async (config) => {
    if (config.method === 'patch') {
      const body = JSON.parse(config.data)
      if (config.url.startsWith('/positions/')) positionName = body.name
      else roleName = body.name
      return response(config, null)
    }
    if (config.url === '/positions') return response(config, { data: [{ code: 'a', name: positionName }], total: 1 })
    if (config.url === '/credentials/me') return response(config, { uid: 1 })
    if (config.url === '/rbac/users/roles') return response(config, [{ uid: 1, id: 1, code: 'super_admin', name: roleName }])
    throw new Error(`Unexpected request: ${config.url}`)
  }
  let unsubscribePositions, unsubscribeRoles
  try {
    useAuthStore.getState().setAuth({ token: 'admin', username: 'admin', lastLoginAt: null })
    unsubscribePositions = positionNamesResource.subscribe(() => {})
    unsubscribeRoles = myRolesResource.subscribe(() => {})
    await Promise.all([positionNamesResource.load(), myRolesResource.load()])
    assert.equal(positionNamesResource.getSnapshot().data.get('a'), '旧职位')
    assert.equal(myRolesResource.getSnapshot().data[0].name, '旧角色')
    await updatePosition('a', { name: '新职位' })
    await positionNamesResource.load()
    assert.equal(positionNamesResource.getSnapshot().data.get('a'), '新职位')
    await updateRole(1, { name: '新角色' })
    await myRolesResource.load()
    assert.equal(myRolesResource.getSnapshot().data[0].name, '新角色')
  } finally {
    unsubscribePositions?.(); unsubscribeRoles?.()
    http.defaults.adapter = previousAdapter
    invalidate()
    useAuthStore.getState().clearAuth()
  }
})

test('按任职编码查询职位名称，重复查询复用缓存（模拟接口）', async () => {
  const { getPosition } = await import('../src/api/positions.ts')
  const previousAdapter = http.defaults.adapter
  const requests = []
  http.defaults.adapter = async (config) => {
    requests.push(config.url)
    if (config.url === '/positions/ZGDY') return response(config, { code: 'ZGDY', name: '中共党员' })
    throw new Error(`Unexpected request: ${config.url}`)
  }
  try {
    useAuthStore.getState().setAuth({ token: 'member', username: 'member', lastLoginAt: null })
    const [first, second] = await Promise.all([getPosition('ZGDY'), getPosition('ZGDY')])
    assert.equal(first.name, '中共党员')
    assert.equal(second.name, '中共党员')
    assert.deepEqual(requests, ['/positions/ZGDY'])
  } finally {
    http.defaults.adapter = previousAdapter
    useAuthStore.getState().clearAuth()
  }
})

test('代登录期间快捷切换使用原管理员凭据，普通请求仍使用目标账号凭据', async () => {
  const { impersonateUser } = await import('../src/api/auth.ts')
  const previousAdapter = http.defaults.adapter
  const seen = []
  http.defaults.adapter = async (config) => {
    seen.push({ url: config.url, authorization: config.headers.Authorization })
    return response(config, { token: 'next-target', user: 'next', last_login_at: null })
  }
  try {
    const auth = useAuthStore.getState()
    auth.setAuth({ token: 'original-admin', username: 'admin', lastLoginAt: '2026-01-01' })
    auth.impersonate({ token: 'target-member', username: 'member', lastLoginAt: null }, '/portal/admin/admin_m1')
    await impersonateUser(99, useAuthStore.getState().originalAuth.token)
    await http.get('/target-account-check')
    assert.deepEqual(seen, [
      { url: '/credentials/99/impersonate', authorization: 'Bearer original-admin' },
      { url: '/target-account-check', authorization: 'Bearer target-member' },
    ])
    assert.equal(useAuthStore.getState().token, 'target-member')
    assert.equal(useAuthStore.getState().originalAuth.returnTo, '/portal/admin/admin_m1')
  } finally {
    http.defaults.adapter = previousAdapter
    useAuthStore.getState().clearAuth()
  }
})

test('门户职位来自本人组织任职，新增任职后共享入口数据失效并刷新', async () => {
  const { getMyPortalPositions } = await import('../src/api/auth.ts')
  const { addOrgMember } = await import('../src/api/organizations.ts')
  const { myPortalPositionsResource } = await import('../src/store/referenceData.ts')
  const previousAdapter = http.defaults.adapter
  const urls = []
  let assigned = false
  http.defaults.adapter = async (config) => {
    urls.push(config.url)
    if (config.url === '/credentials/me') return response(config, { uid: 42 })
    if (config.url === '/organization-members') return response(config, assigned ? [
      { user_id: 42, organization_id: 10, position: 'party_committee' },
      { user_id: 42, organization_id: 11, position: 'party_committee' },
    ] : [])
    if (config.url === '/organizations/10/members' && config.method === 'post') {
      assigned = true
      return response(config, { user_id: 42, position: 'party_committee' })
    }
    throw new Error(`Unexpected endpoint: ${config.url}`)
  }
  try {
    useAuthStore.getState().setAuth({ token: 'position-holder', username: 'member', lastLoginAt: '2026-01-01' })
    await myPortalPositionsResource.load()
    assert.deepEqual(myPortalPositionsResource.getSnapshot().data, [])
    await addOrgMember(10, { user_id: 42, position: 'party_committee', workplace: null })
    await myPortalPositionsResource.load()
    assert.deepEqual(myPortalPositionsResource.getSnapshot().data, [{ code: 'party_committee' }])
    assert.deepEqual(await getMyPortalPositions(), [{ code: 'party_committee' }])
    assert.ok(!urls.some((url) => url.includes('rbac') || url.includes('user-positions')))
    useAuthStore.getState().clearAuth()
    assert.deepEqual(myPortalPositionsResource.getSnapshot().data, [])
  } finally {
    http.defaults.adapter = previousAdapter
    useAuthStore.getState().clearAuth()
  }
})
