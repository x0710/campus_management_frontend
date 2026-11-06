import assert from 'node:assert/strict'
import test from 'node:test'
import { partyTerminology } from '../src/i18n/partyTerminology.ts'

test('党委共用页面统一身份用语，保留系统权限角色', () => {
  assert.equal(partyTerminology('adminPositions.newPosition', '新建职位', 'zh'), '新建身份')
  assert.equal(partyTerminology('portal.school_m5', '岗位管理', 'zh'), '身份管理')
  assert.equal(partyTerminology('approvalTemplate.fieldStepPosition', '审批人角色', 'zh'), '审批人身份')
  assert.equal(partyTerminology('profile.rolesTitle', '系统角色', 'zh'), '系统角色')
})

test('身份文案保留插值标记，并支持英文', () => {
  assert.equal(partyTerminology('example', '职位 {name}', 'zh'), '身份 {name}')
  assert.equal(partyTerminology('adminPositions.title', 'Position Management', 'en'), 'Identity Management')
})
