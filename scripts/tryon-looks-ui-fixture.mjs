// 本地界面假数据：镜头试穿的“精选”与“跟着摆”。所有 /api 请求都在这里回答，不连真实账号、不连实时试穿服务。
// 用法：npm run dev:tryon-fixture，然后打开 http://127.0.0.1:5187/try?mode=live
// 切换场景：/_fixture/state?admin=1（管理员，多一套“未上架”）、garments=1（衣柜里有两件）、looks=0（没有精选）。
// 打开相机后本地预览与“跟着摆”可用（姿态识别文件需先 npm run setup:pose）；点“开始”会得到一条本地提示，不会计时。
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { lookPage, lookPreparation, lookSvg, posePresets } from './fixtures/tryon-looks.mjs'
process.chdir(fileURLToPath(new URL('../', import.meta.url)))
process.env.VITE_USE_MOCKS = 'false'

const garmentSvg = color => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320"><rect width="240" height="320" fill="#f2f1ed"/><path d="m70 80 35-15q15 20 30 0l35 15 25 40-25 18-10-14v125H80V124l-10 14-25-18Z" fill="${color}"/></svg>`
const GARMENTS = [['g-1', '蓝色衬衫', '#9eb4c8', 'TOP'], ['g-2', '卡其半裙', '#b1ac91', 'BOTTOM']]
const candidates = () => GARMENTS.map(([id, name, , role]) => ({ id, revision: 1, name, ready: true, reason: '', imageUrl: `/api/fixture-media/${id}.svg`, assetId: `asset-${id}`, wearingRole: role }))
const limits = { dailySeconds: 600, sessionSeconds: 300, startupSeconds: 30, firstFrameSeconds: 30, queueSeconds: 60, offerSeconds: 10, recordingSeconds: 60, recordingBytes: 50_000_000, storageBytes: 500_000_000 }
let admin = false, withGarments = false, withLooks = true

const fixture = { name: 'tryon-looks-local-only', configureServer(server) { server.middlewares.use(async (req, res, next) => {
  const url = new URL(req.url, 'http://localhost'), path = url.pathname
  if (!path.startsWith('/api/') && !path.startsWith('/_fixture/')) return next()
  const chunks = []; for await (const part of req) chunks.push(part)
  let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { /* 不是 JSON 的请求体 */ }
  const reply = (data, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(data)) }
  const svg = text => { res.setHeader('content-type', 'image/svg+xml'); res.setHeader('cache-control', 'no-store'); res.end(text) }
  if (path === '/_fixture/state') {
    if (url.searchParams.has('admin')) admin = url.searchParams.get('admin') === '1'
    if (url.searchParams.has('garments')) withGarments = url.searchParams.get('garments') === '1'
    if (url.searchParams.has('looks')) withLooks = url.searchParams.get('looks') !== '0'
    return reply({ admin, garments: withGarments, looks: withLooks })
  }
  if (path === '/api/auth/me') return reply({ username: 'tryon-fixture', role: admin ? 'ADMIN' : 'USER', mustChangePassword: false })
  if (path === '/api/auth/csrf') return reply({ token: 'local-fixture-token' })
  if (path === '/api/app/analytics') return reply({ enabled: false })
  if (path === '/api/tryon/capabilities') {
    const quota = { limit: 600, used: 0, reserved: 0, remaining: 600 }
    const tiers = process.env.TRYON_FIXTURE_TIERS === '1'
      ? { selectedTier: 'PREMIUM', tiers: ['STANDARD', 'PREMIUM'].map(tier => ({ tier, available: true, quota })) }
      : {}
    return reply({ enabled: true, ready: true, reason: '', quota, limits, hasHistory: false, ...tiers })
  }
  if (path === '/api/tryon/looks') return reply(lookPage({ admin, category: url.searchParams.get('category') || '', empty: !withLooks }))
  const lookImage = path.match(/^\/api\/tryon\/looks\/([\w-]+)\/image$/)
  if (lookImage) { const text = lookSvg(lookImage[1]); return text ? svg(text) : reply({ message: '没有这套' }, 404) }
  const media = path.match(/^\/api\/fixture-media\/([\w-]+)\.svg$/)
  if (media) { const g = GARMENTS.find(row => row[0] === media[1]); return g ? svg(garmentSvg(g[2])) : reply({}, 404) }
  if (path === '/api/tryon/garments') return reply(withGarments ? candidates() : [])
  if (path.startsWith('/api/tryon/garments/')) { const g = candidates().find(c => c.id === path.split('/').at(-1)); return g ? reply(g) : reply({ message: '没有这件' }, 404) }
  if (path === '/api/outfits') return reply([])
  if (path === '/api/tryon/history') return reply({ media: [], sessions: [] })
  if (path === '/api/tryon/preparations') {
    const look = lookPreparation(body.items)
    if (look) return reply(look.body, look.status)
    const items = (body.items || []).map(i => { const g = candidates().find(c => c.id === i.id); return { ...i, assetId: i.assetId || `asset-${i.id}`, hash: 'fixture', name: g?.name || '衣物', wearingRole: g?.wearingRole || null } })
    return reply({ id: 'fixture-preparation', revision: 1, expiresAtMs: Date.now() + 900_000, previewUrl: '/api/fixture-media/g-1.svg', items })
  }
  if (path === '/api/tryon/sessions') return reply({ message: '本地假数据不连接实时试穿，开始前的选择与预览都可以看' }, 503)
  if (path === '/api/ootd/poses') return reply({ presets: posePresets, mine: [], extractionsToday: 0, dailyExtractions: 20 })
  if (path === '/api/billing/wallet') return reply({ enabled: false, balance: 0, reserved: 0, entitlements: [], recent: [] })
  if (path === '/api/billing/quote') return reply({ enabled: false })
  if (path === '/api/quota') return reply({ image: { used: 0, limit: 20 }, agent: { used: 0, limit: 20 }, resetAtMs: Date.now() + 3600000 })
  return reply([])
}) } }
const server = await createServer({ root: process.cwd(), plugins: [fixture], server: { host: '127.0.0.1', port: 5187, strictPort: true } })
await server.listen()
console.log('Local try-on looks fixture: http://127.0.0.1:5187/try?mode=live — no real account or provider')
