import test from 'node:test'
import assert from 'node:assert/strict'
import { billingHidden, entitlementState, formatPoints, formatPrice, normalizeCode, priceToMicro, redeemError, retryDeadline, secondsRemaining } from '../src/billing/model.ts'
import { ApiError } from '../src/domain/apiError.ts'

test('点数带符号，单价按百万分之一换算且拒绝丢失精度', () => {
  assert.equal(formatPoints(1234), '1,234 点'); assert.equal(formatPoints(-50, true), '-50 点'); assert.equal(formatPoints(5, true), '+5 点')
  assert.equal(priceToMicro('0.000001'), 1); assert.equal(priceToMicro('1.234567'), 1234567); assert.equal(priceToMicro(0), 0)
  assert.throws(() => priceToMicro('0.0000001')); assert.throws(() => priceToMicro('-1')); assert.throws(() => priceToMicro('9999999999999'))
  assert.equal(formatPrice(1234567, 'CNY'), '1.234567 CNY/点'); assert.equal(formatPrice(0, null), '赠送')
})
test('兑换码容忍空格、小写、连字符', () => { assert.equal(normalizeCode(' yd1-ab cd-ef\n'), 'YD1ABCDEF') })
test('各错误码回退文案及后端中文优先', () => {
  for (const code of ['REDEEM_INVALID', 'REDEEM_THROTTLED', 'BILLING_DISABLED', 'REDEEM_NOT_CONFIGURED', 'IDEMPOTENCY_CONFLICT']) {
    assert.ok(redeemError({ code })); assert.equal(redeemError({ code, message: '服务端中文' }), '服务端中文')
  }
  assert.equal(redeemError({ code: 'REDEEM_INVALID' }), '兑换码无效或已被使用')
})
test('429 到时才能提交，后台恢复按绝对时间计算', () => {
  const deadline = retryDeadline('120', 1000)
  assert.equal(deadline, 121000); assert.equal(secondsRemaining(deadline, 1001), 120)
  assert.equal(secondsRemaining(deadline, 120999), 1); assert.equal(secondsRemaining(deadline, 121000), 0); assert.equal(secondsRemaining(deadline, 500000), 0)
  assert.equal(retryDeadline(null, 1000), 61000)
})
test('权益开始包含边界，到期排除边界，三天内温和提示', () => {
  const now = 10000; const day = 86400000
  assert.equal(entitlementState({ startsAtMs: now + 1, endsAtMs: now + day }, now), 'inactive')
  assert.equal(entitlementState({ startsAtMs: 0, endsAtMs: now }, now), 'inactive')
  assert.equal(entitlementState({ startsAtMs: now, endsAtMs: now + 3 * day }, now), 'expiring')
  assert.equal(entitlementState({ startsAtMs: 0, endsAtMs: now + 3 * day + 1 }, now), 'active')
})
test('仅403/404表示隐藏，其他失败不可误判收费关闭', () => {
  for (const status of [403, 404]) assert.equal(billingHidden(new ApiError('不可用', status)), true)
  for (const status of [400, 429, 503]) assert.equal(billingHidden(new ApiError('不可用', status)), false)
})

import { formatMinor, orderError, orderStatusLabels, productSummary } from '../src/billing/model.ts'
test('金额按最小货币单位换算，日元没有小数', () => {
  assert.equal(formatMinor(1000, 'CNY'), '¥10.00'); assert.equal(formatMinor(1999, 'USD'), '$19.99'); assert.equal(formatMinor(500, 'JPY'), '¥500')
  assert.equal(formatMinor(123456, 'CNY'), '¥1,234.56'); assert.equal(formatMinor(250, 'CHF'), '2.50 CHF')
})
test('商品摘要区分点数包与订阅，订单状态都有中文', () => {
  assert.equal(productSummary({ kind: 'POINTS', points: 1200, entDays: null, imageDailyLimit: null, agentDailyLimit: null }), '1,200 点')
  assert.equal(productSummary({ kind: 'SUBSCRIPTION', points: 0, entDays: 30, imageDailyLimit: 40, agentDailyLimit: 60 }), '30 天 · 上身图等图片每日 40 次，助手每日 60 次')
  assert.equal(productSummary({ kind: 'SUBSCRIPTION', points: 0, entDays: 7, imageDailyLimit: null, agentDailyLimit: 20 }), '7 天 · 助手每日 20 次')
  for (const status of ['CREATED', 'PAID', 'FULFILLED', 'CLOSED', 'FAILED', 'DISPUTED']) assert.ok(orderStatusLabels[status])
})
test('下单错误优先用服务器的话，否则按代码给出固定提示', () => {
  assert.equal(orderError({ code: 'TOO_MANY_OPEN_ORDERS' }), '未支付的订单太多，请先完成或等待超时关闭。'); assert.equal(orderError({ message: '自定义' }), '自定义'); assert.equal(orderError(null), '下单未能完成，请稍后重试。')
})

import { imageActionLabel, realtimePrice, subscriptionsForImages, ledgerLabels, type Quote, type Product } from '../src/billing/model.ts'
test('收费关闭和报价不可用时保留原按钮，隐藏价格时不泄漏单价', () => {
  assert.equal(imageActionLabel(undefined), '生成上身图')
  assert.equal(imageActionLabel({ enabled: false }), '生成上身图')
  assert.equal(realtimePrice({ enabled: false }), '')
  const quote: Quote = { enabled: true, showPrices: true, freeRemainingToday: 3, dailyLimit: 20, balance: 25, entitlementEndsAtMs: null }
  assert.equal(imageActionLabel(quote), '生成上身图 · 今天还能 3 次')
  assert.equal(imageActionLabel({ ...quote, freeRemainingToday: 0 }), '生成上身图 · 今天还能 0 次')
  assert.equal(realtimePrice({ ...quote, unitPoints: 0.125 }), '每分钟 7.5 点')
  assert.equal(realtimePrice({ ...quote, showPrices: false, unitPoints: 0.125 }), '')
  assert.equal(realtimePrice(quote), '')
})
test('上身图次数用完只推荐含图片次数的订阅', () => {
  const products = [
    { id: 'points', kind: 'POINTS', imageDailyLimit: null },
    { id: 'image', kind: 'SUBSCRIPTION', imageDailyLimit: 40 },
    { id: 'agent', kind: 'SUBSCRIPTION', imageDailyLimit: null },
  ] as Product[]
  assert.deepEqual(subscriptionsForImages(products).map(p => p.id), ['image'])
  assert.equal(ledgerLabels.RESERVE, '使用中')
  assert.equal(ledgerLabels.SETTLE, '已使用')
  assert.equal(ledgerLabels.RELEASE, '已退回')
})
