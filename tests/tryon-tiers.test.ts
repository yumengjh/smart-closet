import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

test('实时档位提示与会话请求', async () => {
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { realtimeTierNotice, sessionStartBody } = await server.ssrLoadModule('/src/tryon/api.ts')
    const quota = { limit: 300, used: 0, reserved: 0, remaining: 300 }
    const standard = { tier: 'STANDARD', available: true, quota }
    const premium = { tier: 'PREMIUM', available: true, quota }
    assert.deepEqual(sessionStartBody({ id: 'p', revision: 2 }), { preparationId: 'p', revision: 2 })
    assert.deepEqual(sessionStartBody({ id: 'p', revision: 2 }, 'STANDARD'), { preparationId: 'p', revision: 2, tier: 'STANDARD' })
    assert.deepEqual(sessionStartBody({ id: 'p', revision: 2 }, 'PREMIUM'), { preparationId: 'p', revision: 2, tier: 'PREMIUM' })
    assert.equal(realtimeTierNotice([standard], 'STANDARD'), '')
    assert.equal(realtimeTierNotice([standard, premium], 'STANDARD'), '')
    assert.equal(realtimeTierNotice([standard, premium], 'PREMIUM'), '')
    assert.equal(realtimeTierNotice([standard, { ...premium, available: false, reason: 'QUOTA' }], 'PREMIUM'), '今天的高质量时长已用完，可以换成标准继续。')
    assert.equal(realtimeTierNotice([standard, { ...premium, available: false, reason: 'DISABLED' }], 'PREMIUM'), '高质量暂未开放，可以换成标准。')
    assert.equal(realtimeTierNotice([standard, { ...premium, available: false, reason: 'UNAVAILABLE' }], 'PREMIUM'), '高质量暂时不可用，可以换成标准。')
    assert.doesNotMatch(realtimeTierNotice([{ ...standard, available: false }, { ...premium, available: false }], 'PREMIUM'), /换成标准/)
    assert.match(realtimeTierNotice([{ ...standard, available: false, reason: 'QUOTA' }], 'STANDARD'), /时长已用完/)
    assert.equal(realtimeTierNotice([premium], 'PREMIUM'), '')
    assert.match(realtimeTierNotice([standard], 'PREMIUM'), /暂不可用/)
  } finally { await server.close() }
})

test('本机同意与网络提示独立保存，存储失败不视为已同意', async () => {
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
    const { premiumConsent, savePremiumConsent, premiumNetworkNoticeNeeded, savePremiumNetworkNotice } = await server.ssrLoadModule('/src/tryon/consent.ts')
    assert.equal(premiumConsent(), false)
    assert.equal(premiumNetworkNoticeNeeded(), true)
    savePremiumNetworkNotice()
    assert.equal(premiumNetworkNoticeNeeded(), false)
    assert.equal(premiumConsent(), false)
    assert.equal(savePremiumConsent(), true)
    assert.equal(premiumConsent(), true)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } } })
    assert.equal(premiumConsent(), false)
    assert.equal(savePremiumConsent(), false)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage')
    await server.close()
  }
})

test('令牌请求不发送请求体', async () => {
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const originalFetch = globalThis.fetch
  const calls: { url: string; init?: RequestInit }[] = []
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init })
      return new Response(JSON.stringify(url.includes('/csrf') ? { token: 'csrf' } : { vendor: 'DECART', token: 'temporary', model: 'model', maxSessionSeconds: 30, expiresAtMs: 123, tokenTtlSeconds: 60 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    const { tryOnApi } = await server.ssrLoadModule('/src/tryon/api.ts')
    const result = await tryOnApi.decartToken('session-id')
    assert.equal(result.vendor, 'DECART')
    const call = calls.find(c => c.url.endsWith('/api/tryon/sessions/session-id/decart/token'))
    assert.ok(call)
    assert.equal(call.init?.method, 'POST')
    assert.equal(call.init?.body, undefined)
  } finally { globalThis.fetch = originalFetch; await server.close() }
})
