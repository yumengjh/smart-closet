// Local UI states with synthetic PNGs. No real account, private media or model/provider calls.
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
process.chdir(fileURLToPath(new URL('../', import.meta.url)))
process.env.VITE_USE_MOCKS = 'false'

function png(color) {
  const width = 240, height = 320, pixels = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = y > 60 && y < 260 && x > 55 && x < 185
    const rgb = inside ? color : [241, 242, 244]
    const offset = y * (width * 3 + 1) + 1 + x * 3
    rgb.forEach((v, i) => { pixels[offset + i] = v })
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), crc = Buffer.alloc(4)
    size.writeUInt32BE(data.length)
    let value = 0xffffffff
    for (const byte of body) { value ^= byte; for (let n = 0; n < 8; n++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0) }
    crc.writeUInt32BE((value ^ 0xffffffff) >>> 0)
    return Buffer.concat([size, body, crc])
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
const images = [png([102, 135, 164]), png([158, 117, 127])]
let mode = 'published', loginAttempts = 0, showcaseRequests = 0
const fixture = { name: 'showcase-local-only', configureServer(server) { server.middlewares.use(async (req, res, next) => {
  const url = new URL(req.url, 'http://localhost'), path = url.pathname
  if (!path.startsWith('/api/') && !path.startsWith('/_fixture/')) return next()
  const reply = (data, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(data)) }
  if (path === '/_fixture/state') {
    if (url.searchParams.has('mode')) mode = url.searchParams.get('mode')
    return reply({ mode, loginAttempts, showcaseRequests, remoteGenerations: 0 })
  }
  if (path === '/api/auth/me') return reply({ code: 'UNAUTHORIZED' }, 401)
  if (path === '/api/auth/registration') return reply({ mode: 'OPEN' })
  if (path === '/api/auth/csrf') return reply({ token: 'local-token' })
  if (path === '/api/auth/login') { loginAttempts++; return reply({ message: '账号或密码不正确' }, 401) }
  if (path === '/api/public/creations/showcases') {
    showcaseRequests++
    if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 5500))
    if (mode === 'error' || mode === 'unauthorized') return reply({ detail: '本地失败场景' }, mode === 'error' ? 503 : 401)
    const items = ['empty', 'retired', 'slow'].includes(mode) ? [] : Array.from({ length: 12 }, (_, i) => ({ id: `official-${i}`, title: `本地精选示意 ${i + 1}`, description: '合成图，仅用于验证界面布局与失败回退', imageUrl: `/api/public/creations/showcases/official-${i}/image`, aiGenerated: true }))
    return reply({ items })
  }
  if (/^\/api\/public\/creations\/showcases\/official-\d+\/image$/.test(path)) {
    if (mode === 'broken' || mode === 'retired') return reply({}, 404)
    res.setHeader('content-type', 'image/png'); res.setHeader('cache-control', 'no-store'); res.end(images[Number(path.match(/official-(\d+)/)[1]) % 2]); return
  }
  return reply({ detail: '未定义的本地场景' }, 404)
}) } }
const server = await createServer({ root: process.cwd(), plugins: [fixture], server: { host: '127.0.0.1', port: 5186, strictPort: true } })
await server.listen()
console.log('Showcase fixture: http://127.0.0.1:5186/login (synthetic PNGs, no model calls)')
