import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
// One bundle so the request layers, the notification store and the account state share a single module instance.
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export * from './src/domain/accountSession.ts'
    export { request } from './src/services/api.ts'
    export { platformRequest } from './src/services/platform.ts'
    export { useNotificationStore } from './src/stores/notifications.ts'
    export { createPinia, setActivePinia } from 'pinia'` },
  bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env.VITE_USE_MOCKS': '"false"', 'import.meta.env.VITE_API_BASE_URL': '""' },
})
const m = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const json = (body: unknown, status = 200) => Response.json(body, { status })
const isCsrf = (url: unknown) => String(url).endsWith('/api/auth/csrf')
test.beforeEach(() => { m.resetAccountSession(); m.setActivePinia(m.createPinia()) })

test('writes carry the page account so the server can refuse a submit that raced the broadcast', async t => {
  const seen: Record<string, string | null> = {}
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    if (isCsrf(url)) return json({ token: 'csrf-for-bob' })
    seen[String(url)] = new Headers(init.headers).get('X-Closet-Account'); return json({ ok: true })
  })
  m.setActiveAccount('alice')
  await m.request('/api/closet/quick-intakes', { method: 'POST', body: new FormData() })
  await m.platformRequest('/api/me/wearer-profile', 'PUT', { revision: 0 })
  await m.request('/api/closet/garments')
  assert.deepEqual(seen, { '/api/closet/quick-intakes': 'alice', '/api/me/wearer-profile': 'alice', '/api/closet/garments': null })
})
test('a server refusal of the account is announced so the page can ask for a reload', async t => {
  t.mock.method(globalThis, 'fetch', async (url: unknown) => isCsrf(url) ? json({ token: 't' }) : json({ code: 'ACCOUNT_MISMATCH', message: '账号已切换' }, 409))
  const events: string[] = []; const original = globalThis.window
  globalThis.window = { dispatchEvent: (event: Event) => { events.push(event.type); return true } } as unknown as Window & typeof globalThis
  try {
    m.setActiveAccount('alice')
    await assert.rejects(m.request('/api/closet/garments', { method: 'POST', body: '{}' }), /账号已切换/)
    await assert.rejects(m.platformRequest('/api/me/wearer-profile', 'PUT', {}), /账号已切换/)
    assert.deepEqual(events, ['closet-account-mismatch', 'closet-account-mismatch'])
  } finally { globalThis.window = original }
})
test('a stale tab sends nothing at all, neither the CSRF lookup nor the submit', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return json({}) })
  m.setActiveAccount('alice'); m.markAccountStale()
  await assert.rejects(m.request('/api/closet/quick-intakes', { method: 'POST', body: new FormData() }), m.AccountSwitchedError)
  await assert.rejects(m.platformRequest('/api/me/wearer-profile', 'PUT', {}), m.AccountSwitchedError)
  await assert.rejects(m.request('/api/closet/garments'), m.AccountSwitchedError)
  assert.equal(calls, 0)
})
test('the account switching while the CSRF token is fetched stops the submit before it is sent', async t => {
  const sent: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    sent.push(String(url))
    if (isCsrf(url)) { m.setActiveAccount(null); m.setActiveAccount('bob'); return json({ token: 'csrf-for-bob' }) }
    return json({})
  })
  m.setActiveAccount('alice')
  await assert.rejects(m.request('/api/closet/quick-intakes', { method: 'POST', body: new FormData() }), m.AccountSwitchedError)
  await assert.rejects(m.platformRequest('/api/me/wearer-profile', 'PUT', {}), m.AccountSwitchedError)
  assert.equal(sent.some(url => !isCsrf(url)), false, 'no upload or profile write may reach the server')
})
test('a read answered after the account changed is dropped, not shown to the new account', async t => {
  let release!: (response: Response) => void
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { release = resolve }))
  m.setActiveAccount('alice')
  const pending = m.request('/api/closet/garments')
  m.setActiveAccount(null); m.setActiveAccount('bob')
  release(json({ owner: 'alice-private' }))
  await assert.rejects(pending, m.AccountSwitchedError)
})

// These two tests leave the account state alone on purpose: the store's own generation must hold even if the request layer's check did not.
test('notifications: A answers after B has been loaded, B keeps its data (issue #159)', async t => {
  const answers: Record<string, (response: Response) => void> = {}
  t.mock.method(globalThis, 'fetch', (url: unknown, init: RequestInit) => new Promise<Response>(resolve => { answers[(init.headers as Headers | undefined)?.get?.('x-test') ?? String(answers.n = (answers.n as unknown as number ?? 0) + 1)] = resolve }))
  const store = m.useNotificationStore()
  const note = (id: string, title: string) => ({ id, kind: 'DUPLICATE', title, body: '', href: null, payload: {}, createdAt: 1, read: false })
  store.start()                       // request 1: Alice's
  store.stop(); store.start()         // sign out, sign in as Bob: request 2
  answers['2'](json({ items: [note('b1', 'bob-note')], unread: 1 }))
  await new Promise(r => setTimeout(r, 0))
  assert.deepEqual(store.items.map((i: { title: string }) => i.title), ['bob-note'])
  answers['1'](json({ items: [note('a1', 'alice-private')], unread: 1 }))
  await new Promise(r => setTimeout(r, 0))
  assert.deepEqual(store.items.map((i: { title: string }) => i.title), ['bob-note'])
  assert.equal(store.unread, 1); assert.equal(store.latest, null)
  store.stop()
})
test('notifications: after sign-out a late answer cannot refill the emptied store', async t => {
  let release!: (response: Response) => void
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { release = resolve }))
  const store = m.useNotificationStore()
  store.start()
  store.stop()
  release(json({ items: [{ id: 'a1', kind: 'DUPLICATE', title: 'alice-private', body: '', href: null, payload: {}, createdAt: 1, read: false }], unread: 1 }))
  await new Promise(r => setTimeout(r, 0))
  assert.deepEqual(store.items, []); assert.equal(store.unread, 0); assert.equal(store.latest, null)
})
// read/readAll/remove/removeAll answer with the server's unread count; Alice's late counts must not land on Bob's badge.
function heldFetch(t: { mock: { method: typeof import('node:test').mock.method } }) {
  const held: { url: string; release: (response: Response) => void }[] = []
  t.mock.method(globalThis, 'fetch', (url: unknown) => isCsrf(url) ? Promise.resolve(json({ token: 't' })) : new Promise<Response>(resolve => { held.push({ url: String(url), release: resolve }) }))
  const answer = async (match: (url: string) => boolean, body: unknown) => {
    for (let i = 0; i < 20 && !held.some(h => match(h.url)); i++) await new Promise(r => setImmediate(r))
    const index = held.findIndex(h => match(h.url)); assert.notEqual(index, -1, 'request was sent')
    held.splice(index, 1)[0].release(json(body)); await new Promise(r => setImmediate(r))
  }
  return { held, answer }
}
const aliceNote = (id: string) => ({ id, kind: 'DUPLICATE', title: 'alice-private', body: '', href: null, payload: {}, createdAt: 1, read: false })
const isList = (url: string) => url.includes('/api/notifications?')
test('notifications: A\'s late read/readAll/remove counts do not overwrite B\'s unread (issue #159)', async t => {
  const { answer } = heldFetch(t)
  const store = m.useNotificationStore()
  t.after(() => store.stop())
  store.start()
  await answer(isList, { items: [aliceNote('a1'), aliceNote('a2'), aliceNote('a3')], unread: 3 })
  void store.read(store.items[0]); void store.remove(store.items[1]); void store.readAll(); void store.removeAll()
  store.stop(); store.start()
  await answer(isList, { items: [{ ...aliceNote('b1'), title: 'bob-note' }], unread: 7 })
  await answer(url => url.endsWith('/a1/read'), { unread: 0 })
  await answer(url => url.endsWith('/a2'), { unread: 0 })
  await answer(url => url.endsWith('/read-all'), { unread: 0 })
  await answer(url => url.endsWith('/api/notifications'), { unread: 0 })
  assert.deepEqual(store.items.map((i: { title: string }) => i.title), ['bob-note'])
  assert.equal(store.unread, 7); assert.equal(store.latest, null)
})
test('notifications: after sign-out a late count from a write cannot refill the badge', async t => {
  const { answer } = heldFetch(t)
  const store = m.useNotificationStore()
  t.after(() => store.stop())
  store.start()
  await answer(isList, { items: [aliceNote('a1')], unread: 1 })
  void store.read(store.items[0]); void store.readAll()
  store.stop()
  await answer(url => url.endsWith('/a1/read'), { unread: 4 })
  await answer(url => url.endsWith('/read-all'), { unread: 4 })
  assert.deepEqual(store.items, []); assert.equal(store.unread, 0); assert.equal(store.latest, null)
})

// Issue smart-closet-server#177: a stale page's stray requests must not leave console noise, and its timers must stop.
test('the refusal of a stale page is recognised, other errors are not', () => {
  assert.equal(m.isAccountSwitched(new m.AccountSwitchedError()), true)
  assert.equal(m.isAccountSwitched(new Error('boom')), false)
  assert.equal(m.isAccountSwitched(undefined), false)
})
test('an unawaited request of a stale page leaves no unhandled rejection, other rejections still surface', async () => {
  const listeners = new Set<(event: { reason: unknown; defaultPrevented: boolean; preventDefault(): void }) => void>()
  const target = { addEventListener: (_: string, l: never) => { listeners.add(l) }, removeEventListener: (_: string, l: never) => { listeners.delete(l) } }
  const fire = (reason: unknown) => { const event = { reason, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }; listeners.forEach(l => l(event)); return event.defaultPrevented }
  const remove = m.silenceAccountSwitch(target)
  m.setActiveAccount('alice'); m.markAccountStale()
  const stray = await m.request('/api/closet/garments').catch((error: unknown) => error)
  assert.equal(fire(stray), true)
  assert.equal(fire(new Error('real bug')), false)
  remove()
  assert.equal(listeners.size, 0)
})
test('Vue error hook drops the refusal and forwards everything else', () => {
  const seen: unknown[] = []
  const hook = m.accountAwareErrorHandler((error: unknown) => seen.push(error))
  hook(new m.AccountSwitchedError(), null, 'watcher'); hook(new Error('real bug'), null, 'watcher')
  assert.deepEqual(seen.map(error => (error as Error).message), ['real bug'])
})
test('timers may poll until the page goes stale, then stop for good', () => {
  assert.equal(m.mayPoll(), true)
  m.setActiveAccount('alice'); m.setActiveAccount('bob')
  assert.equal(m.mayPoll(), true)
  m.markAccountStale()
  assert.equal(m.mayPoll(), false)
})
test('a notification poll that fires after the page went stale sends nothing', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return json({ items: [], unread: 0 }) })
  t.mock.timers.enable({ apis: ['setInterval'] })
  const original = globalThis.document; globalThis.document = { visibilityState: 'visible' } as Document
  const store = m.useNotificationStore()
  try {
    m.setActiveAccount('alice'); store.start(); await new Promise(r => setImmediate(r))
    const before = calls
    m.markAccountStale(); t.mock.timers.tick(120_000); await new Promise(r => setImmediate(r))
    assert.equal(calls, before)
  } finally { globalThis.document = original; store.stop() }
})
