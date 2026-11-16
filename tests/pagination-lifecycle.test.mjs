import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchAllPages, PageLimitError, PageLoadCancelled } from '../src/utils/pagination.ts'
import { extractErrorReason } from '../src/api/common.ts'

test('分页超限向界面提供可翻译的原因', async () => {
  let calls = 0
  const fetch = async () => { calls++; return { data: [], total: 101, total_pages: 2 } }
  await assert.rejects(fetchAllPages(fetch, 100, 1), (error) => {
    assert.ok(error instanceof PageLimitError)
    assert.equal(extractErrorReason(error, (key, vars) => `${key}:${vars.limit}`), 'common.pageLimit:100')
    return true
  })
  assert.equal(calls, 1)
})

test('会话失效后不再发起后续分页请求', async () => {
  let current = true
  const pages = []
  await assert.rejects(fetchAllPages(async (page) => {
    pages.push(page)
    current = false
    return { data: [page], total: 200, total_pages: 2 }
  }, 100, 100, () => current), PageLoadCancelled)
  assert.deepEqual(pages, [1])
})

test('非法分页限制在请求前报错', async () => {
  let calls = 0
  const fetch = async () => { calls++; return { data: [], total: 0 } }
  for (const [size, limit] of [[0, 10], [100, 0], [NaN, 10], [100, Infinity], [1.5, 10]]) {
    await assert.rejects(fetchAllPages(fetch, size, limit), RangeError)
  }
  assert.equal(calls, 0)
})

test('无有效分页元数据时明确失败，有总数时可推导页数', async () => {
  await assert.rejects(fetchAllPages(async () => ({ data: [1] }), 100), /Invalid pagination response/)
  const pages = []
  const rows = await fetchAllPages(async (page) => {
    pages.push(page)
    return { data: [page], total: 3, total_pages: 0 }
  }, 1)
  assert.deepEqual(pages, [1, 2, 3])
  assert.deepEqual(rows, [1, 2, 3])
})
