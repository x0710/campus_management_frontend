import assert from 'node:assert/strict'
import test from 'node:test'
import { parseApprovalNotice } from '../src/utils/noticeApproval.ts'
import { resolveApprovalNoticePath } from '../src/api/noticeApprovals.ts'
import { http } from '../src/api/http.ts'
import { invalidate } from '../src/api/cache.ts'

const notice = (content, category = 'approval') => ({ id: 1, user_id: 7, content, category, is_read: true })

test('已读和未读审批待办都按步骤编号进入对应门户详情', async () => {
  const item = notice('审批“加分”（审批编号：12，步骤编号：34）已轮到您处理，请及时审批。')
  assert.deepEqual(parseApprovalNotice(item), { instanceId: 12, stepId: 34 })
  assert.equal(await resolveApprovalNoticePath(item, 'party'), '/campus/party/member/party-score-approvals/34?from=party_m5')
  assert.equal(await resolveApprovalNoticePath({ ...item, is_read: false }, 'academy'), '/campus/party/academy/party-score-approvals/34?from=academy_m3')
})

test('普通通知不跳转，缺失或异常编号的审批通知回退审批列表', async () => {
  assert.equal(await resolveApprovalNoticePath(notice('步骤编号：34', 'system'), 'party'), null)
  assert.equal(await resolveApprovalNoticePath(notice('旧版审批通知'), 'party'), '/campus/party/member/party_m5')
  assert.equal(parseApprovalNotice(notice('步骤编号：999999999999999999999')).stepId, undefined)
})

test('审批结果用实例编号查找申报详情，无匹配或请求失败时回退', async () => {
  const previous = http.defaults.adapter
  const item = notice('您提交的“加分”（审批编号：12）已通过，请查看审批详情。')
  try {
    for (const data of [[{ id: 56 }], []]) {
      invalidate()
      http.defaults.adapter = async (config) => {
        assert.equal(config.url, '/party-scores')
        assert.equal(config.params.approval_instance_id, 12)
        return { config, status: 200, statusText: 'OK', headers: {}, data: { data } }
      }
      assert.equal(await resolveApprovalNoticePath(item, 'party'), data.length
        ? '/campus/party/member/party-scores/56?from=party_m4' : '/campus/party/member/party_m5')
    }
    invalidate()
    http.defaults.adapter = async () => { throw new Error('Unavailable') }
    assert.equal(await resolveApprovalNoticePath(item, 'party'), '/campus/party/member/party_m5')
  } finally {
    http.defaults.adapter = previous
    invalidate()
  }
})
