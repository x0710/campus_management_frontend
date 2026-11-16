import assert from 'node:assert/strict'
import test from 'node:test'
import { http } from '../src/api/http.ts'
import { markAllNoticesRead } from '../src/api/notices.ts'
import { useAuthStore } from '../src/store/auth.ts'

test('铃铛标记跨页全部未读，先读取所有分页再写入，避免分页收缩漏项', async () => {
  const previous = http.defaults.adapter
  const calls = []
  useAuthStore.getState().setAuth({ token: 'notice-test', username: 'viewer', lastLoginAt: '2020' })
  http.defaults.adapter = async (config) => {
    calls.push([config.method, config.url, config.params?.page])
    const data = config.method === 'get' ? {
      data: config.params.page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }], total_pages: 2,
    } : undefined
    if (config.method === 'get') assert.equal(config.params.is_read, false)
    return { config, data, status: 200, statusText: 'OK', headers: {} }
  }
  try {
    await markAllNoticesRead()
    assert.deepEqual(calls, [
      ['get', '/notices', 1], ['get', '/notices', 2],
      ['put', '/notices/1/read', undefined], ['put', '/notices/2/read', undefined], ['put', '/notices/3/read', undefined],
    ])
  } finally { http.defaults.adapter = previous; useAuthStore.getState().clearAuth() }
})

test('查询期间切换账号后，不向新账号发送标记已读请求', async () => {
  const previous = http.defaults.adapter
  useAuthStore.getState().setAuth({ token: 'notice-old', username: 'old', lastLoginAt: '2020' })
  http.defaults.adapter = async (config) => {
    assert.equal(config.method, 'get')
    useAuthStore.getState().setAuth({ token: 'notice-new', username: 'new', lastLoginAt: '2020' })
    return { config, data: { data: [{ id: 1 }], total_pages: 1 }, status: 200, statusText: 'OK', headers: {} }
  }
  try { await assert.rejects(markAllNoticesRead(), (error) => error.code === 'ERR_CANCELED') }
  finally { http.defaults.adapter = previous; useAuthStore.getState().clearAuth() }
})

test('关闭通知弹层后停止后续标记批次', async () => {
  const previous = http.defaults.adapter
  let current = true
  let writes = 0
  http.defaults.adapter = async (config) => {
    if (config.method === 'put') { writes++; current = false }
    return { config, data: config.method === 'get' ? {
      data: Array.from({ length: 25 }, (_, id) => ({ id })), total_pages: 1,
    } : undefined, status: 200, statusText: 'OK', headers: {} }
  }
  try {
    await assert.rejects(markAllNoticesRead(() => current), (error) => error.code === 'ERR_CANCELED')
    assert.equal(writes, 10)
  } finally { http.defaults.adapter = previous }
})

test('已关闭的通知操作不会发起查询', async () => {
  const previous = http.defaults.adapter
  let calls = 0
  http.defaults.adapter = async () => { calls++; throw new Error('unexpected request') }
  try {
    await assert.rejects(markAllNoticesRead(() => false), (error) => error.code === 'ERR_CANCELED')
    assert.equal(calls, 0)
  } finally { http.defaults.adapter = previous }
})
