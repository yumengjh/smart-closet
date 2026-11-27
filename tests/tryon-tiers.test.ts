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
    assert.match(realtimeTierNotice([standard, premium], 'PREMIUM'), /暂未开放/)
    assert.match(realtimeTierNotice([standard, { ...premium, available: false, reason: 'QUOTA' }], 'PREMIUM'), /时长已用完/)
    assert.match(realtimeTierNotice([standard, { ...premium, available: false, reason: 'DISABLED' }], 'PREMIUM'), /暂未开放/)
    assert.match(realtimeTierNotice([standard, { ...premium, available: false, reason: 'UNAVAILABLE' }], 'PREMIUM'), /暂时不可用/)
  } finally { await server.close() }
})
