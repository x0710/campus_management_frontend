import assert from 'node:assert/strict'
import test from 'node:test'
import { AxiosError } from 'axios'
import { http } from '../src/api/http.ts'
import { createUsers } from '../src/api/users.ts'

const rows = [{ uid: 1001, username: '1001', name: '张三' }]

test('创建用户默认 insert，支持 ignore 和 replace，保留未提供密码的语义', async () => {
  const previous = http.defaults.adapter
  const calls = []
  http.defaults.adapter = async (config) => {
    calls.push(config)
    assert.equal(config.url, '/users')
    assert.equal(config.method, 'post')
    assert.equal(Object.hasOwn(JSON.parse(config.data)[0], 'password'), false)
    return { config, data: config.params.mode === 'ignore' ? 0 : 1, status: 200, statusText: 'OK', headers: {} }
  }
  try {
    assert.equal(await createUsers(rows), 1)
    assert.equal(await createUsers(rows, undefined, 'ignore'), 0)
    assert.equal(await createUsers(rows, undefined, 'replace'), 1)
    assert.deepEqual(calls.map((config) => config.params.mode), ['insert', 'ignore', 'replace'])
  } finally { http.defaults.adapter = previous }
})

test('用户名冲突直接透传 409，不切换模式或自动重试', async () => {
  const previous = http.defaults.adapter
  let calls = 0
  http.defaults.adapter = async (config) => {
    calls++
    throw new AxiosError('Conflict', 'ERR_BAD_RESPONSE', config, undefined,
      { config, data: '用户名已被占用', status: 409, statusText: 'Conflict', headers: {} })
  }
  try {
    await assert.rejects(createUsers(rows, undefined, 'replace'), (err) => err.response.status === 409)
    assert.equal(calls, 1)
  } finally { http.defaults.adapter = previous }
})
