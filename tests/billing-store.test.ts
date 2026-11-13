import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

test('切换账号后旧报价不能写回，重复刷新合并，关闭收费清空购买入口', async () => {
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { billingApi } = await server.ssrLoadModule('/src/billing/api.ts')
    const { useBillingStore } = await server.ssrLoadModule('/src/billing/store.ts')
    setActivePinia(createPinia())
    const store = useBillingStore()
    const oldRequests: { kind: string; resolve: (value: unknown) => void }[] = []
    billingApi.wallet = () => new Promise(resolve => oldRequests.push({ kind: 'wallet', resolve }))
    billingApi.quote = (tier: string) => new Promise(resolve => oldRequests.push({ kind: tier, resolve }))
    const old = store.refresh()
    const repeated = store.refresh()
    assert.equal(oldRequests.length, 2)
    store.reset()
    billingApi.wallet = async () => ({ enabled: true, balance: 12, reserved: 0, recent: [], entitlements: [] })
    billingApi.quote = async () => ({ enabled: true, showPrices: true, freeRemainingToday: 5, dailyLimit: 20, balance: 12, entitlementEndsAtMs: null })
    await store.refresh()
    for (const request of oldRequests) request.resolve({ enabled: true, balance: 999 })
    await Promise.all([old, repeated])
    assert.equal(store.image.balance, 12)
    store.purchase = 'image'
    billingApi.quote = async () => ({ enabled: false })
    await store.refresh()
    assert.equal(store.purchase, '')
    assert.deepEqual(store.image, { enabled: false })
    assert.deepEqual(store.realtime, { enabled: false })
    billingApi.wallet = async () => { throw new Error('offline') }
    billingApi.quote = async () => { throw new Error('offline') }
    await store.refresh()
    assert.match(store.error, /重试/)
    assert.equal(store.loading, false)
  } finally { await server.close() }
})
