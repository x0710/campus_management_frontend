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
