export type Entitlement = { id: string; source: string; imageDailyLimit: number | null; agentDailyLimit: number | null; startsAtMs: number; endsAtMs: number }
export type Wallet = { enabled: boolean; balance: number; reserved: number; entitlements: Entitlement[]; recent: { id: string; kind: string; points: number; note: string | null; tier: string | null; createdAtMs: number }[] }
export type Redeemed = { batchName: string; points: number; balance: number; entitlementEndsAtMs: number | null }
export type NewBatch = { name: string; points: number; unitPriceMicro: number; currency: string | null; imageDailyLimit: number | null; agentDailyLimit: number | null; entitlementDays: number | null; quantity: number; validFromMs: number | null; validUntilMs: number | null }
export type Batch = NewBatch & { id: string; batchNo: string; status: string; available: number; redeemed: number; createdAtMs: number }
export type CodeView = { id: string; mask: string; status: string; redeemedBy: string | null; redeemedAtMs: number | null }
export const ledgerLabels: Record<string, string> = { TOPUP: '充值', GRANT: '赠送', RESERVE: '使用中', SETTLE: '已使用', RELEASE: '已退回', EXPIRE: '过期', ADJUST: '调整' }
export const sourceLabels: Record<string, string> = { SUBSCRIPTION: '订阅权益', ADMIN: '管理员发放', PROMO: '活动赠送' }
export function formatPoints(points: number, signed = false) { return `${signed && points > 0 ? '+' : ''}${points.toLocaleString('zh-CN')} 点` }
/** Decimal input -> integer micro units, avoiding binary multiplication drift. */
export function priceToMicro(value: string | number): number {
  const text = String(value)
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new Error('单价需为非负金额，最多六位小数。')
  const [whole, fraction = ''] = text.split('.')
  const result = Number(BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, '0')))
  if (!Number.isSafeInteger(result)) throw new Error('单价过大，请缩小金额。')
  return result
}
export function formatPrice(micro: number, currency: string | null) { return micro === 0 ? '赠送' : `${(micro / 1_000_000).toLocaleString('zh-CN', { maximumFractionDigits: 6 })} ${currency || ''}/点` }
export function normalizeCode(value: string) { return value.replace(/[\s-]+/g, '').toUpperCase() }
export function entitlementState(ent: Pick<Entitlement, 'startsAtMs' | 'endsAtMs'>, now: number) {
  if (ent.startsAtMs > now || ent.endsAtMs <= now) return 'inactive'
  return ent.endsAtMs - now <= 3 * 86_400_000 ? 'expiring' : 'active'
}
export function retryDeadline(header: string | null | undefined, now: number) {
  const seconds = Number(header)
  return now + (header && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60) * 1000
}
export function secondsRemaining(deadline: number, now: number) { return Math.max(0, Math.ceil((deadline - now) / 1000)) }
export function billingHidden(error: unknown) { const status = (error as { status?: number } | null)?.status; return status === 403 || status === 404 }
const redeemMessages: Record<string, string> = {
  REDEEM_INVALID: '兑换码无效或已被使用', REDEEM_THROTTLED: '失败次数过多，请稍后再试。', BILLING_DISABLED: '收费暂未开放',
  REDEEM_NOT_CONFIGURED: '兑换功能尚未配置', IDEMPOTENCY_CONFLICT: '请求发生冲突，请重新提交。',
}
export function redeemError(error: unknown) {
  const failure = error as { message?: string; code?: string } | null
  return failure?.message || redeemMessages[failure?.code || ''] || '兑换未能完成，请稍后重试。'
}

export type Product = { id: string; kind: 'POINTS' | 'SUBSCRIPTION'; name: string; currency: string; priceMinor: number; points: number; entDays: number | null; imageDailyLimit: number | null; agentDailyLimit: number | null }
export type OrderView = { id: string; productName: string; kind: string; currency: string; amountMinor: number; points: number; channel: string; status: string; note: string | null; createdAtMs: number; expiresAtMs: number; fulfilledAtMs: number | null }
export type CreatedOrder = { order: OrderView; payUrl: string | null; sandbox: boolean }
export const orderStatusLabels: Record<string, string> = { CREATED: '待支付', PAID: '处理中', FULFILLED: '已到账', CLOSED: '已关闭', FAILED: '支付异常', DISPUTED: '已撤销' }
const symbols: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥' }
/** Amounts arrive in the currency's minor unit (fen, cent); JPY has none. */
export function formatMinor(amountMinor: number, currency: string) {
  const digits = currency === 'JPY' ? 0 : 2
  const value = (amountMinor / 10 ** digits).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return symbols[currency] ? `${symbols[currency]}${value}` : `${value} ${currency}`
}
export function productSummary(p: Pick<Product, 'kind' | 'points' | 'entDays' | 'imageDailyLimit' | 'agentDailyLimit'>) {
  if (p.kind === 'POINTS') return formatPoints(p.points)
  const parts = [p.imageDailyLimit !== null ? `上身图等图片每日 ${p.imageDailyLimit} 次` : '', p.agentDailyLimit !== null ? `助手每日 ${p.agentDailyLimit} 次` : ''].filter(Boolean)
  return `${p.entDays} 天 · ${parts.join('，')}`
}
const orderMessages: Record<string, string> = {
  PAYMENT_UNAVAILABLE: '暂时没有可用的支付方式。', TOO_MANY_OPEN_ORDERS: '未支付的订单太多，请先完成或等待超时关闭。', PRODUCT_NOT_FOUND: '这个商品已下架。',
  BILLING_DISABLED: '收费暂未开放。', IDEMPOTENCY_CONFLICT: '请求发生冲突，请重新提交。',
}
export function orderError(error: unknown) {
  const failure = error as { message?: string; code?: string } | null
  return failure?.message || orderMessages[failure?.code || ''] || '下单未能完成，请稍后重试。'
}

export type Quote = { enabled: false } | {
  enabled: true
  showPrices: boolean
  freeRemainingToday: number
  dailyLimit: number
  unitPoints?: number
  balance: number
  entitlementEndsAtMs: number | null
}
/** A disabled or hidden quote must leave the existing action label intact. */
export function imageActionLabel(quote: Quote | undefined) {
  return quote?.enabled ? `生成上身图 · 今天还能 ${quote.freeRemainingToday} 次` : '生成上身图'
}
export function realtimePrice(quote: Quote | undefined) {
  return quote?.enabled && quote.showPrices && (quote.unitPoints || 0) > 0 ? `每分钟 ${Number((quote.unitPoints! * 60).toFixed(3))} 点` : ''
}
export function subscriptionsForImages(products: Product[]) {
  return products.filter(product => product.kind === 'SUBSCRIPTION' && product.imageDailyLimit !== null)
}
