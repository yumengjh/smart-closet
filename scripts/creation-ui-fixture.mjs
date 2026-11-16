// Local-only UI fixture. Every API request is answered here; no provider or real account is used.
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('../', import.meta.url)))
process.env.VITE_USE_MOCKS = 'false'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=', 'base64')
const shape = color => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320"><rect width="240" height="320" fill="#f2f1ed"/><path d="m70 80 35-15q15 20 30 0l35 15 25 40-25 18-10-14v125H80V124l-10 14-25-18Z" fill="${color}"/><text x="120" y="292" text-anchor="middle" font-size="12" fill="#666">本地流程示意</text></svg>`
const svgUrl = color => 'data:image/svg+xml,' + encodeURIComponent(shape(color))
const rawGarment = (id, color) => ({ id, revision: 1, name: '测试单品 ' + id, closetStatus: 'ACTIVE', status: 'ACTIVE', runs: [], automatic: null, overrides: {}, effective: { category: ['衬衫'], primaryColor: ['蓝色'] }, updatedAtMs: Date.now(), displayAssetId: 'asset-' + id, sourceAssetId: 'asset-' + id, displayUrl: svgUrl(color), sourceUrl: svgUrl(color), sourceOrigin: 'USER_UPLOAD', metadata: { category: ['衬衫'], primaryColor: ['蓝色'] }, attributes: { category: ['衬衫'], primaryColor: ['蓝色'] }, images: [{ id: 'asset-' + id, url: svgUrl(color), kind: 'INPUT', reviewStatus: 'APPROVED' }], category: ['衬衫'], primaryColor: ['蓝色'] })
const garments = [rawGarment('11111111-1111-4111-8111-111111111111', '#9eb4c8'), rawGarment('22222222-2222-4222-8222-222222222222', '#b1ac91')]
const templates = [['sunlit-flatlay', '暖阳平铺', false, '#b6b0a0'], ['dual-view-editorial', '双视角画报', true, '#8b9faf'], ['daily-outfit-share', '每日穿搭分享', true, '#b2a5ab']].map(([id, name, personRequired, color]) => ({ id, version: 1, name, personRequired, description: personRequired ? '换个角度，记录熟悉的搭配' : '光线、衣物，日常的一角', previewUrl: svgUrl(color), options: { light: ['DEFAULT', 'WARM', 'COOL'] }, maxGarments: 12, available: true, unavailableReason: null }))
let jobs = [], submits = 0, remoteGenerations = 0, loseNext = false, enabled = true
const keys = new Map()
const fixture = { name: 'creation-local-only', configureServer(server) { server.middlewares.use(async (req, res, next) => {
  const path = req.url.split('?')[0]
  if (!path.startsWith('/api/') && !path.startsWith('/_fixture/')) return next()
  const chunks = []; for await (const part of req) chunks.push(part)
  let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch {}
  const reply = (data, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)) }
  if (path === '/_fixture/state') return reply({ submits, remoteGenerations, keys: [...keys.keys()], jobs })
  if (path === '/_fixture/lose-next') { loseNext = true; return reply({ ok: true }) }
  if (path === '/_fixture/disable') { enabled = false; return reply({ ok: true }) }
  if (path === '/api/auth/me') return reply({ username: 'creation-fixture', role: 'USER', mustChangePassword: false })
  if (path === '/api/auth/csrf') return reply({ token: 'local-fixture-token' })
  if (path === '/api/creations/catalog') return reply({ enabled, templates })
  if (path === '/api/creations/preparations') return reply({ preparationId: 'fixture-preparation', expiresAt: Date.now() + 900000, quotaUnits: 1 })
  if (path === '/api/creations/jobs' && req.method === 'POST') {
    submits++; const key = req.headers['idempotency-key']; let job = keys.get(key)
    if (!job) { remoteGenerations++; job = { id: 'job-' + remoteGenerations, status: 'SUCCEEDED', templateId: 'sunlit-flatlay', templateVersion: 1, templateName: '暖阳平铺', createdAtMs: Date.now(), updatedAtMs: Date.now(), mediaUrl: svgUrl('#9eb4c8'), quotaUnits: 1, parentJobId: null, canCancel: false, canExport: true, canRecreate: true }; jobs.unshift(job); keys.set(key, job) }
    if (loseNext) { loseNext = false; return reply({detail:'本地模拟网关响应丢失'}, 502) }
    return reply(job)
  }
  if (path === '/api/creations/jobs') return reply({ items: jobs, total: jobs.length, page: 1, size: 12 })
  if (path.endsWith('/export') && path.startsWith('/api/creations/')) { res.setHeader('content-type', 'image/png'); res.end(png); return }
  if (path.endsWith('/feedback')) return reply({ ok: true })
  if (path.startsWith('/api/creations/jobs/') && req.method === 'DELETE') { jobs = []; return reply({ ok: true }) }
  if (path === '/api/closet/garments') return reply({ items: garments, total: garments.length, page: 1, size: 24 })
  if (path.startsWith('/api/garments/')) return reply(garments.find(item => item.id === path.split('/').at(-1)))
  if (path === '/api/me/person-baselines') return reply([{ id: 'person', revision: 1, status: 'CONFIRMED', name: '测试形象', currentDefault: true, mediaUrl: svgUrl('#bdc3c9'), profile: {}, createdAt: Date.now() }])
  if (path === '/api/ootd/poses') return reply({ presets: [], mine: [], extractionsToday: 0, dailyExtractions: 20 })
  if (path === '/api/quota') return reply({ image: { used: 0, limit: 20 }, agent: { used: 0, limit: 20 }, resetAtMs: Date.now() + 3600000 })
  if (path === '/api/billing/wallet') return reply({ enabled: false, balance: 0, reserved: 0, entitlements: [], recent: [] })
  if (path === '/api/billing/quote') return reply({ enabled: false })
  if (path === '/api/tryon/access') return reply({ enabled: false })
  return reply([])
}) } }
const server = await createServer({ root: process.cwd(), plugins: [fixture], server: { host: '127.0.0.1', port: 5179, strictPort: true } })
await server.listen()
console.log('Local creation fixture UI: http://127.0.0.1:5179/creation — no real provider or account')
