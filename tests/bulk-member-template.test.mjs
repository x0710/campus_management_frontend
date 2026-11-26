import assert from 'node:assert/strict'
import test from 'node:test'
import { BULK_TEMPLATE_COLUMNS } from '../src/config/bulkMembers.ts'
import { buildMemberTemplateSheets } from '../src/utils/bulkMemberTemplate.ts'
import { analyzeMemberRows } from '../src/utils/bulkMemberCheck.ts'

import messages from '../src/i18n/messages.ts'
import { toImportItem } from '../src/utils/bulkMemberImport/unifiedPayload.ts'

test('新版样本没有初始密码列，十五列表头、示例与解析字段一致', () => {
  const orgs = [{ id: 10, code: 'BRANCH', name: '支部', parent_id: null }]
  const positions = [{ code: 'member', name: '党员', organization_id: 10, usage_scope: 'self_only' }]
  const { sheets } = buildMemberTemplateSheets({ t: (key) => key.split('.').reduce((value, part) => value[part], messages.zh), orgs, positions, roles: [], orgNameById: new Map([[10, '支部']]) })
  assert.equal(BULK_TEMPLATE_COLUMNS.length, 15)
  assert.deepEqual(BULK_TEMPLATE_COLUMNS.slice(0, 5).map((col) => col.key), ['uid', 'username', 'name', 'orgIdentity', 'roles'])
  assert.equal(BULK_TEMPLATE_COLUMNS.at(-1).key, 'gender')
  assert.ok(!BULK_TEMPLATE_COLUMNS.some((col) => col.key === 'password'))
  assert.equal(sheets[0].columns.length, 15)
  assert.ok(sheets[0].rows.every((row) => row.length === 15))
  assert.deepEqual(sheets[0].rows[1].slice(0, 2), ['2509332233', '2509332233'])
  const fields = { uid: '1001', username: 'Student001A', name: '张三', gender: '男', orgIdentity: 'BRANCH:member', roles: '15',
    partyNo: '123', joinTime: '2020-01-01', phone: '13800000000', email: 'test@example.com',
    birthday: '2000-01-01', ethnic: '汉族', nativePlace: '籍贯', householdLocation: '所在地', householdType: '城镇' }
  const row = BULK_TEMPLATE_COLUMNS.map((col) => fields[col.key] ?? '')
  const params = { startRow: 5, orgs, positions, roles: [{ id: 15 }], t: (key) => key }
  const result = analyzeMemberRows({ ...params, rows: [sheets[0].columns.map((col) => col.header), ...sheets[0].rows, row] })
  const legacyOrder = ['uid', 'username', 'name', 'gender', 'orgIdentity', 'partyNo', 'joinTime', 'phone', 'email', 'birthday', 'roles', 'ethnic', 'nativePlace', 'householdLocation', 'householdType']
  for (const locale of Object.values(messages)) {
    const headers = BULK_TEMPLATE_COLUMNS.map((col) => col.labelKey.split('.').reduce((value, key) => value[key], locale))
    assert.deepEqual(analyzeMemberRows({ ...params, rows: [headers, [], [], [], row] }), result)
    const legacyHeaders = legacyOrder.map((key) => headers[BULK_TEMPLATE_COLUMNS.findIndex((col) => col.key === key)])
    assert.deepEqual(analyzeMemberRows({ ...params, rows: [legacyHeaders, [], [], [], legacyOrder.map((key) => fields[key])] }), result)
  }
  assert.equal(result.issues.length, 0)
  const member = result.members[0]
  for (const key of ['name', 'gender', 'partyNo', 'joinTime', 'phone', 'email', 'birthday', 'ethnic', 'nativePlace', 'householdLocation', 'householdType']) {
    assert.equal(member[key], fields[key])
  }
  const payload = toImportItem(member)
  assert.deepEqual(payload.role_ids, [15])
  assert.equal(payload.user_id, 1001)
  assert.equal(payload.user.uid, 1001)
  assert.equal(payload.user.username, 'Student001A')
  assert.equal(member.password, '')
  assert.deepEqual(member.orgIdentities, [{ orgId: 10, positions: ['member'] }])
})

test('内部ID与登录用户名分别校验，新旧中英文表头均可解析', () => {
  const params = { startRow: 2, orgs: [{ id: 10, code: 'BRANCH' }],
    positions: [{ code: 'member', organization_id: 10 }], roles: [], t: (key) => key }
  const fields = ['张三', '男', '10:member']
  for (const locale of Object.values(messages)) {
    const headers = [locale.bulkMembers.col.uid, locale.bulkMembers.col.username]
    const { issues, members } = analyzeMemberRows({ ...params, rows: [headers,
      ['21', '001A', ...fields], ['21', '002B', ...fields], ['22', '001A', ...fields],
      ['23A', 'valid', ...fields], ['2509332233', '', ...fields], ['25', '2509332233', ...fields],
    ] })
    assert.deepEqual(members.map(({ uid, username }) => [uid, username]), [[21, '001A'], [2509332233, '2509332233']])
    assert.deepEqual(issues.map((issue) => issue.message), [
      'bulkMembers.check.uidDuplicate', 'bulkMembers.check.usernameDuplicate',
      'bulkMembers.check.uidInvalid', 'bulkMembers.check.usernameDuplicate',
    ])
  }
  for (const header of ['登录账号名（工号/学号）', 'Login account (staff/student no.)']) {
    const { members, issues } = analyzeMemberRows({ ...params, rows: [[header], ['21', ...fields]] })
    assert.equal(issues.length, 0)
    assert.deepEqual([members[0].uid, members[0].username, members[0].name], [21, '21', '张三'])
  }
})
