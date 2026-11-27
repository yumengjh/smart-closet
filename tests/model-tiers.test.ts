import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['src/services/modelTiers.ts'], bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env.VITE_USE_MOCKS': '"false"', 'import.meta.env.VITE_API_BASE_URL': '""' } })
// The data URL is produced by the runtime bundle with test-specific Vite environment values.
const { getModelTiers, putModelTiers, renderChoice, withRenderTier, legacyRenderUnits, tierFallbackMessage } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const config = { render: { enabled: true, selected: 'PREMIUM', degradeEnabled: true, tiers: [] }, realtime: { enabled: true, selected: 'STANDARD', tiers: [] } }

test('档位偏好使用账号接口并只提交变更字段', async t => {
  const calls: { url: string; init?: RequestInit }[] = []
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return String(url).endsWith('/csrf') ? Response.json({ token: 'token' }) : Response.json(config)
  })
  assert.deepEqual(await getModelTiers(), config)
  assert.deepEqual(await putModelTiers({ render: 'STANDARD' }), config)
  assert.equal(calls[0].url, '/api/me/model-tiers')
  assert.equal(calls[1].url, '/api/auth/csrf')
  assert.equal(calls[2].url, '/api/me/model-tiers')
  assert.equal(calls[2].init?.method, 'PUT')
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { render: 'STANDARD' })
})

test('上身图和形象请求按开关选择档位或原服务信息，创作关闭时保留原请求', () => {
  const old = { provider: 'legacy', model: 'legacy-model' }
  assert.deepEqual(renderChoice(false, 'PREMIUM', old), old)
  assert.deepEqual(renderChoice(true, 'PREMIUM', old), { tier: 'PREMIUM' })
  assert.deepEqual(renderChoice(true, 'STANDARD'), { tier: 'STANDARD' })
  const input = { templateId: 'effect', garments: [] }
  assert.equal(withRenderTier(input, false, 'PREMIUM'), input)
  assert.deepEqual(withRenderTier(input, true, 'PREMIUM'), { ...input, tier: 'PREMIUM' })
})

test('档位关闭时按服务端高质量单位显示旧请求的次数', () => {
  const singleTier = { ...config.render, enabled: false, selected: 'STANDARD', tiers: [{ tier: 'STANDARD', units: 1 }, { tier: 'PREMIUM', units: 3 }] }
  assert.equal(legacyRenderUnits(singleTier), 3)
  assert.equal(legacyRenderUnits(singleTier, 2), 6)
  assert.equal(legacyRenderUnits({ ...singleTier, tiers: [{ tier: 'PREMIUM', units: 0 }] }), 0)
  assert.equal(legacyRenderUnits(null), 1)
})

test('降级结果使用实际次数，不猜测缺失值', () => {
  assert.equal(tierFallbackMessage({ tierRequested: 'PREMIUM', tierUsed: 'STANDARD', quotaUnits: 4 }), '高质量暂时不可用，这张用标准完成，只用了 4 次')
  assert.equal(tierFallbackMessage({ tierRequested: 'PREMIUM', tierUsed: 'STANDARD' }), '高质量暂时不可用，这张用标准完成')
  assert.equal(tierFallbackMessage({ tierRequested: 'PREMIUM', tierUsed: 'PREMIUM', quotaUnits: 3 }), '')
  assert.equal(tierFallbackMessage({}), '')
})
