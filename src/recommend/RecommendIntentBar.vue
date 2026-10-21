<script setup lang="ts">
import { computed } from 'vue'
import { OCCASIONS, type IntentInput } from './types'

/**
 * Intent bar (design 8.2): occasion, optional temperature, colours to avoid. Editing and re-running needs no model.
 * Occasions are one scrollable row of chips; with {@code autoRun} picking one recomputes at once, the button is for the rest.
 */
const props = withDefaults(defineProps<{ loading?: boolean; compact?: boolean; submitLabel?: string; autoRun?: boolean }>(), { submitLabel: '推荐' })
const intent = defineModel<IntentInput>({ required: true })
const emit = defineEmits<{ submit: [] }>()
const COLORS = ['亮色', '深色', '红色', '橙色', '黄色', '绿色', '蓝色', '紫色', '粉色', '黑色', '白色', '灰色', '米色', '棕色']
const occasion = computed({ get: () => intent.value.occasion || 'DAILY', set: v => { intent.value = { ...intent.value, occasion: v } } })
const temperature = computed({ get: () => intent.value.temperatureC ?? null, set: v => { intent.value = { ...intent.value, temperatureC: v } } })
const avoid = computed({ get: () => intent.value.avoidColors || [], set: v => { intent.value = { ...intent.value, avoidColors: v } } })
function pick(value: typeof occasion.value) {
  if (value === occasion.value) return
  occasion.value = value
  if (props.autoRun) emit('submit')
}
</script>
<template>
  <form class="recommend-intent-bar" :class="{ 'is-compact': props.compact }" aria-label="推荐条件" @submit.prevent="emit('submit')">
    <div class="recommend-occasion-tags" role="radiogroup" aria-label="场景">
      <a-checkable-tag v-for="o in (props.compact ? OCCASIONS.slice(0, 4) : OCCASIONS)" :key="o.value" role="radio" :aria-checked="occasion === o.value" :checked="occasion === o.value" @change="pick(o.value)">{{ o.label }}</a-checkable-tag>
    </div>
    <div class="recommend-intent-extra">
      <a-input-number v-model:value="temperature" class="recommend-intent-temp" :min="-40" :max="50" :precision="0" placeholder="气温自动" addon-after="°C" aria-label="温度（可不填，默认按常住城市天气）" />
      <a-select v-if="!props.compact" v-model:value="avoid" class="recommend-intent-avoid" mode="multiple" :options="COLORS.map(c => ({ value: c, label: c }))" placeholder="避开颜色" :max-tag-count="1" :show-search="false" aria-label="避开的颜色" />
      <a-button type="primary" html-type="submit" :loading="props.loading">{{ props.submitLabel }}</a-button>
    </div>
  </form>
</template>
