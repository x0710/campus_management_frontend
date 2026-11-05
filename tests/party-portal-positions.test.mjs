import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDefaultPartyPortalKey, getAccessiblePartyPortalKeys } from '../src/config/partyPortalPositions.ts'

const positions = (...codes) => codes.map((code) => ({ code, name: '任意名称' }))

test('党委门户按新的三个职位编码分流，忽略大小写与首尾空格', () => {
  assert.equal(resolveDefaultPartyPortalKey(positions('party_branch')), 'branch')
  assert.equal(resolveDefaultPartyPortalKey(positions('party_committee')), 'academy')
  assert.equal(resolveDefaultPartyPortalKey(positions(' PARTY_SCH ')), 'school')
  assert.equal(resolveDefaultPartyPortalKey(positions('party_sch', 'party_committee', 'party_branch')), 'branch')
})

test('职位名称、旧编码和相似编码不能触发党委门户', () => {
  for (const code of ['branch_secretary', 'secretary', 'school_secretary', 'party_branch_extra', 'admin', 'basic', 'toString']) {
    assert.equal(resolveDefaultPartyPortalKey([{ code, name: '学校支部书记' }]), 'party')
    assert.deepEqual(getAccessiblePartyPortalKeys(positions(code)), ['party'])
  }
  assert.equal(resolveDefaultPartyPortalKey([]), 'party')
})

test('学院和学校职位保留访问下级门户的能力', () => {
  assert.deepEqual(getAccessiblePartyPortalKeys(positions('party_branch')), ['party', 'branch'])
  assert.deepEqual(getAccessiblePartyPortalKeys(positions('party_committee')), ['party', 'branch', 'academy'])
  assert.deepEqual(getAccessiblePartyPortalKeys(positions('party_sch')), ['party', 'branch', 'academy', 'school'])
})
