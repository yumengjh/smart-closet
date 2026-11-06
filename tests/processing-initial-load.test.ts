import { test, after } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export { useProcessingStore } from './src/stores/processing.ts'
    export { resetAccountSession } from './src/domain/accountSession.ts'
    export { createPinia, setActivePinia } from 'pinia'` },
  bundle: true, format: 'esm', platform: 'node', write: false,
  define: { 'import.meta.env.VITE_USE_MOCKS': '"false"', 'import.meta.env.VITE_API_BASE_URL': '""' },
})
const temp = await mkdtemp(join(tmpdir(), 'processing-test-'))
const file = join(temp, 'store.mjs')
await writeFile(file, bundle.outputFiles[0].text)
after(() => rm(temp, { recursive: true, force: true }))
const m = await import(pathToFileURL(file).href)
const settle = () => new Promise(resolve => setImmediate(resolve))
test('task discovery and route refresh wait until the first wardrobe list is displayed', async t => {
  const calls: string[] = []
  const original = globalThis.document
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} } as unknown as Document
  t.mock.method(globalThis, 'fetch', async (url: unknown) => { calls.push(String(url)); return Response.json([]) })
  m.resetAccountSession(); m.setActivePinia(m.createPinia())
  const store = m.useProcessingStore()
  t.after(() => { store.stop(); globalThis.document = original })
  store.start('alice', true)
  await store.refresh(true); await settle()
  assert.equal(calls.length, 0, 'start and shell route refresh send no discovery before the list')
  store.resumeDiscovery(); await settle(); await settle()
  assert.ok(calls.some(url => url.includes('/batches')))
  const before = calls.length
  store.deferDiscovery(); await store.refresh(true)
  assert.equal(calls.length, before, 'returning to the wardrobe also gives its list priority')
  store.stop(); store.start('bob')
  await settle(); await settle()
  assert.ok(calls.length > before, 'leaving or switching accounts must not leave polling paused')
})
