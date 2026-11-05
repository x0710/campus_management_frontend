import assert from 'node:assert/strict'
import test from 'node:test'
import { AxiosError } from 'axios'
import { resolveUserNames } from '../src/api/userNames.ts'
import { http } from '../src/api/http.ts'
import { invalidate } from '../src/api/cache.ts'

const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} })
const page = (data, total = data.length, pages = 1) => ({ data, total, total_pages: pages, page: 1, page_size: 100 })
const fail = (config, status) => new AxiosError('request failed', 'ERR_BAD_RESPONSE', config, undefined,
  { config, data: '查询失败', status, statusText: 'Error', headers: {} })

async function run(adapter, action) {
  const previous = http.defaults.adapter
  invalidate()
  http.defaults.adapter = adapter
  try { await action() } finally { http.defaults.adapter = previous; invalidate() }
}

test('批量查询缺失或空姓名时保留空值，不请求用户详情', async () => {
  const calls = []
  await run(async (config) => {
    calls.push(config.url)
    return response(config, page([{ uid: 1, name: '甲' }, { uid: 2, name: null }]))
  }, async () => {
    const result = await resolveUserNames([1, 2, 3, 1])
    assert.deepEqual([...result.names.values()], ['甲', null, null])
    assert.equal(result.error, undefined)
    assert.deepEqual(calls, ['/users'])
  })
})

test('超过 100 个用户分批并读完服务端分页，不把后续页误认为没有姓名', async () => {
  const batches = new Set()
  await run(async (config) => {
    assert.equal(config.url, '/users')
    const ids = config.params.ids.split(',').map(Number)
    assert.ok(ids.length <= 100)
    batches.add(config.params.ids)
    const current = config.params.page
    return response(config, page(ids.slice((current - 1) * 20, current * 20)
      .map((uid) => ({ uid, name: `姓名${uid}` })), ids.length, Math.ceil(ids.length / 20)))
  }, async () => {
    const result = await resolveUserNames(Array.from({ length: 121 }, (_, index) => index + 1))
    assert.equal(result.names.size, 121)
    assert.equal(result.names.get(121), '姓名121')
    assert.equal(result.names.get(100), '姓名100')
    assert.equal(batches.size, 2)
  })
})

test('批量请求失败时保留空值并返回错误，不请求用户详情', async () => {
  const calls = []
  await run(async (config) => {
    calls.push(config.url)
    throw fail(config, 500)
  }, async () => {
    const result = await resolveUserNames([42])
    assert.equal(result.names.get(42), null)
    assert.equal(result.error.response.status, 500)
    assert.deepEqual(calls, ['/users'])
  })
})

test('切换成员或账号后停止后续批量查询', async () => {
  let current = true
  const calls = []
  await run(async (config) => {
    calls.push(config.url)
    current = false
    return response(config, page([]))
  }, async () => {
    await assert.rejects(resolveUserNames(Array.from({ length: 101 }, (_, i) => i + 1), () => current), { code: 'ERR_CANCELED' })
    assert.deepEqual(calls, ['/users'])
  })
})
