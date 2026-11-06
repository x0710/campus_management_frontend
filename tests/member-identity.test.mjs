import assert from 'node:assert/strict'
import test from 'node:test'
import { AxiosError } from 'axios'
import { queryMemberIdentity } from '../src/api/memberIdentity.ts'
import { http } from '../src/api/http.ts'
import { invalidate } from '../src/api/cache.ts'

const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} })
const role = { uid: 42, id: 5, code: 'party_member', name: '党组织成员' }
const memberships = [
  { id: 1, user_id: 42, organization_id: 7, organization_name: '组织甲', position: 'party_committee', workplace: '甲' },
  { id: 2, user_id: 42, organization_id: 8, organization_name: '组织乙', position: 'party_committee', workplace: '乙' },
]
const position = { uid: 42, code: 'party_committee', name: '党委委员', organization_id: 2,
  member_organization_id: 7, usage_scope: 'self_and_descendants', description: '职位说明' }

async function withAdapter(run, failure) {
  const previous = http.defaults.adapter
  const calls = []
  invalidate()
  http.defaults.adapter = async (config) => {
    calls.push({ url: config.url, params: config.params })
    if (config.url === failure) throw new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined,
      { config, data: '权限不足', status: 403, statusText: 'Forbidden', headers: {} })
    if (config.url === '/rbac/users/roles') return response(config, [role, { ...role, uid: 99 }])
    if (config.url === '/organization-members') return response(config, memberships)
    if (config.url === '/user-positions') return response(config, [position, { ...position, uid: 99, member_organization_id: 8 }])
    throw new Error(`Unexpected management endpoint: ${config.url}`)
  }
  try { await run(calls) } finally { http.defaults.adapter = previous; invalidate() }
}

test('成员详情直接读取用户角色与职位，并按实际任职组织关联继承职位', async () => {
  await withAdapter(async (calls) => {
    const identity = await queryMemberIdentity(42)
    assert.deepEqual(identity.roles, [role])
    assert.equal(identity.organizations[0].positionDetail.name, '党委委员')
    assert.equal(identity.organizations[0].positionDetail.organization_id, 2)
    assert.equal(identity.organizations[1].positionDetail, undefined)
    assert.deepEqual(identity.errors, {})
    assert.deepEqual(calls.map((call) => call.url).sort(), ['/organization-members', '/rbac/users/roles', '/user-positions'])
    assert.ok(calls.every((call) => call.params.uids === '42'))
  })
})

test('角色查询失败独立保留错误，组织与职位仍可展示', async () => {
  await withAdapter(async () => {
    const identity = await queryMemberIdentity(42)
    assert.deepEqual(identity.roles, [])
    assert.equal(identity.errors.roles.response.status, 403)
    assert.equal(identity.organizations.length, 2)
    assert.equal(identity.organizations[0].positionDetail.code, 'party_committee')
    assert.equal(identity.errors.positions, undefined)
    assert.equal(identity.errors.organizations, undefined)
  }, '/rbac/users/roles')
})

test('不展示角色卡片时不查询角色；职位失败仍保留任职编码和工作地点', async () => {
  await withAdapter(async (calls) => {
    const identity = await queryMemberIdentity(42, { includeRoles: false, force: true })
    assert.ok(!calls.some((call) => call.url.startsWith('/rbac')))
    assert.equal(identity.errors.positions.response.status, 403)
    assert.equal(identity.organizations[0].position, 'party_committee')
    assert.equal(identity.organizations[0].workplace, '甲')
    assert.equal(identity.organizations[0].positionDetail, undefined)
    assert.equal(identity.errors.roles, undefined)
  }, '/user-positions')
})
