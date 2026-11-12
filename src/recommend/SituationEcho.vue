<script setup lang="ts">
import type { Situation } from './types'
defineProps<{ situation?: Situation; privateVisible?: boolean }>()
</script>
<template>
  <div v-if="situation" class="situation-echo" role="status" aria-label="本次穿搭情境">
    <span>{{ situation.dateLabel }}<template v-if="situation.place"> · {{ situation.place }}</template><template v-if="situation.weather"> · 体感 {{ situation.weather.feelsMin }}～{{ situation.weather.feelsMax }}°C</template></span>
    <span v-if="situation.activity">{{ situation.activity.understood || situation.activity.label }}<template v-if="situation.activity.evidence"> · {{ situation.activity.evidence }}</template></span>
    <span v-for="line in [...(situation.demands || []), ...situation.notes]" :key="line">{{ line }}</span>
    <template v-if="privateVisible"><span v-for="line in situation.private || []" :key="line" class="situation-private">{{ line }}（仅自己可见）</span></template>
  </div>
</template>
<style scoped>
.situation-echo { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 8px 0 12px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.situation-private { color: var(--muted-strong); }
</style>
