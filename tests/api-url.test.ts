import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiUrls } from '../src/domain/api-url.ts'

test('API and private media resolve to the configured backend without rewriting local assets', () => {
  const urls = createApiUrls('https://api.example.com/')
  assert.equal(urls.apiUrl('/api/garments?q=a%20b'), 'https://api.example.com/api/garments?q=a%20b')
  assert.equal(urls.mediaUrl('/api/workflows/1/files/step.png'), 'https://api.example.com/api/workflows/1/files/step.png')
  for (const local of ['/illustrations/a.png', 'blob:local', 'data:image/png;base64,abc']) assert.equal(urls.mediaUrl(local), local)
  assert.equal(urls.mediaUrl(undefined), undefined)
  assert.equal(urls.isApiMedia('/api/garments/1'), true)
  assert.equal(urls.isApiMedia('https://api.example.com/api/garments/1'), true)
  assert.equal(urls.isApiMedia('https://other.example/api/garments/1'), false)
})
test('same-origin mode retains persisted paths and rejects paths that escape the API', () => {
  const urls = createApiUrls()
  assert.equal(urls.apiUrl('/api/auth/csrf'), '/api/auth/csrf')
  assert.equal(urls.mediaUrl('/api/asset.png'), '/api/asset.png')
  for (const path of ['//evil.example/api', '/api/../../other', '/api/\\evil', 'https://evil.example/api']) assert.throws(() => urls.apiUrl(path))
})
test('API base configuration accepts only HTTP(S) origins', () => {
  for (const base of ['https://api.example.com/path', 'https://user:password@api.example.com', 'https://api.example.com?x=1', 'https://api.example.com#x', 'file:///tmp/a']) assert.throws(() => createApiUrls(base))
})
