<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useBillingStore } from './store'
import { accountTime } from '../domain/account'
import { formatPoints } from './model'

const props = defineProps<{ compact?: boolean; detailsOnly?: boolean }>()
const billing = useBillingStore()
const router = useRouter()
const displayed = ref(0)
const quote = computed(() => billing.image?.enabled ? billing.image : undefined)
let stopAnimation: (() => void) | undefined
let animationVersion = 0
watch(() => quote.value?.balance, async (value, previous) => {
  const version = ++animationVersion
  stopAnimation?.()
  if (value === undefined) return
  if (props.compact || previous === undefined || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { displayed.value = value; return }
  try {
    const { animate } = await import('motion')
    if (version !== animationVersion) return
    const controls = animate(displayed.value, value, { duration: 0.45, ease: 'easeOut', onUpdate: latest => { displayed.value = Math.round(latest) } })
    stopAnimation = () => controls.stop()
  } catch { displayed.value = value }
}, { immediate: true })
onUnmounted(() => { animationVersion++; stopAnimation?.() })
</script>

<template>
  <a-button v-if="quote && compact" class="points-pill" :aria-label="`点数余额 ${formatPoints(quote.balance)}，查看会员与点数`" @click="router.push('/vip')">{{ formatPoints(quote.balance) }}</a-button>
  <section v-else-if="quote" class="membership-summary" aria-label="会员与点数">
    <div><span>点数余额</span><strong>{{ formatPoints(displayed) }}</strong></div>
    <p>{{ quote.entitlementEndsAtMs ? `权益有效至 ${accountTime(quote.entitlementEndsAtMs)}` : '当前按账号每日次数使用' }}</p>
    <a-button v-if="!detailsOnly" type="primary" @click="router.push('/vip')">充值 / 开通</a-button>
  </section>
</template>

<style scoped>
.points-pill.ant-btn { min-height: 44px; max-width: 124px; padding: 0 10px; overflow: hidden; border-radius: 12px; font-size: 12px; font-variant-numeric: tabular-nums; text-overflow: ellipsis; }
.membership-summary { display: grid; gap: 10px; padding: 18px; margin: 0 0 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.membership-summary > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.membership-summary span, .membership-summary p { color: var(--muted); font-size: 13px; }
.membership-summary strong { font-size: 22px; font-variant-numeric: tabular-nums; }
.membership-summary p { margin: 0; }
.membership-summary .ant-btn { min-height: 44px; }
@media (max-width: 767px) { .points-pill.ant-btn { max-width: 96px; padding-inline: 8px; } }
</style>
