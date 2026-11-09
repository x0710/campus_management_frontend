import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GetRequestCache, makeCacheKey } from '../src/utils/getRequestCache.ts'
import { createSharedResource } from '../src/utils/sharedResource.ts'
import { createRequestSequence } from '../src/utils/requestSequence.ts'
import { firstMatchingInBatches } from '../src/utils/firstMatchingInBatches.ts'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('缓存键保留参数结构，且不受对象属性顺序影响', () => {
  const key = (params) => makeCacheKey('GET', '/users', params)
  assert.equal(key({ a: 1, b: { y: 2, x: 3 } }), key({ b: { x: 3, y: 2 }, a: 1 }))
  assert.notEqual(key({ a: '1&b=2' }), key({ a: '1', b: '2' }))
  assert.notEqual(key({ a: ['x,y'] }), key({ a: ['x', 'y'] }))
  assert.notEqual(key({ a: null }), key({ a: '' }))
})

test('相同请求共享；强制刷新后旧响应不能覆盖新缓存或清除新请求', async () => {
  const requests = []
  const cache = new GetRequestCache(() => {
    const result = deferred(); requests.push(result); return result.promise
  })
  const old = cache.get('/users')
  assert.equal(old, cache.get('/users'))
  const fresh = cache.get('/users', undefined, { force: true })
  requests[0].resolve('old')
  await old
  assert.equal(cache.size().inFlight, 1)
  requests[1].resolve('new')
  await fresh
  assert.equal(await cache.get('/users'), 'new')
})

test('失效后的旧请求完成时不能写回缓存', async () => {
  const requests = []
  const cache = new GetRequestCache(() => {
    const result = deferred(); requests.push(result); return result.promise
  })
  const old = cache.get('/users')
  cache.invalidate()
  const fresh = cache.get('/users')
  requests[1].resolve('new account')
  await fresh
  requests[0].resolve('old account')
  await old
  assert.equal(await cache.get('/users'), 'new account')
})

test('前缀失效只移除对应资源，失败请求可以重试', async () => {
  let count = 0
  const cache = new GetRequestCache(async () => {
    if (++count === 1) throw new Error('offline')
    return count
  })
  await assert.rejects(cache.get('/users'))
  assert.equal(cache.size().inFlight, 0)
  await cache.get('/users')
  await cache.get('/positions')
  cache.invalidate('GET /users')
  assert.equal(await cache.get('/positions'), 3)
  assert.equal(await cache.get('/users'), 4)
})

test('业务列表 30 秒过期，职位字典 5 分钟过期', async () => {
  let now = 0, count = 0
  const cache = new GetRequestCache(async () => ++count, () => now)
  await cache.get('/users')
  await cache.get('/positions')
  now = 30_000
  assert.equal(await cache.get('/users'), 3)
  assert.equal(await cache.get('/positions'), 2)
  now = 300_000
  assert.equal(await cache.get('/positions'), 4)
})

test('缓存按最近访问淘汰，已过期条目也被回收', async () => {
  let count = 0, now = 0
  const cache = new GetRequestCache(async () => ++count, () => now, 2)
  await cache.get('/a')
  await cache.get('/b')
  await cache.get('/a')
  await cache.get('/c')
  assert.equal(cache.size().resolved, 2)
  assert.equal(await cache.get('/a'), 1)
  assert.equal(await cache.get('/b'), 4)
  now = 30_000
  await cache.get('/d')
  assert.equal(cache.size().resolved, 1)
})

test('请求凭据在刷新和卸载时失效', () => {
  const requests = createRequestSequence()
  const first = requests.begin()
  const latest = requests.begin()
  assert.equal(first(), false)
  assert.equal(latest(), true)
  requests.invalidate()
  assert.equal(latest(), false)
  assert.equal(requests.begin()(), true)
})

test('组织探测限制并发并保持原顺序，命中后不再加载下一批', async () => {
  const requests = new Map()
  const result = firstMatchingInBatches([1, 2, 3, 4, 5], async (id) => {
    const request = deferred(); requests.set(id, request); return request.promise
  }, 4)
  assert.deepEqual([...requests.keys()], [1, 2, 3, 4])
  requests.get(3).resolve(true)
  requests.get(4).resolve(false)
  requests.get(2).resolve(true)
  requests.get(1).resolve(false)
  assert.equal(await result, 2)
  assert.equal(requests.has(5), false)
})

test('组织探测取消后不继续请求', async () => {
  let cancelled = false, calls = 0
  const result = await firstMatchingInBatches([1, 2, 3], async () => {
    calls += 1; cancelled = true; return false
  }, 1, () => cancelled)
  assert.equal(result, undefined)
  assert.equal(calls, 1)
})

test('共享数据只加载一次，失效后通知所有订阅者', async () => {
  let calls = 0, firstUpdates = 0, secondUpdates = 0
  const resource = createSharedResource(async () => ++calls, 0, 30_000)
  const first = resource.subscribe(() => firstUpdates++)
  const second = resource.subscribe(() => secondUpdates++)
  await resource.load()
  assert.equal(calls, 1)
  assert.equal(resource.getSnapshot().data, 1)
  resource.invalidate()
  await Promise.resolve()
  await resource.load()
  assert.equal(resource.getSnapshot().data, 2)
  assert.ok(firstUpdates > 0 && secondUpdates > 0)
  first(); second()
})

test('清除共享会话后，旧请求不能恢复上个账号的数据', async () => {
  const requests = []
  const resource = createSharedResource(() => {
    const result = deferred(); requests.push(result); return result.promise
  }, [], 30_000)
  const old = resource.load()
  await Promise.resolve()
  resource.invalidate(true)
  assert.deepEqual(resource.getSnapshot().data, [])
  const fresh = resource.load()
  await Promise.resolve()
  requests[1].resolve(['new account'])
  await fresh
  requests[0].resolve(['old account'])
  await old
  assert.deepEqual(resource.getSnapshot().data, ['new account'])
})

test('共享数据失败后保留已加载内容，并暴露错误', async () => {
  let fail = false
  const resource = createSharedResource(async () => {
    if (fail) throw new Error('offline')
    return ['existing']
  }, [], 30_000)
  await resource.load()
  fail = true
  await resource.load(true)
  assert.deepEqual(resource.getSnapshot().data, ['existing'])
  assert.equal(resource.getSnapshot().error.message, 'offline')
  assert.equal(resource.getSnapshot().loading, false)
})

test('共享数据强制刷新绕过在途请求，并将刷新标记传给接口层', async () => {
  const requests = [], forces = []
  const resource = createSharedResource((force) => {
    forces.push(force)
    const result = deferred(); requests.push(result); return result.promise
  }, [], 30_000)
  const old = resource.load()
  await Promise.resolve()
  const fresh = resource.load(true)
  await Promise.resolve()
  assert.deepEqual(forces, [false, true])
  requests[1].resolve(['new'])
  await fresh
  requests[0].resolve(['old'])
  await old
  assert.deepEqual(resource.getSnapshot().data, ['new'])
})


test('所有业务缓存均有期限，Infinity 不能创建永久缓存', async () => {
  let calls = 0, now = 0
  const cache = new GetRequestCache(async () => ++calls, () => now)
  assert.equal(await cache.get('/organizations', undefined, { maxAgeMs: Infinity }), 1)
  now = 29_999
  assert.equal(await cache.get('/organizations'), 1)
  now = 30_000
  assert.equal(await cache.get('/organizations'), 2)
  // 页面重载相当于创建新的内存缓存，必须重新请求。
  const reloaded = new GetRequestCache(async () => ++calls, () => now)
  assert.equal(await reloaded.get('/organizations'), 3)
})

test('旧的永久缓存条目不会恢复，有限缓存也必须检查过期时间', async () => {
  let calls = 0
  const entries = [
    [makeCacheKey('GET', '/organizations'), { data: 'stale', expiresAt: null }],
    [makeCacheKey('GET', '/users'), { data: 'expired', expiresAt: 999 }],
  ]
  const cache = new GetRequestCache(async () => ++calls, () => 1000, 500, {
    read: () => JSON.stringify(entries), write: () => {},
  })
  assert.equal(await cache.get('/organizations'), 1)
  assert.equal(await cache.get('/users'), 2)
})

test('本地存储不可用或内容损坏时仍可正常请求和复用内存缓存', async () => {
  let calls = 0
  const cache = new GetRequestCache(async () => ++calls, Date.now, 500, {
    read: () => '{bad json', write: () => { throw new Error('quota exceeded') },
  })
  assert.equal(await cache.get('/organizations'), 1)
  assert.equal(await cache.get('/organizations'), 1)
})
