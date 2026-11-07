import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chunkItems, sendInTiers } from '../src/utils/bulkMemberImport/batching.ts'

/** 构造一个带 HTTP 状态码的 axios 风格异常（axios.isAxiosError 只检查标记） */
function httpError(status) {
  return { isAxiosError: true, response: { status } }
}

/** 构造 sendInTiers 需要的最小进度记录器 */
function createState() {
  return {
    t: (key) => key,
    done: 0,
    total: 1,
    seq: 0,
    chunkPlanned: 0,
    chunkExecuted: 0,
  }
}

test('chunkItems 按固定大小分块', () => {
  assert.deepEqual(chunkItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(chunkItems([], 10), [])
})

test('请求过大时按 1000 → 100 → 10 → 1 降级', async () => {
  const calls = []
  const state = createState()
  const result = await sendInTiers({
    state,
    meta: { phaseKey: 'test', method: 'POST', path: '/test', count: 0 },
    payloads: Array.from({ length: 25 }, (_, index) => index),
    batch: async (items) => {
      calls.push(items.length)
      if (items.length > 10) throw httpError(431)
      return items
    },
  })

  assert.equal(result.errors.size, 0)
  assert.deepEqual(calls, [25, 10, 10, 5])
  assert.equal(state.done, 4)
  assert.equal(state.total, 4)
})

test('超过 1000 条时先按 1000 分块，失败再降到 100', async () => {
  const calls = []
  const state = createState()
  const result = await sendInTiers({
    state,
    meta: { phaseKey: 'test', method: 'POST', path: '/test', count: 0 },
    payloads: Array.from({ length: 1200 }, (_, index) => index),
    batch: async (items) => {
      calls.push(items.length)
      if (items.length > 100) throw httpError(413)
      return items
    },
  })

  assert.equal(result.errors.size, 0)
  assert.deepEqual(calls, [1000, ...Array(10).fill(100), 200, ...Array(2).fill(100)])
  assert.equal(state.done, 14)
  assert.equal(state.total, 14)
})

test('单项数据失败时降到 1 条并记录失败项', async () => {
  let batchCalls = 0
  let singleCalls = 0
  const state = createState()
  const result = await sendInTiers({
    state,
    meta: { phaseKey: 'test', method: 'POST', path: '/test', count: 0 },
    payloads: [1, 2, 3, 4, 5],
    batch: async () => {
      batchCalls += 1
      throw httpError(400)
    },
    single: async () => {
      singleCalls += 1
      throw httpError(400)
    },
  })

  assert.equal(result.errors.size, 5)
  assert.equal(batchCalls, 1)
  assert.equal(singleCalls, 5)
  assert.equal(state.done, 6)
  assert.equal(state.total, 6)
})

test('权限类错误不拆分，整批标记失败', async () => {
  const calls = []
  const state = createState()
  const result = await sendInTiers({
    state,
    meta: { phaseKey: 'test', method: 'POST', path: '/test', count: 0 },
    payloads: [1, 2, 3],
    batch: async (items) => {
      calls.push(items.length)
      throw httpError(403)
    },
  })

  assert.equal(result.errors.size, 3)
  assert.deepEqual(calls, [3])
  assert.equal(state.done, 1)
})

test('单项批次失败后仍会尝试 single 接口', async () => {
  let batchCalls = 0
  let singleCalls = 0
  const state = createState()
  const result = await sendInTiers({
    state,
    meta: { phaseKey: 'test', method: 'POST', path: '/test', count: 0 },
    payloads: [1],
    batch: async () => {
      batchCalls += 1
      throw httpError(400)
    },
    single: async () => {
      singleCalls += 1
      return 'ok'
    },
  })

  assert.equal(result.errors.size, 0)
  assert.equal(batchCalls, 1)
  assert.equal(singleCalls, 1)
  assert.equal(state.done, 2)
  assert.equal(state.total, 2)
})
