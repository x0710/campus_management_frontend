import assert from 'node:assert/strict'
import test from 'node:test'
import { runBatchApproval } from '../src/utils/batchApproval.ts'
import { approvePartyScore, rejectPartyScore } from '../src/api/partyScores.ts'
import { http } from '../src/api/http.ts'

test('批量审批部分失败仍继续，重试只处理未成功项', async () => {
  const calls = [], results = new Map()
  await runBatchApproval([1, 2, 3], async (id) => {
    calls.push(id)
    if (id === 2) throw new Error('forbidden')
  }, () => true, (id, result) => results.set(id, result))
  assert.deepEqual(calls, [1, 2, 3])
  assert.equal(results.get(2).success, false)
  assert.equal(results.get(2).error.message, 'forbidden')
  await runBatchApproval([1, 2, 3].filter((id) => !results.get(id).success), async (id) => { calls.push(id) }, () => true,
    (id, result) => results.set(id, result))
  assert.deepEqual(calls, [1, 2, 3, 2])
  assert.ok([...results.values()].every((result) => result.success))
})

test('会话切换或卸载后不再提交后续审批，也不更新旧页面', async () => {
  let current = true
  const calls = [], results = []
  await runBatchApproval([1, 2, 3], async (id) => { calls.push(id); current = false },
    () => current, (...args) => results.push(args))
  assert.deepEqual(calls, [1])
  assert.deepEqual(results, [])
})

test('批量同意保留逐条分数字符串精度，拒绝不发送核定分数', async () => {
  const previous = http.defaults.adapter
  const calls = []
  http.defaults.adapter = async (config) => {
    calls.push([config.url, JSON.parse(config.data)])
    return { config, data: undefined, status: 200, statusText: 'OK', headers: {} }
  }
  try {
    await runBatchApproval([{ id: 1, score: '1.000000000000000001' }, { id: 2, score: '-2.5' }],
      (item) => approvePartyScore(item.id, { comment: '同意', reviewed_score: item.score }), () => true, () => {})
    await rejectPartyScore(3, { comment: '材料不全' })
    assert.deepEqual(calls, [
      ['/party-scores/approvals/1/approve', { comment: '同意', reviewed_score: '1.000000000000000001' }],
      ['/party-scores/approvals/2/approve', { comment: '同意', reviewed_score: '-2.5' }],
      ['/party-scores/approvals/3/reject', { comment: '材料不全' }],
    ])
  } finally { http.defaults.adapter = previous }
})
