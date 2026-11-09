import assert from 'node:assert/strict'
import test from 'node:test'
import { AxiosError } from 'axios'
import { http } from '../src/api/http.ts'
import { importMemberRows } from '../src/utils/bulkMemberImport/index.ts'
import { toImportItem } from '../src/utils/bulkMemberImport/unifiedPayload.ts'

const member = (uid) => ({ row: uid, uid, username: String(uid), name: '张三', gender: '男',
  password: 'ignored', orgIdentities: [{ orgId: 10, positions: ['member'] }], roleIds: [],
  partyNo: '', joinTime: '', phone: '', email: '', birthday: '', ethnic: '汉族',
  nativePlace: '', householdLocation: '', householdType: '',
})
const t = (key) => key
async function withAdapter(adapter, action) {
  const previous = http.defaults.adapter
  http.defaults.adapter = adapter
  try { await action() } finally { http.defaults.adapter = previous }
}

test('综合导入请求不提交密码和建号任职数组，空角色及党员字段保持缺省', () => {
  const item = toImportItem(member(1))
  assert.equal(item.user.password, undefined)
  assert.equal(item.user.org, undefined)
  assert.equal(item.role_ids, undefined)
  assert.deepEqual(item.party, {})
  assert.deepEqual(item.members, [{ organization_id: 10, user_id: 1, position: 'member', workplace: '' }])
  assert.equal(item.profile.user_id, 1)
  assert.equal(item.changes.name, '张三')
  assert.deepEqual(toImportItem({ ...member(1), roleIds: [2], partyNo: '100' }).role_ids, [2])
})

test('统一提交一次，由返回 UID 匹配结果，保留随机密码和已有账号结果', async () => {
  let calls = 0
  await withAdapter(async (config) => {
    calls++
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/party-profile-imports')
    assert.equal(JSON.parse(config.data).length, 2)
    return { config, status: 200, statusText: 'OK', headers: {}, data: [
      { user_id: 2, user_created: false, new_password: null },
      { user_id: 1, user_created: true, new_password: 'random-value' },
    ] }
  }, async () => {
    const logs = [], progress = []
    const result = await importMemberRows({ members: [member(1), member(2)], t,
      onLog: (entry) => logs.push(entry), onProgress: (...args) => progress.push(args) })
    assert.deepEqual(result.map((r) => r.action), ['create', 'update'])
    assert.equal(result[0].newPassword, 'random-value')
    assert.equal(result[1].newPassword, undefined)
    assert.ok(result.every((r) => r.status === 'success'))
    assert.equal(logs.length, 1)
    assert.ok(!JSON.stringify(logs).includes('random-value'))
    assert.deepEqual(progress, [[0, 1], [1, 1]])
  })
  assert.equal(calls, 1)
})

test('事务错误整批失败且不拆分重试，网络中断提示核对提交结果', async () => {
  for (const status of [400, 403, undefined]) {
    let calls = 0
    await withAdapter(async (config) => {
      calls++
      throw new AxiosError('failed', 'ERR_BAD_RESPONSE', config, undefined,
        status ? { config, data: 'failed', status, statusText: 'Error', headers: {} } : undefined)
    }, async () => {
      const results = await importMemberRows({ members: [member(1), member(2)], t })
      assert.ok(results.every((r) => r.status === 'failed' && !r.newPassword))
      if (!status) assert.equal(results[0].message, 'bulkMembers.importUncertain')
    })
    assert.equal(calls, 1)
  }
})

test('提交前取消不发送请求', async () => {
  await withAdapter(async () => { throw new Error('must not send') }, async () => {
    const controller = new AbortController()
    controller.abort()
    const results = await importMemberRows({ members: [member(1)], t, signal: controller.signal })
    assert.equal(results[0].status, 'cancelled')
  })
})
