import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as settle } from 'node:timers/promises'
import { createServer, type ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createRenderer, createSSRApp, defineComponent, h, nextTick, proxyRefs, ssrContextKey, type App as VueApp, type Ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, routeLocationKey, routerKey } from 'vue-router'
import { App } from 'ant-design-vue'
import type { Capabilities, Selection, Session, tryOnApi } from '../src/tryon/api.ts'
import type { billingApi as billingService } from '../src/billing/api.ts'
import type * as accessService from '../src/tryon/access.ts'

type PageActions = {
  start(event: { currentTarget: null }): void; begin(): Promise<void>; stop(): Promise<void>; pulse(): Promise<void>; refresh(): Promise<void>
  chooseTier(tier: 'STANDARD' | 'PREMIUM'): Promise<void>
  openCamera(): Promise<void>; pressShutter(): void; lease: Session; host: object; selected: Selection[]; loading: boolean; cameraReady: boolean; error: string
}
let server: ViteDevServer, api: typeof tryOnApi, billingApi: typeof billingService, access: typeof accessService
let camera: { start(id: string, env: string, prepared: unknown, options?: { capacityRetryBudgetMs: number }): void }
let capabilities: Capabilities, starts: string[], stops: string[], dialBudgets: number[], routes: string[], quoteRequests: string[]
const quota = (remaining: number) => ({ limit: 60, used: 60 - remaining, reserved: 0, remaining })
const standard = { tier: 'STANDARD', available: false, reason: 'QUOTA', quota: quota(0) } as const
const premium = { tier: 'PREMIUM', available: true, reason: null, quota: quota(60) } as const
const selection = { type: 'GARMENT', id: 'shirt' } as const
const prepared = { id: 'outfit', revision: 1, items: [selection], previewUrl: '/api/tryon/preparations/outfit/image' }
const lease = (id: string, state: string, vendor = 'XMAX') => ({ id, state, vendor, environment: 'global', reservedPoints: 60, deadlineAtMs: Date.now() + 30000 })
const quote = (unitPoints: number) => ({ enabled: true, showPrices: true, freeRemainingToday: 0, dailyLimit: 60, balance: 0, unitPoints })
const ant = defineComponent({ inheritAttrs: false, setup(_, { attrs, slots }) { return () => h('span', attrs, [slots.default?.(), slots.content?.()]) } })
const antNames = 'alert badge button collapse collapse-panel drawer empty modal popover radio-button radio-group segmented select spin tooltip typography-text upload'.split(' ')
const renderer = createRenderer<object, object>({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {},
  setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {},
})

before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{
    name: 'local-tryon-page', enforce: 'pre',
    resolveId(id) {
      if (id.endsWith('.vue') && !/(TryHubPage|TryOnPage|TryOnShutter|TryOnQuota)\.vue$/.test(id)) return '\0empty-view'
      if (id === '../tryon/camera') return '\0test-camera'
    },
    load(id) {
      if (id === '\0empty-view') return 'export default {render: () => null}'
      if (id === '\0test-camera') return 'export class TryOnCamera { ready = false; diagnostic = {}; previewStats = {}; uplinkStats = {}; downlinkStats = {}; setAspect() {} open() { this.ready = true } stop() {} dispose() {} }'
    },
  }, vue()] })
  api = (await server.ssrLoadModule('/src/tryon/api.ts')).tryOnApi
  access = await server.ssrLoadModule('/src/tryon/access.ts')
  billingApi = (await server.ssrLoadModule('/src/billing/api.ts')).billingApi
  camera = (await server.ssrLoadModule('\0test-camera')).TryOnCamera.prototype
})
after(() => server?.close())

beforeEach(t => {
  starts = []; stops = []; dialBudgets = []; routes = []; quoteRequests = []
  t.mock.method(App, 'useApp', () => ({ message: { info() {}, warning() {} }, modal: {} }))
  capabilities = { enabled: true, ready: false, reason: '管理员尚未添加可用的XMax账户。', quota: quota(0), points: { paidSeconds: 0, milliPointsPerSecond: 1000 }, selectedTier: 'PREMIUM', tiers: [standard, premium], hasHistory: false, limits: { queueSeconds: 60, sessionSeconds: 60, startupSeconds: 30, firstFrameSeconds: 15, offerSeconds: 10, dailySeconds: 60, recordingSeconds: 60, recordingBytes: 10000, storageBytes: 10000 } }
  Object.assign(globalThis, { window: { setTimeout: () => 0, setInterval: () => 0, addEventListener() {}, removeEventListener() {} }, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, ResizeObserver: class { observe() {} disconnect() {} }, innerWidth: 800, innerHeight: 600 })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => key.includes('premium.') ? '1' : null } })
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/api/auth/csrf')) return Response.json({ token: 'csrf' })
    if (String(input).endsWith('/api/me/model-tiers') && init?.method === 'PUT') return Response.json({ realtime: { selected: JSON.parse(String(init.body)).realtime } })
    if (String(input).endsWith('/api/ootd/poses')) return Response.json({ presets: [] })
    return new Response(new Blob(['image']), { status: 200 })
  })
  t.mock.method(api, 'capabilities', async () => capabilities)
  t.mock.method(api, 'prepare', async () => prepared)
  t.mock.method(api, 'upstreamReference', async () => ({ referencePath: '/reference' }))
  t.mock.method(api, 'decartToken', async () => ({ token: 'local' }))
  t.mock.method(api, 'start', async (_p: unknown, _key: string, tier?: string) => { starts.push(tier ?? 'legacy'); return lease(String(starts.length), 'RESERVED', tier === 'PREMIUM' ? 'DECART' : 'XMAX') })
  t.mock.method(api, 'stop', async (id: string) => { stops.push(id); return lease(id, 'CLOSED') })
  for (const key of ['garments', 'outfits']) t.mock.method(api, key, async () => [])
  t.mock.method(api, 'looks', async () => ({ items: [], categories: [] }))
  t.mock.method(api, 'history', async () => ({ sessions: [], media: [] }))
  t.mock.method(billingApi, 'quote', async (tier: string) => { quoteRequests.push(tier); return quote(tier === 'tryon.realtime.premium' ? 0.25 : 1) })
  camera.start = (_id: string, _env: string, _prepared: unknown, options?: { capacityRetryBudgetMs: number }) => { if (options) dialBudgets.push(options.capacityRetryBudgetMs) }
})

// Mount the client lifecycle, exercise the real handlers, then render the page template and its popover slots.
async function page(name: 'TryOnPage' | 'TryHubPage', act: (vm: PageActions) => Promise<void>, narrow = false) {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduced-motion') || narrow, addEventListener() {}, removeEventListener() {} })) as typeof window.matchMedia
  const { default: Page } = await server.ssrLoadModule(`/src/views/${name}.vue`)
  const pinia = createPinia()
  const { useBillingStore } = await server.ssrLoadModule('/src/billing/store.ts')
  const billing = useBillingStore(pinia); billing.realtime = quote(1)
  access.setTryOnAccess(capabilities)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/try', component: Page }] })
  router.push = async path => { routes.push(String(path)) }
  function configure(app: VueApp) {
    app.use(pinia).provide(routerKey, router).provide(routeLocationKey, router.resolve('/try?mode=live'))
  }
  let bindings: { [K in keyof PageActions]: PageActions[K] | Ref<PageActions[K]> }
  const client = renderer.createApp({ setup(props, ctx) { bindings = Page.setup(props, ctx); return () => null } })
  configure(client); client.provide(ssrContextKey, { modules: new Set() }); client.mount({})
  try {
    await settle()
    const vm = proxyRefs(bindings!)
    if (name === 'TryOnPage') { vm.host = {}; vm.selected = [selection] }
    await act(vm)
    const app = createSSRApp({ ...Page, setup: () => bindings })
    configure(app)
    for (const name of antNames) app.component('a-' + name, ant)
    return { html: await renderToString(app), billing }
  } finally { client.unmount() }
}

test('标准用完时，入口进入仍可用的高质量镜头而不打开充值', async () => {
  capabilities.selectedTier = 'STANDARD'
  const { html, billing } = await page('TryHubPage', async vm => { vm.start({ currentTarget: null }) })
  assert.deepEqual(routes, ['/try-on?open=1'])
  assert.equal(billing.purchase, '')
  assert.match(html, /打开镜头/); assert.doesNotMatch(html, /充值点数|XMax/)
})

test('高质量预览按自己的时长、报价和快门状态开始', async () => {
  capabilities.selectedTier = 'STANDARD'
  const { html } = await page('TryOnPage', async vm => { await vm.chooseTier('PREMIUM'); await vm.openCamera() })
  assert.match(html, /aria-label="开始试穿"/)
  assert.match(html, /今日剩余 01:00/); assert.match(html, /每分钟 15 点/)
  assert.doesNotMatch(html, /充值点数|每分钟 60 点|时长已用完/)
  assert.ok(quoteRequests.includes('tryon.realtime.premium'))
  assert.equal(access.tryOnAccess.value?.selectedTier, 'PREMIUM')
})

test('高质量不足时按高质量价格打开充值，即使标准档没有点数单价', async () => {
  capabilities.tiers = [{ ...standard, reason: 'UNAVAILABLE' }, { ...premium, available: false, reason: 'QUOTA', quota: quota(0) }]
  capabilities.points = { paidSeconds: 0, milliPointsPerSecond: 0 }
  const { html, billing } = await page('TryHubPage', async vm => { vm.start({ currentTarget: null }) })
  assert.equal(billing.purchase, 'tryon'); assert.deepEqual(routes, [])
  assert.match(html, /每分钟 15 点/); assert.doesNotMatch(html, /每分钟 60 点/)
})

test('充值后镜头预览接收新额度，快门可以开始', async () => {
  capabilities.tiers = [standard, { ...premium, available: false, reason: 'QUOTA', quota: quota(0) }]
  const { html } = await page('TryOnPage', async vm => {
    await vm.openCamera()
    capabilities = { ...capabilities, tiers: [standard, premium] }
    await access.refreshTryOnAccess()
    await nextTick()
  })
  assert.match(html, /aria-label="开始试穿"/); assert.match(html, /今日剩余 01:00/)
})

test('只开标准档且已用完时，充值入口旁仍可进入本地预览', async () => {
  capabilities.selectedTier = 'STANDARD'; capabilities.tiers = [standard]
  const { html, billing } = await page('TryHubPage', async vm => { vm.start({ currentTarget: null }) })
  assert.deepEqual(routes, ['/try-on?open=1']); assert.equal(billing.purchase, '')
  assert.match(html, /打开本地预览/); assert.match(html, /充值点数/)
})

test('仅标准且时长用完仍能打开免费预览，快门不能开始远端试穿', async () => {
  Object.assign(capabilities, { selectedTier: 'STANDARD', tiers: [standard] })
  const { html } = await page('TryOnPage', async vm => { await vm.openCamera(); assert.equal(vm.cameraReady, true); vm.pressShutter() })
  assert.match(html, /phase-preview/); assert.match(html, /aria-label="[^"]*时长已用完/)
  assert.deepEqual(starts, []); assert.equal(quoteRequests.includes('tryon.realtime.premium'), false)
})

test('结束后高质量被撤下，再开始使用剩余的标准档', async () => {
  await page('TryOnPage', async vm => {
    await vm.openCamera(); await vm.begin(); assert.equal(vm.lease.vendor, 'DECART')
    capabilities = { ...capabilities, selectedTier: 'STANDARD', ready: true, tiers: [{ ...standard, available: true, reason: null, quota: quota(30) }] }
    await vm.stop(); await vm.begin()
    assert.deepEqual(starts, ['PREMIUM', 'legacy'])
  })
})

for (const narrow of [false, true]) test(`${narrow ? '手机' : '桌面'}试穿说明、不可用原因和快门朗读使用用户文案`, async () => {
  for (const tier of ['STANDARD', 'PREMIUM'] as const) {
    capabilities.selectedTier = tier
    capabilities.tiers = [standard, { ...premium, available: false, reason: 'UNAVAILABLE' }]
    const { html } = await page('TryOnPage', async vm => { vm.cameraReady = true }, narrow)
    assert.doesNotMatch(html, /XMax|Decart/i)
    assert.match(html, /画面和参考图会发送给试穿服务/)
    assert.match(html, tier === 'PREMIUM' ? /第一帧|首帧|第一张试穿画面/ : /连接.*计时|计时.*连接|首帧/)
    assert.match(html, tier === 'PREMIUM' ? /aria-label="[^"]*暂时不可用/ : /aria-label="[^"]*时长已用完/)
  }
})

test('上一会话的心跳迟到失败不会结束新会话', async t => {
  Object.assign(capabilities, { selectedTier: 'STANDARD', ready: true, tiers: [{ ...standard, available: true }] })
  const late = Promise.withResolvers<unknown>()
  t.mock.method(api, 'pulse', () => late.promise)
  await page('TryOnPage', async vm => {
    await vm.openCamera(); await vm.begin(); const oldHeartbeat = vm.pulse()
    await vm.stop(); await vm.begin(); assert.equal(vm.lease.id, '2')
    late.reject(new Error('上一会话的网络错误')); await oldHeartbeat
    assert.deepEqual(stops, ['1']); assert.equal(vm.error, '')
  })
})

test('结束高质量的请求失败后只查询状态，不再报告计费心跳', async t => {
  const heartbeat = t.mock.method(api, 'pulse', async () => lease('1', 'CLOSED', 'DECART'))
  const status = t.mock.method(api, 'session', async () => lease('1', 'CLOSED', 'DECART'))
  t.mock.method(api, 'stop', async () => { throw new Error('网络断开') })
  await page('TryOnPage', async vm => { await vm.openCamera(); await vm.begin(); await vm.stop(); await vm.pulse() })
  assert.equal(heartbeat.mock.callCount(), 0); assert.equal(status.mock.callCount(), 1)
})

test('排队 58 秒后接受名额只剩两秒可重试连接', async t => {
  let now = 100000
  t.mock.method(Date, 'now', () => now)
  t.mock.method(api, 'start', async () => ({ ...lease('queue', 'QUEUED', 'DECART'), deadlineAtMs: now + 60000 }))
  t.mock.method(api, 'pulse', async () => ({ ...lease('queue', 'OFFERED', 'DECART'), deadlineAtMs: now + 10000 }))
  t.mock.method(api, 'accept', async () => lease('queue', 'RESERVED', 'DECART'))
  await page('TryOnPage', async vm => {
    await vm.openCamera(); await vm.begin(); now += 58000; await vm.pulse(); await vm.begin()
    assert.deepEqual(dialBudgets, [2000])
  })
})
