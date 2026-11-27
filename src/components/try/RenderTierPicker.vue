<script setup lang="ts">
import type { RenderTiers, Tier } from '../../services/modelTiers'

const props = withDefaults(defineProps<{ config: RenderTiers; modelValue: Tier; multiplier?: number | null; disabled?: boolean }>(), { multiplier: 1, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [Tier] }>()
const ordered = () => (['STANDARD', 'PREMIUM'] as const).flatMap(tier => props.config.tiers.filter(item => item.tier === tier))
const unavailable = (tier: Tier, available: boolean) => !available && !(tier === 'PREMIUM' && props.config.degradeEnabled)
</script>

<template>
  <div v-if="config.enabled" class="tier-picker">
    <a-radio-group :value="modelValue" :disabled="disabled" aria-label="选择图片质量" @change="emit('update:modelValue', $event.target.value)">
      <a-radio v-for="item in ordered()" :key="item.tier" :value="item.tier" :disabled="unavailable(item.tier, item.available)">
        {{ item.tier === 'PREMIUM' ? '高质量' : '标准' }}<template v-if="multiplier != null"> · 每张 {{ item.units * multiplier }} 次</template>
        <small v-if="!item.available">{{ item.tier === 'PREMIUM' ? (config.degradeEnabled ? '暂时不可用，会用标准完成' : '暂时不可用，请换标准') : '暂时不可用' }}</small>
      </a-radio>
    </a-radio-group>
  </div>
</template>

<style scoped>
.tier-picker :deep(.ant-radio-group) { display: grid; gap: 8px; }
.tier-picker small { display: block; margin-left: 24px; color: var(--muted-copy); font-size: 12px; white-space: normal; }
</style>
