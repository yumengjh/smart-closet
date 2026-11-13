<script setup lang="ts">
import { computed } from 'vue'
import { duration, type Capabilities } from './api'
import { useBillingStore } from '../billing/store'
import { realtimePrice } from '../billing/model'

const props = defineProps<{ remaining: number; points?: Capabilities['points'] }>()
const billing = useBillingStore()
const price = computed(() => realtimePrice(billing.realtime))
const pointsHint = computed(() => {
  // Prices only come from the quote, so hidden prices cannot leak through capabilities.
  if (!billing.realtime?.enabled || !price.value) return ''
  const paidSeconds = props.points?.paidSeconds || 0
  if (props.remaining <= 0) return paidSeconds > 0 ? `将使用点数，约可试穿 ${Number((paidSeconds / 60).toFixed(2))} 分钟 · ${price.value}` : `免费时长已用完，点数不足 · ${price.value}`
  return `${price.value}${paidSeconds > 0 ? ` · 另可试穿约 ${Number((paidSeconds / 60).toFixed(2))} 分钟` : ''}`
})
const insufficient = computed(() => !!pointsHint.value && props.remaining <= 0 && (props.points?.paidSeconds || 0) <= 0)
</script>

<template>
  <span>今日剩余 {{ duration(remaining) }}<template v-if="pointsHint"><br /><a-typography-text :type="insufficient ? 'warning' : 'secondary'">{{ pointsHint }}</a-typography-text></template><a-button v-if="insufficient" type="link" size="small" @click="billing.purchase = 'tryon'">充值点数</a-button></span>
</template>
