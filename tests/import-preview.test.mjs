import assert from 'node:assert/strict'
import test from 'node:test'
import { http } from '../src/api/http.ts'
import { cachedGet, invalidate } from '../src/api/cache.ts'
import { useAuthStore } from '../src/store/auth.ts'
import { useImportPreview, activeImportPreview } from '../src/store/importPreview.ts'
import { readPreviewData } from '../src/api/previewDataService.ts'
import { getMyRoles, getMyPortalPositions } from '../src/api/auth.ts'

const member = (uid, name = '导入人员') => ({ row: uid, uid, username: String(uid), name, gender: '男',
  password: 'must-not-retain', orgIdentities: [{ orgId: 10, positions: ['member'] }], roleIds: [2],
  partyNo: '123', joinTime: '2020-01-01', phone: '13800000000', email: '', birthday: '', ethnic: '汉族',
  nativePlace: '', householdLocation: '', householdType: '',
})
const page = (data, current = 1, pages = 1) => ({ data, total: data.length, page: current, total_pages: pages, page_size: 100 })
const role = { id: 2, code: 'admin', name: '管理', description: '', created_at: '', updated_at: '' }
function start(members = [member(1), member(3)], existing = [1]) {
  useAuthStore.getState().setAuth({ token: 'preview-test', username: 'viewer', lastLoginAt: '2020' })
  useImportPreview.getState().start({ members, existingUids: new Set(existing), fileName: 'test.xlsx',
    returnTo: '/portal/branch/branch_m5', organizations: [{ id: 10, name: '支部' }], roles: [role], positions: [] })
}
async function isolated(action) {
  const adapter = http.defaults.adapter
  try { await action() } finally {
    useImportPreview.getState().clear()
    useAuthStore.getState().clearAuth()
    http.defaults.adapter = adapter
    invalidate()
  }
}

test('统一读取层先合并再筛选分页，按 UID 更新且不重复，并保留后端记录', async () => isolated(async () => {
  start()
  const load = async (_url, params) => {
    assert.equal(params.keyword, undefined)
    return page([{ uid: 1, name: '旧姓名' }, { uid: 2, name: '真实人员' }])
  }
  const first = await readPreviewData('/users', { page: 1, page_size: 2 }, load)
  const second = await readPreviewData('/users', { page: 2, page_size: 2 }, load)
  assert.equal(first.total, 3)
  assert.equal(first.total_pages, 2)
  assert.deepEqual([...first.data, ...second.data].map((row) => row.uid), [1, 2, 3])
  assert.equal(first.data[0].name, '导入人员')
  const search = await readPreviewData('/users', { keyword: '导入' }, load)
  assert.equal(search.total, 2)
  assert.equal(JSON.stringify(activeImportPreview()).includes('must-not-retain'), false)
}))

test('人员详情新增不请求不存在的用户，已有用户合并并保留未填字段', async () => isolated(async () => {
  start()
  const added = await readPreviewData('/users/3', {}, async () => { throw new Error('must not call') })
  assert.equal(added.phone, '13800000000')
  assert.equal(added.id, 3)
  const existing = await readPreviewData('/users/1', {}, async () => ({ id: 1, email: 'old@test.com', name: '旧名' }))
  assert.equal(existing.email, 'old@test.com')
  assert.equal(existing.name, '导入人员')
}))

test('组织成员合并所有后端分页、去重任职、重新分页及统计', async () => isolated(async () => {
  start()
  const load = async (_url, params) => params.page === 1
    ? page([{ id: 1, user_id: 1, position: 'member' }], 1, 2)
    : page([{ id: 2, user_id: 2, position: 'member' }], 2, 2)
  const result = await readPreviewData('/organizations/10/members', { page: 2, page_size: 2 }, load)
  assert.equal(result.total, 3)
  assert.equal(result.data[0].user_id, 3)
  const memberships = await readPreviewData('/organization-members', { uids: '1,3' }, async () => [
    { id: 1, organization_id: 10, user_id: 1, position: 'member' },
    { id: 2, organization_id: 11, user_id: 1, position: 'old' },
  ])
  assert.equal(memberships.length, 3)
  assert.equal(memberships.find((row) => row.id === 1).position, 'member')
}))

test('角色覆盖、党员及个人档案合并，未填资料保留原值', async () => isolated(async () => {
  start()
  const roles = await readPreviewData('/rbac/users/roles', { uids: '1,3' }, async () => [{ uid: 1, id: 99 }])
  assert.deepEqual(roles.map((item) => [item.uid, item.id]), [[1, 2], [3, 2]])
  const party = await readPreviewData('/party/profiles', { uids: '3' }, async () => [])
  assert.equal(party[0].party_no, 123)
  const profiles = await readPreviewData('/profile-details', { user_id: 1 }, async () => page([
    { id: 100, user_id: 1, ethnic: '旧值', native_place: '保留籍贯' },
  ]))
  assert.equal(profiles.data[0].ethnic, '汉族')
  assert.equal(profiles.data[0].native_place, '保留籍贯')
  assert.equal(profiles.data[0].id, 100)
}))

test('模拟数据不写入真实缓存，退出后同一请求恢复真实数据', async () => isolated(async () => {
  start()
  let calls = 0
  http.defaults.adapter = async (config) => {
    calls++
    return { config, status: 200, statusText: 'OK', headers: {}, data: page([{ uid: 1, name: '真实名字' }]) }
  }
  const preview = await cachedGet('/users', { page: 1, page_size: 100 })
  assert.equal(preview.total, 2)
  useImportPreview.getState().clear()
  const real = await cachedGet('/users', { page: 1, page_size: 100 })
  assert.equal(real.total, 1)
  assert.equal(real.data[0].name, '真实名字')
  assert.equal(calls, 1)
}))

test('预览时拦截真实写入请求，但允许只读统计请求', async () => isolated(async () => {
  start()
  let calls = 0
  http.defaults.adapter = async (config) => {
    calls++
    return { config, status: 200, statusText: 'OK', headers: {}, data: [] }
  }
  await assert.rejects(http.post('/party-profile-imports', []), (error) => error.code === 'ERR_PREVIEW_READ_ONLY')
  await assert.rejects(http.delete('/users/1'), (error) => error.code === 'ERR_PREVIEW_READ_ONLY')
  assert.equal(calls, 0)
  await http.post('/organizations/member-counts', [])
  assert.equal(calls, 1)
}))

test('鉴权读取始终采用真实角色与任职，不因模拟导入提高权限', async () => isolated(async () => {
  start([member(1)], [1])
  http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data:
    config.url === '/credentials/me' ? { uid: 1 } : [] })
  assert.deepEqual(await getMyRoles(), [])
  assert.deepEqual(await getMyPortalPositions(), [])
}))

test('切换账号清空模拟，会话变化后旧在途合并结果失效', async () => isolated(async () => {
  start()
  let resolve
  const pending = readPreviewData('/users', {}, () => new Promise((done) => { resolve = done }))
  useAuthStore.getState().setAuth({ token: 'other-account', username: 'other', lastLoginAt: '2020' })
  assert.equal(activeImportPreview(), null)
  resolve(page([]))
  await assert.rejects(pending, (error) => error.code === 'ERR_CANCELED')
}))
