import { computed, ref, watch, type Ref } from 'vue'
import { billingApi } from '../billing/api'
import { realtimePrice, type Quote } from '../billing/model'
import { useBillingStore } from '../billing/store'
import type { Tier } from '../services/modelTiers'
import { realtimeTierNotice, type Capabilities } from './api'

/** The top-level points and readiness describe STANDARD. PREMIUM has its own quote and daily seconds. */
export function useRealtimeOffer(cap: Ref<Capabilities | null>, tier: Readonly<Ref<Tier>>) {
  const billing = useBillingStore()
  const premiumQuote = ref<Quote>()
  watch([cap, tier, () => billing.realtime], async ([capability, selected, standardQuote], _, onCleanup) => {
    premiumQuote.value = undefined
    if (!capability?.enabled || selected !== 'PREMIUM' || !standardQuote?.enabled) return
    let current = true
    onCleanup(() => { current = false })
    try {
      const quote = await billingApi.quote('tryon.realtime.premium')
      if (current) premiumQuote.value = quote
    } catch { /* Without a quote the free time is still available. */ }
  }, { immediate: true })
  const info = computed(() => cap.value?.tiers?.find(item => item.tier === tier.value))
  const ready = computed(() => info.value?.available ?? Boolean(cap.value?.ready))
  const remaining = computed(() => info.value?.quota.remaining ?? cap.value?.quota.remaining ?? 0)
  const notice = computed(() => {
    if (cap.value?.tiers?.length) return realtimeTierNotice(cap.value.tiers, tier.value)
    if (ready.value || !cap.value?.enabled) return ''
    return remaining.value <= 0 && !cap.value.points?.paidSeconds ? '今日试穿时长已用完。' : '实时试穿暂时不可用。'
  })
  const quote = computed(() => tier.value === 'PREMIUM' ? premiumQuote.value : billing.realtime)
  const price = computed(() => realtimePrice(quote.value))
  const points = computed(() => {
    if (tier.value === 'STANDARD') return cap.value?.points
    const q = premiumQuote.value
    if (!q?.enabled || !q.unitPoints) return undefined
    const milliPointsPerSecond = Math.round(q.unitPoints * 1000)
    return { milliPointsPerSecond, paidSeconds: Math.floor(q.balance * 1000 / milliPointsPerSecond) }
  })
  const paid = computed(() => Boolean(quote.value?.enabled && (points.value?.milliPointsPerSecond || 0) > 0))
  const needsPoints = computed(() => paid.value && (info.value ? info.value.reason === 'QUOTA' : remaining.value <= 0 && !points.value?.paidSeconds))
  return { ready, remaining, notice, price, points, paid, needsPoints }
}
