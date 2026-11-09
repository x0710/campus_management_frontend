import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyzeMemberRows as analyzeMemberRowsCurrent,
  isPositionUsableInOrganization,
} from '../src/utils/bulkMemberCheck.ts'

// 原有用例使用旧版十五列数据，明确提供旧模板表头以验证兼容性。
const analyzeMemberRows = (params) => analyzeMemberRowsCurrent({ ...params, rows: [
  ['登录账号名', '初始密码'], ...params.rows.slice(1),
] })

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

test('门户导入仅允许范围内组织，并保留祖先链校验继承身份', () => {
  const params = {
    rows: [[], [], [], [], ['1000000001', '123456', '张三', '男', '100:GLOBAL']],
    startRow: 5,
    orgs,
    positions: [positionAtParty('self_and_descendants')],
    roles: [],
    t: (key) => key,
  }
  const allowed = analyzeMemberRows({ ...params, allowedOrgIds: new Set([100]) })
  assert.equal(allowed.issues.length, 0)
  assert.equal(allowed.members.length, 1)
  const blocked = analyzeMemberRows({ ...params, allowedOrgIds: new Set([10]) })
  assert.equal(blocked.members.length, 0)
  assert.ok(blocked.issues.some((issue) => issue.message.includes('orgOutOfScope')))
  const empty = analyzeMemberRows({ ...params, allowedOrgIds: new Set() })
  assert.equal(empty.members.length, 0)
})

test('综合导入允许密码为空，由后端随机生成', () => {
  const result = analyzeMemberRows({
    rows: [[], [], [], [], ['1000000001', '', '张三', '男', '100:GLOBAL']],
    startRow: 5, orgs, positions: [positionAtParty('self_and_descendants')],
    roles: [], t: (key) => key,
  })
  assert.equal(result.issues.length, 0)
  assert.equal(result.members.length, 1)
})

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

test('E 列按第一条实际数据统一使用组织 code，并转换为 ID 校验继承身份', () => {
  const result = analyzeMemberRows({
    rows: [[], [], [], [], [],
      ['1000000001', '', '张三', '男', 'BRANCH：GLOBAL'],
      ['1000000002', '', '李四', '女', 'COLLEGE:GLOBAL；BRANCH:GLOBAL'],
    ], startRow: 5, orgs, positions: [positionAtParty('self_and_descendants')],
    roles: [], t: (key) => key,
  })
  assert.equal(result.issues.length, 0)
  assert.deepEqual(result.members.map((m) => m.orgIdentities.map((o) => o.orgId)), [[100], [10, 100]])
})

test('E 列不允许与第一条数据混用 ID 和 code，也不截取数字前缀作为 ID', () => {
  for (const values of [['100:GLOBAL', 'BRANCH:GLOBAL'], ['BRANCH:GLOBAL', '100:GLOBAL'], ['100:GLOBAL', '100XYZ:GLOBAL']]) {
    const result = analyzeMemberRows({
      rows: [[], [], [], [], ...values.map((value, i) => [String(1000000001 + i), '', '张三', '男', value])],
      startRow: 5, orgs, positions: [positionAtParty('self_and_descendants')], roles: [], t: (key) => key,
    })
    assert.equal(result.members.length, 1)
    assert.ok(result.issues.some((issue) => issue.message.includes('orgFormatMismatch')))
  }
})

test('code 模式仍拦截范围外组织和不存在的 code', () => {
  for (const value of ['BRANCH:GLOBAL', 'UNKNOWN:GLOBAL']) {
    const result = analyzeMemberRows({
      rows: [[], [], [], [], ['1000000001', '', '张三', '男', value]], startRow: 5, orgs,
      positions: [positionAtParty('self_and_descendants')], allowedOrgIds: new Set([10]), roles: [], t: (key) => key,
    })
    assert.equal(result.members.length, 0)
    assert.ok(result.issues.length > 0)
  }
})

test('仅匹配 code 的纯数字组织编码可确定 code 模式，ID 与 code 冲突时优先 ID', () => {
  for (const [code, value, expected] of [['00100', '00100:GLOBAL', 100], ['100', '100:GLOBAL', 100]]) {
    const result = analyzeMemberRows({
      rows: [[], [], [], [], ['1000000001', '', '张三', '男', value]], startRow: 5,
      orgs: [...orgs, { id: 200, parent_id: 2, code, name: '数字编码组织' }],
      positions: [positionAtParty('self_and_descendants')], roles: [], t: (key) => key,
    })
    assert.equal(result.issues.length, 0)
    assert.equal(result.members[0].orgIdentities[0].orgId, code === '00100' ? 200 : expected)
  }
})
