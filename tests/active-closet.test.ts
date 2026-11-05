import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

// smart-closet-server#198: the whole closet in one round of parallel pages, reused across /outfits tabs and dropped after a change.
;(globalThis as { window?: EventTarget }).window = new EventTarget()
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export { activeCloset, knownGarment, forgetActiveCloset } from './src/services/activeCloset.ts'
    export { request } from './src/services/api.ts'
    export { resetAccountSession } from './src/domain/accountSession.ts'` },
  bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env.VITE_USE_MOCKS': '"false"', 'import.meta.env.VITE_API_BASE_URL': '""' },
})
const m = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))

const view = (id: string, favorite = false) => ({ id, revision: 1, favorite, name: id, sourceAssetId: 'a', sourceUrl: '/s', sourceOrigin: 'USER_UPLOAD', displayAssetId: 'a', displayUrl: '/d', images: [], automatic: null, overrides: {}, effective: {}, latestRecognitionJobId: null, latestImageJobId: null, imageProcessing: null, runs: [], status: 'ACTIVE', createdAtMs: 1_000, updatedAtMs: 2_000 })
function closet(total: number) {
  const pages: number[] = []; let inFlight = 0, most = 0
  const fetch = async (url: unknown) => {
    const u = new URL(String(url), 'http://x')
    if (u.pathname === '/api/auth/csrf') return Response.json({ token: 't' })
    if (u.pathname !== '/api/closet/garments') return Response.json({ ok: true })
    const page = Number(u.searchParams.get('page')); pages.push(page)
    inFlight++; most = Math.max(most, inFlight); await new Promise(r => setTimeout(r, 5)); inFlight--
    const items = Array.from({ length: Math.max(0, Math.min(50, total - (page - 1) * 50)) }, (_, i) => view(`g${(page - 1) * 50 + i}`))
    return Response.json({ items, total, page, size: 50 })
  }
  return { fetch, pages, most: () => most }
}
test.beforeEach(() => { m.resetAccountSession(); m.forgetActiveCloset() })

test('pages after the first are asked for together and the result is shared', async t => {
  const server = closet(375); t.mock.method(globalThis, 'fetch', server.fetch)
  const all = await m.activeCloset()
  assert.equal(all.length, 375)
  assert.deepEqual([...server.pages].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(server.most(), 7, 'pages 2-8 in flight at once')
  const again = await m.activeCloset()
  assert.equal(server.pages.length, 8, 'a second caller within the reuse window downloads nothing')
  again.reverse(); assert.equal((await m.activeCloset())[0].id, 'g0', 'callers get their own array')
  assert.equal((await m.knownGarment('g42'))?.id, 'g42')
  assert.equal(await m.knownGarment('missing'), undefined)
})

test('a write to garments drops the shared load, reads do not', async t => {
  const server = closet(60); t.mock.method(globalThis, 'fetch', server.fetch)
  await m.activeCloset(); assert.equal(server.pages.length, 2)
  await m.request('/api/closet/tasks?page=1&size=50'); await m.activeCloset()
  assert.equal(server.pages.length, 2, 'a read keeps it')
  await m.request('/api/closet/garments/g1/favorite', { method: 'POST', body: '{}' })
  assert.equal(await m.knownGarment('g1'), undefined, 'gone after the write')
  await m.activeCloset(); assert.equal(server.pages.length, 4, 'the next load asks again')
})
