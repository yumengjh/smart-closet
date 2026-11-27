import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { all, flush, mount, server, text } from './render-flow-harness.ts'

after(async () => {
  const { connectAccountTransport } = await server.ssrLoadModule('/src/domain/accountSession.ts')
  connectAccountTransport(null); await server.close()
})
const tierPath = '/api/me/model-tiers', portraits = '/api/me/person-baselines', creations = '/api/creations', ootd = '/api/ootd'
const maker = 'components/try/TryMaker', personal = 'views/settings/SettingsPersonalSection', album = 'views/TryAlbumPage'
const config = (enabled: boolean, selected = 'STANDARD', standard = true, premium = true) => ({ render: { enabled, selected, degradeEnabled: true,
  tiers: [{ tier: 'STANDARD', units: 2, available: standard }, { tier: 'PREMIUM', units: 5, available: premium }] } })
const outfit = { id: 'look', name: '日常搭配', revision: 4, scene: { elements: [{ kind: 'GARMENT', garmentId: 'shirt', garmentLabel: '衬衫', role: 'TOP' }] } }
const garment = { id: 'shirt', name: '衬衫', revision: 7, status: 'ACTIVE', displayUrl: '/shirt', primaryColor: [], category: ['上装'], images: [] }
const person = { id: 'person', revision: 2, status: 'CONFIRMED', currentDefault: true, name: '我的形象', profile: { sex: 'FEMALE' } }
const effect = { id: 'flat', version: 2, name: '平铺', personRequired: false, maxGarments: 12, available: true, options: {} }
const review = { items: [], warnings: [], blockers: [] }
const imageJob = { id: 'result', status: 'SUCCEEDED', mediaUrl: '/photo', tierRequested: 'PREMIUM', tierUsed: 'STANDARD', quotaUnits: 2, createdAt: 1 }
const closed = '今天的图像额度已用完；不会隔天自动生成。', insufficient = '今天剩余次数不够高质量，可以换成标准。'
const fail = (status: number, code: string, message: string) => Response.json({ code, message }, { status })
type Call = { path: string; method: string; body?: BodyInit | null; key: string | null }
async function fixture(t: TestContext, respond: (call: Call) => unknown = () => undefined) {
  const calls: Call[] = []
  const api = await server.ssrLoadModule('/src/services/api.ts')
  t.mock.method(api.closetApi, 'detail', async () => garment)
  const answers: Record<string, unknown> = {
    [tierPath]: config(true), '/api/auth/csrf': { token: 'csrf' }, '/api/outfits': [outfit], [portraits]: [person],
    '/api/me/wearer-profile': { revision: 3, measurements: {}, preferences: {} }, '/api/me/wearer-profile/render-preview?sex=FEMALE': { profileRevision: 3, sources: {} },
    '/api/me/reference-photos': [], '/api/me/image-render-jobs': [], '/api/render-capabilities': ['BASELINE', 'OOTD'].flatMap(purpose => ['model', 'second-model'].map(model => ({ purpose, verified: true, provider: 'old', model }))),
    [`${ootd}/poses`]: { presets: [], mine: [] }, '/api/wear-details/suggestions': { details: {} }, '/api/outfit-reviews': review,
    [`${creations}/catalog`]: { enabled: true, templates: [effect] }, [`${creations}/preparations`]: { preparationId: 'created', quotaUnits: 7 },
    [`${ootd}/preparations`]: { id: 'prepared', quotaUnits: 6, review }, [`${ootd}/jobs`]: [], [`${creations}/jobs?page=1&size=12`]: { page: 1, total: 0, items: [] },
    '/api/billing/quote?tier=image.standard': { enabled: true, freeRemainingToday: 8 }, '/api/billing/quote?tier=tryon.realtime': { enabled: false },
  }
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    const call = { path: String(url), method: init?.method || 'GET', body: init?.body, key: new Headers(init?.headers).get('Idempotency-Key') }
    calls.push(call)
    const value = await respond(call) ?? answers[call.path]
    if (value instanceof Response) return value
    assert.notEqual(value, undefined, `unhandled ${call.method} ${call.path}`)
    return Response.json(value)
  })
  Object.assign(globalThis, { window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), scrollTo() {} }, document: { hidden: false } })
  return calls
}
const posts = (calls: Call[], path: string) => calls.filter(c => c.method === 'POST' && c.path === path)

test('创作档位读取失败时禁止准备，重试恢复账号选择并按准备报价确认', async t => {
  let unavailable = true
  const calls = await fixture(t, c => c.path === tierPath && unavailable ? fail(503, 'TEMPORARY', '暂时不可用') : undefined)
  const page = await mount(t, maker, { outfit: 'look' }); await page.click(/平铺/)
  await page.click(/^生成/)
  assert.equal(posts(calls, `${creations}/preparations`).length, 0, 'failed tier GET must block creation preparation')
  unavailable = false; await page.click(/重试/); await page.click(/^生成/)
  assert.equal(JSON.parse(String(posts(calls, `${creations}/preparations`)[0].body)).tier, 'STANDARD')
  assert.equal(posts(calls, `${creations}/jobs`).length, 0); assert.match(text(page.root), /消耗 7 次/)
})

test('上身图档位读取失败时不露出旧服务或提交，重试后按选定档位准备', async t => {
  let offline = true
  const calls = await fixture(t, c => { if (offline && c.path === tierPath) throw new TypeError('offline'); if (c.path === `${creations}/catalog`) return { enabled: false, templates: [] } })
  const page = await mount(t, maker, { outfit: 'look' }); await page.click(/^生成上身图/)
  assert.equal(posts(calls, `${ootd}/preparations`).length, 0)
  assert.equal(all(page.root).some(n => n.attrs['aria-label'] === '生成模型'), false)
  offline = false; await page.click(/重试/); await page.click(/^生成上身图/)
  assert.equal(JSON.parse(String(posts(calls, `${ootd}/preparations`)[0].body)).tier, 'STANDARD')
  assert.match(text(page.root), /6 次/)
})

test('档位关闭的创作先报准备返回的次数，确认后沿用旧字段与幂等键', async t => {
  const calls = await fixture(t, c => c.path === tierPath ? config(false) : c.path === `${creations}/jobs` ? { id: 'job', status: 'QUEUED' } : undefined)
  const page = await mount(t, maker, { outfit: 'look', again: 'previous' }); await page.click(/平铺/)
  assert.doesNotMatch(text(page.root), /用掉 1 次|生成 · 1 次/)
  await page.click(/^生成/)
  assert.match(text(page.root), /消耗 7 次/); assert.equal(posts(calls, `${creations}/jobs`).length, 0)
  assert.deepEqual(JSON.parse(String(posts(calls, `${creations}/preparations`)[0].body)), { templateId: 'flat', templateVersion: 2, garments: [{ id: 'shirt', revision: 7 }], outfitId: 'look', outfitRevision: 4, options: { light: 'DEFAULT' }, parentJobId: 'previous' })
  await page.find('a-modal', /消耗 7 次/)!.attrs.onOk()
  const submitted = posts(calls, `${creations}/jobs`)[0]; assert.deepEqual(JSON.parse(String(submitted.body)), { preparationId: 'created' }); assert.ok(submitted.key)
})

test('档位关闭的上身图只显示准备报价，准备与提交沿用旧字段', async t => {
  const calls = await fixture(t, c => c.path === tierPath ? config(false) : c.path === `${creations}/catalog` ? { enabled: false, templates: [] } : c.path === `${ootd}/jobs` && c.method === 'POST' ? imageJob : undefined)
  const page = await mount(t, maker, { outfit: 'look' }); assert.doesNotMatch(text(page.root), /每张用 1 次/)
  await page.click(/^生成上身图/); assert.match(text(page.root), /6 次/)
  assert.deepEqual(JSON.parse(String(posts(calls, `${ootd}/preparations`)[0].body)), { outfitId: 'look', revision: 4, baselineId: 'person', baselineRevision: 2, selectedGarmentIds: ['shirt'], wearRoles: {}, provider: 'old', model: 'model', useOlderBaseline: false, pose: { mode: 'AUTO' }, wearDetails: {} })
  await page.find('a-modal', /6 次/)!.attrs.onOk(); const submitted = posts(calls, `${ootd}/jobs`)[0]
  assert.deepEqual(JSON.parse(String(submitted.body)), { preparationId: 'prepared' }); assert.ok(submitted.key)
})

for (const upload of [false, true]) test(`档位关闭的形象按无档位单位报价并保留${upload ? '照片' : '普通'}提交字段`, async t => {
  const calls = await fixture(t, c => c.path === tierPath ? config(false) : c.method === 'POST' && c.path.startsWith(portraits) ? fail(400, 'REFUSED', '未提交') : undefined)
  const page = await mount(t, personal)
  if (upload) { const pick = page.find('a-upload')!.attrs; (pick['before-upload'] || pick.beforeUpload)(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })); await flush() }
  await page.click(/生成新形象/)
  const modal = page.find('a-modal', /每次一张/)!
  assert.match(text(modal), /5 次/); assert.doesNotMatch(text(modal), /1 个图像额度/)
  await page.click(upload ? /上传照片并生成/ : /^生成(?:（.*）)?$/)
  const call = posts(calls, portraits + (upload ? '/upload-and-generate' : ''))[0]; assert.ok(call.key)
  let body = call.body
  if (upload) { assert.ok(body instanceof FormData); assert.deepEqual([...body.keys()], ['file', 'request']); assert.equal((body.get('file') as File).name, 'photo.jpg'); body = await (body.get('request') as Blob).text() }
  assert.deepEqual(JSON.parse(String(body)), { profileRevision: 3, provider: 'old', model: 'model', sex: 'FEMALE' })
})

test('旧后端档位 404 仍能生成形象，未知次数不显示数字', async t => {
  const calls = await fixture(t, c => c.path === tierPath ? fail(404, 'NOT_FOUND', '不存在') : c.path === portraits && c.method === 'POST' ? imageJob : undefined)
  const page = await mount(t, personal); await page.click(/生成新形象/)
  assert.ok(page.find('a-modal')!.attrs.open); assert.doesNotMatch(text(page.find('a-modal')!), /\d+\s*(?:个图像额度|次)/)
  await page.click(/^生成$/); assert.deepEqual(JSON.parse(String(posts(calls, portraits)[0].body)), { profileRevision: 3, provider: 'old', model: 'model', sex: 'FEMALE' })
})

for (const upload of [false, true]) test(`形象迟到的档位 GET 不覆盖已保存的标准选择（${upload ? '照片' : '普通'}）`, async t => {
  let reads = 0
  const late = Promise.withResolvers<Response>()
  const calls = await fixture(t, c => {
    if (c.method === 'POST' && c.path.startsWith(portraits)) return fail(400, 'REFUSED', '未提交')
    if (c.path === tierPath) return c.method === 'PUT' ? config(true) : ++reads === 1 ? late.promise : config(true, 'PREMIUM')
  })
  const page = await mount(t, personal)
  if (upload) { const pick = page.find('a-upload')!.attrs; (pick['before-upload'] || pick.beforeUpload)(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })); await flush() }
  const opening = page.click(/生成新形象/); await flush()
  if (!page.find('a-modal')!.attrs.open) late.resolve(Response.json(config(true, 'PREMIUM')))
  await opening
  const radio = page.find('a-radio-group', /高质量/)!
  await radio.attrs.onChange({ target: { value: 'STANDARD' } }); await flush()
  late.resolve(Response.json(config(true, 'PREMIUM'))); await flush()
  await page.click(upload ? /上传照片并生成/ : /^生成$/)
  const request = posts(calls, portraits + (upload ? '/upload-and-generate' : ''))[0]; assert.ok(request.key)
  const raw = request.body instanceof FormData ? await (request.body.get('request') as Blob).text() : String(request.body)
  assert.deepEqual(JSON.parse(raw), { profileRevision: 3, tier: 'STANDARD', sex: 'FEMALE' })
})

test('形象被档位池拒绝后刷新可用性并能改档，断线重提则复用原键', async t => {
  let rejected = false
  const calls = await fixture(t, c => {
    if (c.path === tierPath) return config(true, c.method === 'PUT' ? 'STANDARD' : 'PREMIUM', true, !rejected)
    if (c.path.startsWith('/api/me/image-render-submissions/')) return { found: false }
    if (c.path === portraits && c.method === 'POST') { if (rejected) throw new TypeError('offline'); rejected = true; return fail(503, 'MODEL_POOL_EXHAUSTED', '当前档位暂不可用') }
  })
  const page = await mount(t, personal); await page.click(/生成新形象/); const before = calls.filter(c => c.path === tierPath).length
  await page.click(/^生成$/)
  assert.equal(calls.filter(c => c.path.includes('/image-render-submissions/')).length, 0)
  assert.ok(calls.filter(c => c.path === tierPath).length > before)
  await page.find('a-radio-group', /高质量/)!.attrs.onChange({ target: { value: 'STANDARD' } }); await flush()
  await page.click(/^生成$/); await page.click(/重新提交同一任务/)
  assert.notEqual(posts(calls, portraits)[0].key, posts(calls, portraits)[1].key)
  const requests = posts(calls, portraits); assert.deepEqual(requests.map(r => JSON.parse(String(r.body)).tier), ['PREMIUM', 'STANDARD', 'STANDARD']); assert.ok(requests[1].key); assert.equal(requests[1].key, requests[2].key)
})

test('形象对次数耗尽与不够高质量显示不同原因，仅耗尽时打开购买', async t => {
  let exhausted = false
  await fixture(t, c => c.path === tierPath ? config(true, 'PREMIUM') : c.method === 'POST' && c.path === portraits ? fail(429, 'IMAGE_QUOTA_EXCEEDED', exhausted ? closed : insufficient) : c.path.startsWith('/api/billing/quote?') ? { enabled: true, freeRemainingToday: exhausted ? 0 : 2 } : undefined)
  const page = await mount(t, personal); await page.click(/生成新形象/); await page.click(/^生成$/)
  const { useBillingStore } = await server.ssrLoadModule('/src/billing/store.ts'); const billing = useBillingStore(page.pinia)
  assert.match(text(page.root), /可以换成标准/); assert.equal(billing.purchase, '')
  exhausted = true; await page.click(/^生成$/); assert.equal(billing.purchase, 'image'); assert.doesNotMatch(text(page.root), /可以换成标准/)
})

test('两档均不可用时创作不能提交或许诺降级', async t => {
  const calls = await fixture(t, c => c.path === tierPath ? config(true, 'PREMIUM', false, false) : undefined)
  const page = await mount(t, maker, { outfit: 'look' }); await page.click(/平铺/); await page.click(/^生成/)
  assert.equal(posts(calls, `${creations}/preparations`).length, 0); assert.doesNotMatch(text(page.root), /会用标准完成|请换标准/)
})

test('相册按原请求档位的当前单位给上身图重试报价', async t => {
  await fixture(t, c => c.path === `${ootd}/jobs` ? [imageJob, { ...imageJob, id: 'failed', mediaUrl: null, status: 'FAILED' }] : undefined)
  const page = await mount(t, album); await page.click(/^重新生成$/)
  assert.match(page.confirms[0].okText + page.confirms[0].content, /5 次/)
})

test('原图降级后身材调整仍按原请求的高质量单位报价', async t => {
  await fixture(t, c => c.path === `${ootd}/jobs` ? [imageJob] : undefined)
  const page = await mount(t, album); await page.find('button')!.attrs.onClick(); await flush(); await page.click(/调节身材/)
  assert.match(text(page.find('p', /原图保留/)!), /5 次/)
})

test('两个相册卡片直接显示带实际扣次数的短标签', async t => {
  await fixture(t, c => c.path === `${ootd}/jobs` ? [imageJob] : c.path.startsWith(`${creations}/jobs?`) ? { items: [{ ...imageJob, id: 'creation', templateName: '平铺', createdAtMs: 1 }], page: 1, total: 1 } : undefined)
  const page = await mount(t, album)
  const cards = all(page.root).filter(n => n.tag === 'article' && String(n.attrs.class).includes('al-card')); assert.equal(cards.length, 2)
  for (const card of cards) assert.ok(all(card).some(n => /标准/.test(text(n)) && /2 次/.test(text(n)) && text(n).length <= 14), 'actual cost visible in a short label')
})

for (const mode of ['ootd', 'creation']) test(`${mode} 次数耗尽才进入购买，余额仅够标准时可改档`, async t => {
  let exhausted = false
  await fixture(t, c => {
    if (c.path === tierPath) return config(true, 'PREMIUM')
    if (mode === 'ootd' && c.path === creations + '/catalog') return { enabled: false, templates: [] }
    if (c.path.endsWith('/preparations')) return fail(429, 'IMAGE_QUOTA_EXCEEDED', exhausted ? closed : insufficient)
    if (c.path.startsWith('/api/billing/quote?')) return { enabled: true, freeRemainingToday: exhausted ? 0 : 2 }
  })
  const page = await mount(t, maker, { outfit: 'look' }); if (mode === 'creation') await page.click(/平铺/)
  const { useBillingStore } = await server.ssrLoadModule('/src/billing/store.ts'); const billing = useBillingStore(page.pinia)
  await page.click(/^生成/); assert.match(text(page.root), /可以换成标准/); assert.equal(billing.purchase, '')
  exhausted = true; await page.click(/^生成/); assert.equal(billing.purchase, 'image'); assert.doesNotMatch(text(page.root), /可以换成标准/)
})

test('作品再试一次回到选档，取消不预报固定次数', async t => {
  const jobs = ['FAILED', 'RUNNING'].map(status => ({ id: status, templateId: 'flat', templateName: '平铺', status, canCancel: true, canRecreate: true, createdAtMs: 5 }))
  await fixture(t, c => c.path.startsWith(`${creations}/jobs?`) ? { items: jobs, total: 2, page: 1 } : undefined)
  const page = await mount(t, album); await page.click(/^再试一次$/)
  assert.deepEqual(page.routes, [{ path: '/try', query: { again: 'FAILED', template: 'flat' } }]); assert.doesNotMatch(page.notices.join(' '), /[0-9]+ 次/)
  await page.click(/^取消$/); assert.doesNotMatch(page.confirms[0].content, /[0-9]+ 次/)
})
