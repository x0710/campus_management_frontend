import assert from 'node:assert/strict'
import test from 'node:test'
import { BULK_TEMPLATE_COLUMNS } from '../src/config/bulkMembers.ts'
import { buildMemberTemplateSheets } from '../src/utils/bulkMemberTemplate.ts'
import { analyzeMemberRows } from '../src/utils/bulkMemberCheck.ts'

test('新版样本没有初始密码列，十四列表头、示例与解析字段一致', () => {
  const orgs = [{ id: 10, code: 'BRANCH', name: '支部', parent_id: null }]
  const positions = [{ code: 'member', name: '党员', organization_id: 10, usage_scope: 'self_only' }]
  const { sheets } = buildMemberTemplateSheets({ t: (key) => key, orgs, positions, roles: [], orgNameById: new Map([[10, '支部']]) })
  assert.equal(BULK_TEMPLATE_COLUMNS.length, 14)
  assert.ok(!BULK_TEMPLATE_COLUMNS.some((col) => col.key === 'password'))
  assert.equal(sheets[0].columns.length, 14)
  assert.ok(sheets[0].rows.every((row) => row.length === 14))
  const fields = { username: '1001', name: '张三', gender: '男', orgIdentity: 'BRANCH:member',
    partyNo: '123', joinTime: '2020-01-01', phone: '13800000000', email: 'test@example.com',
    birthday: '2000-01-01', ethnic: '汉族', nativePlace: '籍贯', householdLocation: '所在地', householdType: '城镇' }
  const row = BULK_TEMPLATE_COLUMNS.map((col) => fields[col.key] ?? '')
  const result = analyzeMemberRows({ rows: [sheets[0].columns.map((col) => col.header), ...sheets[0].rows, row],
    startRow: 5, orgs, positions, roles: [], t: (key) => key })
  assert.equal(result.issues.length, 0)
  const member = result.members[0]
  for (const key of ['name', 'gender', 'partyNo', 'joinTime', 'phone', 'email', 'birthday', 'ethnic', 'nativePlace', 'householdLocation', 'householdType']) {
    assert.equal(member[key], fields[key])
  }
  assert.equal(member.password, '')
  assert.deepEqual(member.orgIdentities, [{ orgId: 10, positions: ['member'] }])
})
