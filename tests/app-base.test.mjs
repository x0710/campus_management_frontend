import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import { normalizeAppBase } from '../src/config/deployment.ts'

test('部署路径归一化，支持根目录并拒绝域名和查询参数', () => {
  assert.equal(normalizeAppBase('/demo/tools/'), '/demo/tools')
  assert.equal(normalizeAppBase('/'), '')
  for (const value of ['https://example.com/app', '//example.com', '/app?x=1', '/app#top']) {
    assert.throws(() => normalizeAppBase(value), /VITE_APP_BASE/)
  }
})

test('实际 Vite 环境下，替换 BASE 会同步改变页面、CAS、API 与旧链接迁移', async () => {
  for (const base of ['/demo/tools/', '/']) {
    const server = await createServer({
      configFile: false, envFile: false, base, logLevel: 'silent',
      server: { middlewareMode: true }, appType: 'custom',
    })
    try {
      const routes = await server.ssrLoadModule('/src/config/routes.ts')
      const auth = await server.ssrLoadModule('/src/config/auth.ts')
      const api = await server.ssrLoadModule('/src/config/api.ts')
      const prefix = base.replace(/\/$/, '')
      assert.equal(routes.CAMPUS_PATH, prefix || '/')
      assert.equal(routes.LOGIN_PATH, `${prefix}/login`)
      assert.equal(auth.CAS_CALLBACK_PATH, `${prefix}/auth/cas/callback`)
      assert.equal(api.API_BASE, `${prefix}/api`)
      assert.equal(auth.CAS_LOGIN_URL, `${prefix}/api/auth/cas/login`)
      for (const path of Object.values(routes.PORTAL_PATHS)) {
        assert.equal(path.startsWith(`${prefix}/`), true)
      }
      assert.equal(routes.migrateLegacyPath('/campus/admin/admin_m1?q=1#users'), `${prefix}/admin/admin_m1?q=1#users`)
    } finally {
      await server.close()
    }
  }
})
