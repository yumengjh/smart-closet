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
