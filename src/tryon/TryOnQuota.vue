<script setup lang="ts">
import { computed } from 'vue'
import { duration, type Capabilities } from './api'

const props = defineProps<{ remaining: number; points?: Capabilities['points'] }>()
const pointsHint = computed(() => {
  const { paidSeconds = 0, milliPointsPerSecond = 0 } = props.points || {}
  if (milliPointsPerSecond <= 0) return ''
  const minutes = Number((paidSeconds / 60).toFixed(2))
  if (props.remaining <= 0) return paidSeconds > 0 ? `免费时长已用完，将使用点数，约可试穿 ${minutes} 分钟` : '免费时长已用完，点数不足'
  if (paidSeconds <= 0) return ""
  const price = Number((milliPointsPerSecond * 60 / 1000).toFixed(2))
  return `另可用点数试穿约 ${minutes} 分钟（每分钟 ${price} 点）`
})
const insufficient = computed(() => !!pointsHint.value && props.remaining <= 0 && (props.points?.paidSeconds || 0) <= 0)
</script>

<template>
  <span>今日剩余 {{ duration(remaining) }}<template v-if="pointsHint"><br /><a-typography-text :type="insufficient ? 'warning' : 'secondary'">{{ pointsHint }}</a-typography-text><a-button v-if="insufficient" type="link" size="small" href="/settings?section=quota">点数与兑换</a-button></template></span>
</template>
