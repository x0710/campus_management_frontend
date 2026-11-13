import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router'
import { CAMPUS_PATH, LOGIN_PATH, PORTAL_PATHS, getPortalPath, getPortalKeyFromPathname, migrateLegacyPath } from '../src/config/routes.ts'
import { usePortalParams } from '../src/hooks/usePortalParams.ts'

test('所有门户与登录入口均基于 APP_BASE，根入口与党员门户不冲突', () => {
  assert.equal(CAMPUS_PATH, '/campus/party')
  assert.equal(LOGIN_PATH, '/campus/party/login')
  assert.equal(getPortalPath('party'), '/campus/party/member')
  assert.equal(getPortalPath('branch'), '/campus/party/branch')
  assert.equal(getPortalPath('academy'), '/campus/party/academy')
  assert.equal(getPortalPath('school'), '/campus/party/school')
  assert.equal(getPortalPath('admin'), '/campus/party/admin')
  assert.equal(getPortalPath('unknown'), '/campus/party/member')
  assert.equal(getPortalPath('toString'), '/campus/party/member')
})

test('识别不同深度的门户和详情路径，避免前缀误匹配', () => {
  for (const [key, base] of Object.entries(PORTAL_PATHS)) {
    for (const path of [base, `${base}/`, `${base}/${key}_m1`, `${base}/organization-members/27`]) {
      assert.equal(getPortalKeyFromPathname(path), key, path)
    }
  }
  for (const path of ['/campus/login', '/campus/administer', '/campus/partying', '/portal/admin', '/']) {
    assert.equal(getPortalKeyFromPathname(path), undefined, path)
  }
})

test('旧地址迁移保留详情路径、查询参数和锚点，支持已保存的返回位置', () => {
  const cases = [
    ['/', '/campus/party'], ['/home?tab=all#top', '/campus/party?tab=all#top'],
    ['/login?retry=1', '/campus/party/login?retry=1'],
    ['/portal/party/party_m5', '/campus/party/member/party_m5'],
    ['/portal/branch/party-score-approvals/34?from=branch_m3&action=approve#detail',
      '/campus/party/branch/party-score-approvals/34?from=branch_m3&action=approve#detail'],
    ['/portal/academy/approval-templates/3?from=academy_m2', '/campus/party/academy/approval-templates/3?from=academy_m2'],
    ['/portal/school/organization-members/27?from=school_m2', '/campus/party/school/organization-members/27?from=school_m2'],
    ['/portal/admin/admin_m1?filter=all#users', '/campus/party/admin/admin_m1?filter=all#users'],
    ['/campus/admin/admin_m1', '/campus/party/admin/admin_m1'],
    ['/campus/login?retry=1', '/campus/party/login?retry=1'],
    ['/campus?tab=all', '/campus/party?tab=all'],
    ['/campus/student/student_m4', '/campus/party/student/student_m4'],
    ['/campus/party/party-scores/9?from=party_m4#detail', '/campus/party/member/party-scores/9?from=party_m4#detail'],
    ['/campus/party/member/party_m5', '/campus/party/member/party_m5'],
  ]
  for (const [from, to] of cases) assert.equal(migrateLegacyPath(from), to)
})

test('实际路由匹配保留门户、模块和详情参数，党建子门户不会被党员端覆盖', () => {
  function Probe() {
    return createElement('span', null, JSON.stringify(usePortalParams()))
  }
  for (const [key, base] of Object.entries(PORTAL_PATHS)) {
    for (const [suffix, expected] of [
      ['', { portalKey: key }],
      [`/${key}_m1`, { portalKey: key, moduleKey: `${key}_m1` }],
      ['/organization-members/27', { portalKey: key, uid: '27' }],
      ['/party-score-approvals/34', { portalKey: key, stepId: '34' }],
    ]) {
      const routes = Object.values(PORTAL_PATHS).map((path) => createElement(Route, { key: path, path },
        createElement(Route, { index: true, element: createElement(Probe) }),
        ...[':moduleKey', 'organization-members/:uid', 'party-score-approvals/:stepId'].map((child) =>
          createElement(Route, { key: child, path: child, element: createElement(Probe) }))))
      const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`${base}${suffix}`] }, createElement(Routes, null, routes)))
      const actual = JSON.parse(html.replace(/^<span>|<\/span>$/g, '').replaceAll('&quot;', '"'))
      assert.deepEqual(actual, expected, `${base}${suffix}`)
    }
  }
})


test('新页面路由始终在站点内，重复迁移不会再添加前缀', () => {
  assert.notEqual(CAMPUS_PATH, getPortalPath('party'))
  for (const path of [LOGIN_PATH, ...Object.values(PORTAL_PATHS)]) {
    assert.equal(path.startsWith(`${CAMPUS_PATH}/`), true)
    assert.equal(migrateLegacyPath(path), path)
  }
})
