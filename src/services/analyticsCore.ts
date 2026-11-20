// 行为分析的纯逻辑（路由归一化、校验、队列、启停判断），不碰网络与浏览器对象，方便单测。
// 契约与事件表以 smart-closet-server 的 analytics/events.json 为准（npm run sync:analytics）。
import type { AnalyticsEventSpec } from './analyticsEvents.generated.ts'

export const OPT_OUT_KEY = 'yuda.analytics.optout.v1'
export const QUEUE_LIMIT = 100
export const BATCH_SIZE = 20
export const FLUSH_MS = 5000

/** 设计 3.4.1：POST /api/t 的单条事件。 */
export type WireEvent =
  | { kind: 'page'; path: string; referrer?: string; screen?: string; language?: string }
  | { kind: 'event'; name: string; path: string; props: Record<string, string | boolean>; screen?: string; language?: string }

export type ActivationInput = {
  mocks: boolean
  doNotTrack: boolean
  /** GET /api/app/analytics 的 enabled；未取到按 false。 */
  appEnabled: boolean
  admin: boolean
  optOut: boolean
}
/** 五种停用情况：mock、请勿追踪、服务端未启用、管理员、用户关闭。 */
export const analyticsActive = (s: ActivationInput) => !s.mocks && !s.doNotTrack && s.appEnabled && !s.admin && !s.optOut

export function doNotTrack(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined): boolean {
  return nav?.doNotTrack === '1' || nav?.globalPrivacyControl === true
}

/**
 * 页面路由模板：取 matched 最后一项的 path；/settings 带 ?section=<key> 时变为 /settings/<key>。
 * 不在允许列表（含所有 /admin*）时返回 null，调用方不报。
 */
export function pageTemplate(matchedPath: string | undefined, section: unknown, pages: readonly { path: string }[]): string | null {
  if (!matchedPath || matchedPath === '/admin' || matchedPath.startsWith('/admin/')) return null
  const path = matchedPath === '/settings' && typeof section === 'string' && section ? `/settings/${section}` : matchedPath
  return pages.some(page => page.path === path) ? path : null
}

/** 只有外站才带来源，且只留 origin。 */
export function externalReferrer(referrer: string, ownOrigin: string): string | undefined {
  if (!referrer) return undefined
  try {
    const url = new URL(referrer)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.origin === ownOrigin ? undefined : url.origin
  } catch { return undefined }
}

export const screenSize = (width: number, height: number) => `${Math.round(width)}x${Math.round(height)}`

/** 属性集合必须与定义完全一致，类型与枚举都要对上。 */
export function validProps(spec: AnalyticsEventSpec | undefined, props: unknown): props is Record<string, string | boolean> {
  if (!spec || typeof props !== 'object' || props === null || Array.isArray(props)) return false
  const given = Object.keys(props)
  const wanted = Object.keys(spec.props)
  if (given.length !== wanted.length || !wanted.every(key => given.includes(key))) return false
  const values = props as Record<string, unknown>
  return wanted.every(key => {
    const rule = spec.props[key]
    const value = values[key]
    return 'enum' in rule ? typeof value === 'string' && rule.enum.includes(value) : typeof value === 'boolean'
  })
}

/** 事件是否可以上报：已登记、属性合格，收费事件只在收费开启时发。 */
export function validEvent(specs: Readonly<Record<string, AnalyticsEventSpec>>, name: string, props: unknown, billingOn: boolean): boolean {
  const spec = Object.hasOwn(specs, name) ? specs[name] : undefined
  if (!spec || (spec.billing && !billingOn)) return false
  return validProps(spec, props)
}

/** 有上限的事件队列：超过上限丢最早的；满一批或定时由调用方取走。 */
export class EventQueue {
  private items: WireEvent[] = []
  constructor(private readonly limit = QUEUE_LIMIT, private readonly batch = BATCH_SIZE) {}
  get size() { return this.items.length }
  /** 返回是否已攒满一批。 */
  push(event: WireEvent): boolean {
    this.items.push(event)
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit)
    return this.items.length >= this.batch
  }
  /** 取出最多一批，其余留在队列里。 */
  take(): WireEvent[] { return this.items.splice(0, this.batch) }
  clear() { this.items = [] }
}
