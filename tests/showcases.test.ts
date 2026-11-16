import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicShowcases } from '../src/creation/showcases.ts'
import { build } from 'esbuild'

const item = (id = 'official-1') => ({ id, title: '日常一角', description: '简单的搭配记录', imageUrl: `/api/public/creations/showcases/${id}/image`, aiGenerated: true })
test('empty, disabled and malformed lists show no showcase', () => {
  for (const data of [null, [], {}, { items: null }, { items: [] }, { items: [null, {}, { ...item(), aiGenerated: false }, { ...item(), title: '' }] }]) assert.deepEqual(publicShowcases(data), [])
})
test('only the exact official relative image path is accepted', () => {
  for (const imageUrl of ['https://example.com/image.png', '//example.com/image.png', 'data:image/png;base64,AA', '/api/creations/jobs/private/media', '/api/public/creations/showcases/other/image', `${item().imageUrl}?private=1`, `${item().imageUrl}#fragment`, '/api/public/creations/showcases/%2e%2e/image']) assert.deepEqual(publicShowcases({ items: [{ ...item(), imageUrl }] }), [])
  for (const id of ['../private', 'a/b', '%2F', 'a?x=1', '']) assert.deepEqual(publicShowcases({ items: [item(id)] }), [])
})
test('public DTO strips unrelated fields, deduplicates and bounds the published response', () => {
  assert.deepEqual(publicShowcases({ items: [{ ...item(), title: ' 日常一角 ', sourceNote: 'private', uploadId: 'private', hash: 'private', operator: 'private', mediaUrl: 'private' }, item()] }), [item()])
  assert.equal(publicShowcases({ items: Array.from({ length: 20 }, (_, i) => item(`official-${i}`)) }).length, 12)
})

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `export { platformRequest } from './src/services/platform.ts'; export * from './src/domain/accountSession.ts'` },
  bundle: true, format: 'esm', platform: 'node', write: false,
  define: { 'import.meta.env.VITE_USE_MOCKS': '"false"', 'import.meta.env.VITE_API_BASE_URL': '""' },
})
const m = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
test.beforeEach(() => m.resetAccountSession())
const path = '/api/public/creations/showcases'
const read = () => m.platformRequest(path, 'GET', undefined, undefined, { anonymous: true })
test('anonymous showcase reads omit cookies and bypass stale-account checks without affecting protected reads', async t => {
  const seen: RequestInit[] = []
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => { seen.push(init); return Response.json({ items: [item()] }) })
  m.setActiveAccount('alice'); m.markAccountStale()
  assert.deepEqual(await read(), { items: [item()] })
  assert.equal(seen[0].credentials, 'omit'); assert.equal(seen[0].cache, 'no-store')
  assert.equal(new Headers(seen[0].headers).has('X-Closet-Account'), false)
  await assert.rejects(m.platformRequest('/api/creations/catalog'), m.AccountSwitchedError)
  assert.equal(seen.length, 1)
})
test('401 and other anonymous failures never dispatch login or account events', async t => {
  const events: string[] = [], original = globalThis.window
  globalThis.window = { dispatchEvent: (event: Event) => { events.push(event.type); return true } } as unknown as Window & typeof globalThis
  try {
    for (const status of [401, 409, 500]) {
      t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'ACCOUNT_MISMATCH', detail: '不可用' }, { status }))
      await assert.rejects(read(), /不可用/)
      t.mock.restoreAll()
    }
    assert.deepEqual(events, [])
  } finally { globalThis.window = original }
})
test('anonymous access cannot be used for private routes, other public routes or writes', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({}) })
  for (const denied of ['/api/creations/jobs', '/api/public/anything', `${path}?extra=1`, `${path}/../private`]) await assert.rejects(m.platformRequest(denied, 'GET', undefined, undefined, { anonymous: true }))
  await assert.rejects(m.platformRequest(path, 'POST', {}, undefined, { anonymous: true }))
  assert.equal(calls, 0)
})
test('anonymous timeouts abort without blocking or replaying a login request', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => { calls++; return new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) })
  await assert.rejects(m.platformRequest(path, 'GET', undefined, undefined, { anonymous: true, timeoutMs: 10 }), /超时/)
  assert.equal(calls, 1)
})
