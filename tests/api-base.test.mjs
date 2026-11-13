import assert from 'node:assert/strict'
import { test } from 'node:test'
import { API_BASE, isApiUrl, resolveApiUrl } from '../src/config/api.ts'
import { http } from '../src/api/http.ts'
import { fetchFileBlobByUrl } from '../src/api/file.ts'

test('所有业务请求共用 API_BASE，默认使用 Nginx 的 /campus/party/api', () => {
  assert.equal(API_BASE, '/campus/party/api')
  assert.equal(http.defaults.baseURL, API_BASE)
  assert.equal(http.getUri({ url: '/users' }), '/campus/party/api/users')
  assert.equal(http.getUri({ url: '/auth/cas/callback' }), '/campus/party/api/auth/cas/callback')
})

test('附件地址支持配置前缀、完整后端地址及历史 /api 前缀，保留下载令牌', () => {
  for (const base of ['/campus/party/api', '/api/v1', '/backend', 'https://backend.example.com/api/v1']) {
    const expected = `${base}/files/42?token=abc%2B123`
    for (const url of ['/api/files/42?token=abc%2B123', 'api/files/42?token=abc%2B123', '/files/42?token=abc%2B123']) {
      assert.equal(resolveApiUrl(url, base), expected)
    }
    const basePath = new URL(base, 'https://frontend.example.com').pathname
    assert.equal(resolveApiUrl(`${basePath}/files/42?token=abc%2B123`, base), expected)
  }
  assert.equal(resolveApiUrl('/api/files/42', ''), '/files/42')
  assert.equal(resolveApiUrl('/api/files/42', '/api/v1'), '/api/v1/files/42')
  for (const url of ['https://cdn.example.com/image.png', '//cdn.example.com/image.png']) {
    assert.equal(resolveApiUrl(url, '/backend'), url)
  }
  assert.equal(isApiUrl('/api/files/42'), true)
  assert.equal(isApiUrl('/apiary/image.png'), false)
  assert.equal(isApiUrl('https://cdn.example.com/image.png'), false)
})

test('附件 Blob 请求不重复拼接 API_BASE 并保留鉴权拦截器', async () => {
  const adapter = http.defaults.adapter
  const seen = []
  try {
    http.defaults.adapter = async (config) => {
      seen.push(http.getUri(config))
      return { config, status: 200, statusText: 'OK', headers: {}, data: new Blob(['preview']) }
    }
    const blob = await fetchFileBlobByUrl('/api/files/42?token=abc')
    assert.equal(await blob.text(), 'preview')
    assert.deepEqual(seen, ['/campus/party/api/files/42?token=abc'])
  } finally {
    http.defaults.adapter = adapter
  }
})
