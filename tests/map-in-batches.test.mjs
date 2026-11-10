import test from 'node:test'
import assert from 'node:assert/strict'
import { mapInBatches } from '../src/utils/mapInBatches.ts'

test('限制并发并保持输入顺序', async () => {
  let active = 0
  let peak = 0
  const result = await mapInBatches([3, 2, 1, 0, 4], async (value) => {
    active++
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, value))
    active--
    return value * 2
  }, 2)
  assert.deepEqual(result, [6, 4, 2, 0, 8])
  assert.equal(peak, 2)
})

test('请求失败时不继续后续批次', async () => {
  const called = []
  await assert.rejects(mapInBatches([1, 2, 3], async (value) => {
    called.push(value)
    if (value === 2) throw new Error('failed')
    return value
  }, 2), /failed/)
  assert.deepEqual(called, [1, 2])
  await assert.rejects(mapInBatches([], async (value) => value, 0), RangeError)
})
