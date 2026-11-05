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
  ui.setMemberSearchState('admin_m3', { query: 'previous account', matches: [{ uid: 100 }] })
}
function assertEmpty() {
  const ui = useUiStateStore.getState()
  for (const key of ['selectedOrgIds', 'collapsedOrgTrees', 'expandedOrgTreeKeys', 'memberPages', 'memberSearchStates']) {
    assert.deepEqual(ui[key], {}, key)
  }
}

test('登录、代登录、恢复身份、退出均同步清空页面状态；普通账号更新保留状态', () => {
  const auth = useAuthStore.getState()
  auth.setAuth({ token: 'admin', username: 'admin', lastLoginAt: '2026-01-01' })
  remember()
  auth.finishPasswordChange()
  assert.equal(useUiStateStore.getState().memberPages.admin_m3, 7)
  auth.impersonate({ token: 'member', username: 'member', lastLoginAt: null })
  assertEmpty()
  remember()
  auth.restoreAuth()
  assert.equal(useAuthStore.getState().token, 'admin')
  assertEmpty()
  remember()
  auth.clearAuth()
  assertEmpty()
  remember()
  auth.setAuth({ token: 'other', username: 'other', lastLoginAt: null })
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
