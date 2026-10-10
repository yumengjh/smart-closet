<script setup lang="ts">
import { computed } from 'vue'
import { OCCASIONS, type IntentInput } from './types'

/** Intent bar (design 8.2): occasion, optional temperature, colours to avoid. Editing and re-running needs no model. */
const props = withDefaults(defineProps<{ loading?: boolean; compact?: boolean; submitLabel?: string }>(), { submitLabel: '推荐' })
const intent = defineModel<IntentInput>({ required: true })
const emit = defineEmits<{ submit: [] }>()
const COLORS = ['亮色', '深色', '红色', '橙色', '黄色', '绿色', '蓝色', '紫色', '粉色', '黑色', '白色', '灰色', '米色', '棕色']
const occasion = computed({ get: () => intent.value.occasion || 'DAILY', set: v => { intent.value = { ...intent.value, occasion: v } } })
const temperature = computed({ get: () => intent.value.temperatureC ?? null, set: v => { intent.value = { ...intent.value, temperatureC: v } } })
const avoid = computed({ get: () => intent.value.avoidColors || [], set: v => { intent.value = { ...intent.value, avoidColors: v } } })
</script>
<template>
  <form class="recommend-intent-bar" :class="{ 'is-compact': props.compact }" aria-label="推荐条件" @submit.prevent="emit('submit')">
    <div class="recommend-intent-occasion"><span class="recommend-intent-label">场景</span>
      <div class="recommend-occasion-tags"><a-checkable-tag v-for="o in (props.compact ? OCCASIONS.slice(0, 4) : OCCASIONS)" :key="o.value" :checked="occasion === o.value" @change="occasion = o.value">{{ o.label }}</a-checkable-tag></div>
    </div>
    <label class="recommend-intent-field"><span class="recommend-intent-label">温度</span><a-input-number v-model:value="temperature" :min="-40" :max="50" :precision="0" placeholder="可不填" addon-after="°C" aria-label="温度（可不填）" /></label>
    <label v-if="!props.compact" class="recommend-intent-field recommend-intent-avoid"><span class="recommend-intent-label">避开</span><a-select v-model:value="avoid" mode="multiple" :options="COLORS.map(c => ({ value: c, label: c }))" placeholder="不想要的颜色" :max-tag-count="3" aria-label="避开的颜色" /></label>
    <a-button type="primary" html-type="submit" :loading="props.loading">{{ props.submitLabel }}</a-button>
  </form>
</template>
