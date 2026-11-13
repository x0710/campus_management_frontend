import assert from 'node:assert/strict'
import { test } from 'node:test'
import axios from 'axios'
import { exchangeCasTicket, InvalidCasCallbackError } from '../src/api/cas.ts'
import { http } from '../src/api/http.ts'
import { useAuthStore } from '../src/store/auth.ts'
import { readLoginResponse, saveLoginSession } from '../src/utils/loginSession.ts'
import { CAS_CALLBACK_PATH, CAS_LOGIN_URL } from '../src/config/auth.ts'

const response = { token: 'cas-token', user: 'cas-user', last_login_at: null }
const ok = (config, data = response) => ({ config, status: 200, statusText: 'OK', headers: {}, data })

test('CAS 从后端入口创建浏览器绑定，前端回调页与后端 JSON 验票接口分开', () => {
  assert.equal(CAS_LOGIN_URL, '/campus/party/api/auth/cas/login')
  assert.equal(CAS_CALLBACK_PATH, '/campus/party/auth/cas/callback')
  assert.equal(CAS_CALLBACK_PATH.startsWith('/campus/party/'), true)
  assert.equal(CAS_CALLBACK_PATH.startsWith('/campus/party/api/'), false)
  assert.equal(http.getUri({ url: '/auth/cas/callback' }), '/campus/party/api/auth/cas/callback')
})

test('CAS 验票传递 ticket/state，保存返回 token 并用于后续请求；首次 CAS 登录不要求本地改密', async () => {
  const adapter = http.defaults.adapter
  const previous = useAuthStore.getState()
  const seen = []
  try {
    useAuthStore.getState().setAuth({ token: 'old-token', username: 'old-user', lastLoginAt: '2026-01-01' })
    http.defaults.adapter = async (config) => {
      seen.push({ url: config.url, params: config.params, authorization: config.headers.Authorization })
      return ok(config)
    }
    const result = await exchangeCasTicket('?ticket=ST-test&state=browser-state&token=untrusted-url-token')
    saveLoginSession(result, 'cas')
    assert.equal(useAuthStore.getState().token, 'cas-token')
    assert.equal(useAuthStore.getState().username, 'cas-user')
    assert.equal(useAuthStore.getState().lastLoginAt, null)
    assert.equal(useAuthStore.getState().mustChangePassword, false)
    await http.get('/credentials/me')
    assert.deepEqual(seen, [
      { url: '/auth/cas/callback', params: { ticket: 'ST-test', state: 'browser-state' }, authorization: undefined },
      { url: '/credentials/me', params: undefined, authorization: 'Bearer cas-token' },
    ])
    saveLoginSession({ ...response, token: 'password-token' })
    assert.equal(useAuthStore.getState().mustChangePassword, true)
  } finally {
    http.defaults.adapter = adapter
    useAuthStore.setState(previous)
  }
})

test('CAS 并发验票共用在途请求，完成后不缓存 token 或复用旧响应', async () => {
  const adapter = http.defaults.adapter
  let count = 0
  let release
  let started
  const waiting = new Promise((resolve) => { started = resolve })
  try {
    http.defaults.adapter = (config) => {
      count++
      started()
      return new Promise((resolve) => { release = () => resolve(ok(config)) })
    }
    const first = exchangeCasTicket('?ticket=ST-shared')
    const second = exchangeCasTicket('?ticket=ST-shared')
    assert.equal(first, second)
    await waiting
    assert.equal(count, 1)
    release()
    assert.deepEqual(await first, response)
    http.defaults.adapter = async (config) => { count++; return ok(config) }
    await exchangeCasTicket('?ticket=ST-shared')
    assert.equal(count, 2)
  } finally {
    http.defaults.adapter = adapter
  }
})

test('缺少或重复票据不发送请求，验票失败或异常响应不会修改已有登录态', async () => {
  const adapter = http.defaults.adapter
  const previous = useAuthStore.getState()
  let requests = 0
  try {
    useAuthStore.getState().setAuth({ token: 'keep-token', username: 'keep-user', lastLoginAt: '2026-01-01' })
    http.defaults.adapter = async (config) => { requests++; return ok(config, '<html>proxy fallback</html>') }
    for (const query of ['', '?ticket=', '?ticket=ST-a&ticket=ST-b', '?ticket=ST-a&state=a&state=b', '?ticket=ST-a&state=']) {
      await assert.rejects(exchangeCasTicket(query), InvalidCasCallbackError)
    }
    assert.equal(requests, 0)
    await assert.rejects(exchangeCasTicket('?ticket=ST-invalid-response'), /Invalid login response/)
    assert.equal(useAuthStore.getState().token, 'keep-token')
    http.defaults.adapter = async (config) => {
      const res = { ...ok(config, 'Invalid ticket'), status: 401 }
      throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, res)
    }
    await assert.rejects(exchangeCasTicket('?ticket=ST-rejected'))
    assert.equal(useAuthStore.getState().token, 'keep-token')
    for (const data of [null, {}, { ...response, token: '' }, { ...response, user: '' }, { ...response, last_login_at: 'invalid' }]) {
      assert.throws(() => saveLoginSession(data, 'cas'), /Invalid login response/)
    }
    assert.deepEqual(readLoginResponse({ ...response, last_login_at: '2026-11-11T08:00:00Z' }),
      { ...response, last_login_at: '2026-11-11T08:00:00Z' })
    assert.equal(useAuthStore.getState().token, 'keep-token')
  } finally {
    http.defaults.adapter = adapter
    useAuthStore.setState(previous)
  }
})


test('同一账号未完成首次改密后通过 CAS 登录，清除改密拦截与暂存密码', () => {
  const previous = useAuthStore.getState()
  try {
    saveLoginSession(response, 'password', 'initial-password')
    assert.equal(useAuthStore.getState().mustChangePassword, true)
    saveLoginSession(response, 'cas')
    assert.equal(useAuthStore.getState().mustChangePassword, false)
    assert.equal(useAuthStore.getState().pendingPassword, null)
    assert.equal(useAuthStore.getState().token, response.token)
  } finally {
    useAuthStore.setState(previous)
  }
})
