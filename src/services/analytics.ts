// 行为分析的唯一出口（smart-closet-server#279，设计 docs/design/2026-11-19-行为分析埋点：Umami接入设计.md）。
// 浏览器只把事件发给鱼搭自己的 POST /api/t，由服务端校验后转发；这里不加载任何外部脚本。
// 事件与页面以服务端 events.json 为准（analyticsEvents.generated.ts）；属性只能是枚举或布尔。
// 一切失败都静默：不重试、不抛错、不弹提示，也不能影响任何其他请求。
import { ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import { accountHeaders } from '../domain/accountSession'
import type { SessionUser } from '../domain/session'
import { analyticsEventSpecs, analyticsPages, type AnalyticsEventName, type AnalyticsEventProps } from './analyticsEvents.generated'
import {
  EventQueue, FLUSH_MS, OPT_OUT_KEY, analyticsActive, doNotTrack, externalReferrer, pageTemplate, screenSize, validEvent,
  type WireEvent,
} from './analyticsCore'
import { closetApi, currentCsrfToken, ensureCsrfToken, request, usingMocks } from './api'
import { apiUrl } from './urls'
import { useBillingStore } from '../billing/store'

type Navigator2 = Navigator & { globalPrivacyControl?: boolean }

/** “我的 → 账号与安全”的开关：统计已启用（服务端 enabled、非 mock、非请勿追踪）时才显示。 */
export const analyticsAvailable = ref(false)
/** 用户是否关闭了统计（未登录时来自本地键，登录后来自账号）。 */
export const analyticsOptOut = ref(readLocalOptOut())

const queue = new EventQueue()
let timer: ReturnType<typeof setTimeout> | undefined
let appEnabled: boolean | null = null
let userKnown = false
let admin = false
let username: string | null = null
let currentUser: SessionUser | null = null
let started = false
let firstPageSent = false
let currentPath: string | null = null
/** 服务端开关与账号都还没确定时，先把事件攒在这里；确定后启用就放行，否则丢弃。 */
let waiting: Array<() => void> = []

const dnt = () => doNotTrack(typeof navigator === 'undefined' ? undefined : navigator as Navigator2)
const blocked = () => usingMocks || dnt()
const known = () => appEnabled !== null && userKnown
const active = () => analyticsActive({ mocks: usingMocks, doNotTrack: dnt(), appEnabled: appEnabled === true, admin, optOut: analyticsOptOut.value })

function readLocalOptOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1' } catch { return false }
}
function writeLocalOptOut(flag: boolean) {
  try { if (flag) localStorage.setItem(OPT_OUT_KEY, '1'); else localStorage.removeItem(OPT_OUT_KEY) } catch { /* 存储不可用时本次访问仍然生效 */ }
}
function billingOn(): boolean {
  try { return useBillingStore().image?.enabled === true } catch { return false }
}
const warn = (message: string) => { if (import.meta.env?.DEV) console.warn(`[analytics] ${message}`) }

/** 状态变化后：已确定且停用就清空队列与等待事件；已确定且启用就放行等待的事件。 */
function settle() {
  analyticsAvailable.value = appEnabled === true && !usingMocks && !blocked()
  if (!known()) return
  if (!active()) { queue.clear(); waiting = []; clearTimer(); return }
  const run = waiting
  waiting = []
  for (const job of run) job()
}
function clearTimer() { if (timer !== undefined) { clearTimeout(timer); timer = undefined } }

/** 启动时调用一次：mock 与请勿追踪什么都不做，也不发请求；否则读 /api/app/analytics。 */
export async function init() {
  if (started || blocked()) return
  started = true
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(true) })
    window.addEventListener('pagehide', () => { void flush(true) })
  }
  try { appEnabled = (await request<{ enabled?: boolean }>('/api/app/analytics')).enabled === true }
  catch { appEnabled = false }
  settle()
}

/** 登录、退出、切换账号时调用（传入 /api/auth/me 的结果，退出传 null）。 */
export function setUser(user: SessionUser | null) {
  if (usingMocks) return
  const next = user?.username ?? null
  const changed = userKnown && next !== username
  username = next
  currentUser = user
  admin = user?.role === 'ADMIN'
  analyticsOptOut.value = user ? user.analytics?.optOut === true : readLocalOptOut()
  userKnown = true
  // 换了人：先把上一个人的事件发出去再继续，不让它们混进新账号。
  if (changed && known() && active() && queue.size) void flush(true)
  settle()
}

/** 用户在“账号与安全”里切换：立即生效；登录后保存到账号，未登录写本地键。 */
export async function setOptOut(flag: boolean) {
  analyticsOptOut.value = flag
  if (currentUser && !admin) currentUser.analytics = { optOut: flag }
  settle()
  if (username) {
    try { await closetApi.savePreferences({ analyticsOptOut: flag }) } catch { /* 本次访问仍按新选择，不打扰用户 */ }
  } else writeLocalOptOut(flag)
}

/** router.afterEach 调用。 */
export function page(route: Pick<RouteLocationNormalized, 'matched' | 'query'>) {
  if (usingMocks) return
  const path = pageTemplate(route.matched[route.matched.length - 1]?.path, route.query.section, analyticsPages)
  currentPath = path
  if (!path) return
  const first = !firstPageSent
  firstPageSent = true
  deliver(() => {
    const event: WireEvent = { kind: 'page', path, ...common() }
    if (first) {
      const referrer = externalReferrer(document.referrer, window.location.origin)
      if (referrer) event.referrer = referrer
    }
    enqueue(event)
  })
}

/** 上报一个事件；类型由事件表约束，运行时再校验一遍，不合格丢弃。 */
export function track<N extends AnalyticsEventName>(name: N, props: AnalyticsEventProps[N] = {} as AnalyticsEventProps[N]) {
  if (usingMocks) return
  const path = currentPath
  deliver(() => {
    if (!path) return
    if (!validEvent(analyticsEventSpecs, name, props, billingOn())) { warn(`丢弃不合格的事件 ${name}`); return }
    enqueue({ kind: 'event', name, path, props: { ...props } as Record<string, string | boolean>, ...common() })
  })
}

function deliver(job: () => void) {
  if (blocked()) return
  if (!known()) { if (waiting.length < 100) waiting.push(job); return }
  if (active()) job()
}
function common() {
  const out: { screen?: string; language?: string } = {}
  if (typeof screen !== 'undefined' && screen.width && screen.height) out.screen = screenSize(screen.width, screen.height)
  if (typeof navigator !== 'undefined' && navigator.language) out.language = navigator.language
  return out
}
function enqueue(event: WireEvent) {
  if (queue.push(event)) void flush()
  else if (timer === undefined) timer = setTimeout(() => { timer = undefined; void flush() }, FLUSH_MS)
}

async function flush(unloading = false) {
  clearTimer()
  while (queue.size && active()) {
    const events = queue.take()
    try {
      // 页面关闭时来不及取令牌，用手头已有的；平时复用 api.ts 的同一把 CSRF 令牌。
      const token = unloading ? currentCsrfToken() : await ensureCsrfToken()
      if (!active()) return
      const path = '/api/t'
      const sending = fetch(apiUrl(path), {
        method: 'POST', credentials: 'include', keepalive: true,
        headers: { ...accountHeaders(path), 'Content-Type': 'application/json', ...(token ? { 'X-XSRF-TOKEN': token } : {}) },
        body: JSON.stringify({ events }),
      })
      // 页面正在关闭：不等响应，剩余批次紧接着发出。
      if (unloading) void sending.catch(() => {}); else await sending
    } catch { /* 失败不重试、不提示 */ }
  }
}
