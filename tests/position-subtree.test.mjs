import assert from 'node:assert/strict'
import test from 'node:test'
import { queryPositions, queryPositionsInOrganizationSubtree } from '../src/api/positions.ts'
import { http } from '../src/api/http.ts'
import { invalidate } from '../src/api/cache.ts'

const organizations = [
  { id: 1, parent_id: null, name: '其他根' },
  { id: 2, parent_id: 1, name: '学院党委根' },
  { id: 7, parent_id: 2, name: '子组织' },
  { id: 8, parent_id: 7, name: '孙级组织' },
  { id: 9, parent_id: 1, name: '其他分支' },
]
const positions = Array.from({ length: 105 }, (_, index) => ({
  code: `p${index}`, name: '职位', organization_id: index === 0 ? 2 : index === 100 ? 7 : index === 104 ? 8 : 9,
}))

function adapter(calls) {
  return async (config) => {
    const { page = 1, page_size: size = 100 } = config.params ?? {}
    calls.push({ url: config.url, ...config.params })
    const items = config.url === '/organizations' ? organizations : positions
    return {
      config, status: 200, statusText: 'OK', headers: {},
      data: { data: items.slice((page - 1) * size, page * size), total: items.length,
        page, page_size: size, total_pages: Math.ceil(items.length / size) },
    }
  }
}

test('身份列表先聚合后按根组织 2 的完整子树过滤，再计算分页和总数', async () => {
  const original = http.defaults.adapter
  const calls = []
  http.defaults.adapter = adapter(calls)
  invalidate()
  try {
    const first = await queryPositionsInOrganizationSubtree(2, { page: 1, page_size: 2, keyword: '职位' }, true)
    assert.deepEqual(first.data.map((position) => position.code), ['p0', 'p100'])
    assert.equal(first.total, 3)
    assert.equal(first.total_pages, 2)
    const second = await queryPositionsInOrganizationSubtree(2, { page: 2, page_size: 2 }, true)
    assert.deepEqual(second.data.map((position) => position.code), ['p104'])
    assert.equal(second.total, 3)
    assert.ok(calls.some((call) => call.url === '/positions' && call.page === 2))
    assert.ok(calls.some((call) => call.url === '/positions' && call.keyword === '职位'))
    const admin = await queryPositions({ page: 1, page_size: 100 }, true)
    assert.equal(admin.total, 105)
    assert.ok(admin.data.some((position) => position.organization_id === 9))
  } finally {
    http.defaults.adapter = original
    invalidate()
  }
})

test('无可访问根组织时不回退到全量身份，页码超出范围时归到有效页', async () => {
  const original = http.defaults.adapter
  http.defaults.adapter = adapter([])
  invalidate()
  try {
    const absent = await queryPositionsInOrganizationSubtree(999, { page: 7, page_size: 2 }, true)
    assert.deepEqual(absent.data, [])
    assert.equal(absent.total, 0)
    assert.equal(absent.page, 1)
    const last = await queryPositionsInOrganizationSubtree(2, { page: 99, page_size: 2 }, true)
    assert.equal(last.page, 2)
    assert.deepEqual(last.data.map((position) => position.organization_id), [8])
  } finally {
    http.defaults.adapter = original
    invalidate()
  }
})
