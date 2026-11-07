import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyzeMemberRows,
  isPositionUsableInOrganization,
} from '../src/utils/bulkMemberCheck.ts'

const orgs = [
  { id: 1, parent_id: null, code: 'ROOT', name: '学校' },
  { id: 2, parent_id: 1, code: 'PARTY', name: '学院党委' },
  { id: 10, parent_id: 2, code: 'COLLEGE', name: '数理学院党委' },
  { id: 100, parent_id: 10, code: 'BRANCH', name: '学生第一党支部' },
]

const position = (code, organizationId, usageScope) => ({
  code,
  name: code,
  organization_id: organizationId,
  usage_scope: usageScope,
  description: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const positionAtParty = (usageScope) => position('GLOBAL', 2, usageScope)
const positionAtCollege = (usageScope) => position('LOCAL', 10, usageScope)

test('身份在所属组织内始终可用', () => {
  for (const scope of ['self_only', 'self_and_children', 'self_and_descendants']) {
    assert.equal(isPositionUsableInOrganization(positionAtParty(scope), 2, orgs), true)
  }
})

test('self_only 不向任何下级组织开放', () => {
  assert.equal(isPositionUsableInOrganization(positionAtParty('self_only'), 10, orgs), false)
  assert.equal(isPositionUsableInOrganization(positionAtParty('self_only'), 100, orgs), false)
})

test('self_and_children 只向直属下级开放', () => {
  const p = positionAtParty('self_and_children')
  assert.equal(isPositionUsableInOrganization(p, 10, orgs), true)
  assert.equal(isPositionUsableInOrganization(p, 100, orgs), false)
})

test('self_and_descendants 向所有下级开放，下级职位不能向上使用', () => {
  assert.equal(
    isPositionUsableInOrganization(positionAtParty('self_and_descendants'), 100, orgs),
    true,
  )
  assert.equal(isPositionUsableInOrganization(positionAtCollege('self_and_descendants'), 2, orgs), false)
})

test('组织链成环时不会死循环', () => {
  const cyclic = [
    { id: 2, parent_id: 10 },
    { id: 10, parent_id: 2 },
  ]
  assert.equal(isPositionUsableInOrganization(positionAtParty('self_and_descendants'), 99, cyclic), false)
})

test('导入分析会拦截未向目标组织开放的身份', () => {
  const rows = [
    ['登录账号名（工号/学号）', '初始密码'],
    [], // 第 2 行说明（内容不影响解析）
    [], // 示例行
    [],
    ['1000000001', '123456', '张三', '男', '100:GLOBAL', '', '', '', '', '', '', '', '', '', ''],
  ]
  const t = (key, vars) => `${key}${vars ? ` ${JSON.stringify(vars)}` : ''}`
  const blocked = analyzeMemberRows({
    rows,
    startRow: 5,
    orgs,
    positions: [positionAtParty('self_only')],
    roles: [],
    t,
  })
  assert.equal(blocked.members.length, 0)
  assert.equal(blocked.issues.length, 1)
  assert.match(blocked.issues[0].message, /identityNotUsable/)
  assert.match(blocked.issues[0].message, /GLOBAL/)
  assert.match(blocked.issues[0].message, /学生第一党支部/)

  const allowed = analyzeMemberRows({
    rows,
    startRow: 5,
    orgs,
    positions: [positionAtParty('self_and_descendants')],
    roles: [],
    t,
  })
  assert.equal(allowed.issues.length, 0)
  assert.equal(allowed.members.length, 1)
  assert.deepEqual(allowed.members[0].orgIdentities, [{ orgId: 100, positions: ['GLOBAL'] }])
})
