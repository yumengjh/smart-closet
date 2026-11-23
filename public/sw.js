// 鱼搭 Service Worker：只缓存静态外壳与资源，接口、登录与流式请求始终直连网络。
const SHELL = 'yuda-shell-v1'
const ASSETS = 'yuda-assets-v1'
const STATIC = 'yuda-static-v1'
const KNOWN = [SHELL, ASSETS, STATIC, 'yuda-share-v1']
const ASSET_LIMIT = 160
// The pages show the 320 px copy; /yuda-logo.png (1 MB) is only the source of the PWA icons.
const PRECACHE = ['/index.html', '/manifest.webmanifest', '/yuda-logo-320.png', '/icons/icon-192.png', '/icons/icon-512.png']
const BYPASS = ['/api/', '/workflow/', '/studio/']
const STATIC_PREFIXES = ['/icons/', '/illustrations/', '/person-stickers/', '/licenses/']
const STATIC_FILES = ['/yuda-logo-320.png', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('yuda-') && !KNOWN.includes(key)) await caches.delete(key)
    await self.clients.claim()
  })())
})

// 系统分享到鱼搭（安卓已安装时，manifest share_target）：图片先放进本机的临时收件箱，跳到穿搭收藏页由页面上传，
// 上传后页面立即清空收件箱。图片不经过这里发给任何服务。
const SHARE_INBOX = 'yuda-share-v1'
const SHARE_LIMIT = 9
async function receiveShare(request) {
  try {
    const form = await request.formData()
    const files = form.getAll('files').filter(file => file instanceof File && file.type.startsWith('image/')).slice(0, SHARE_LIMIT)
    const inbox = await caches.open(SHARE_INBOX)
    for (const key of await inbox.keys()) await inbox.delete(key)
    let index = 0
    for (const file of files) await inbox.put(`/share-inbox/${index++}`, new Response(file, { headers: { 'content-type': file.type, 'x-name': encodeURIComponent(file.name || 'shared.png') } }))
    return Response.redirect(`/inspirations?shared=${files.length}`, 303)
  } catch {
    return Response.redirect('/inspirations?shared=0', 303)
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method === 'POST' && new URL(request.url).pathname === '/inspirations/share') { event.respondWith(receiveShare(request)); return }
  if (request.method !== 'GET' || request.headers.has('range')) return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || BYPASS.some(prefix => url.pathname.startsWith(prefix))) return
  if (request.mode === 'navigate') event.respondWith(navigate(request))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request))
  else if (STATIC_FILES.includes(url.pathname) || STATIC_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) event.respondWith(staleWhileRevalidate(request, event))
})

// 页面导航优先走网络，保证每次发布后拿到最新入口；离线时回退到最近一次的入口页。
async function navigate(request) {
  try {
    const response = await fetch(request)
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      const cache = await caches.open(SHELL)
      await cache.put('/index.html', response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match('/index.html', { cacheName: SHELL })
    if (cached) return cached
    throw error
  }
}

// 构建产物文件名带哈希，命中即可直接使用。
async function cacheFirst(request) {
  const cache = await caches.open(ASSETS)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    void trim(cache, ASSET_LIMIT)
  }
  return response
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(STATIC)
  const cached = await cache.match(request)
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone())
    return response
  })
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined))
    return cached
  }
  return refresh
}

async function trim(cache, limit) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key)
}
