<script setup lang="ts">
import { renderTierAvailable, type RenderTiers, type Tier } from '../../services/modelTiers'

const props = withDefaults(defineProps<{ config: RenderTiers; modelValue: Tier; multiplier?: number | null; disabled?: boolean }>(), { multiplier: 1, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [Tier] }>()
const ordered = () => (['STANDARD', 'PREMIUM'] as const).flatMap(tier => props.config.tiers.filter(item => item.tier === tier))
function unavailableNotice(tier: Tier) {
  if (tier !== 'PREMIUM' || !renderTierAvailable(props.config, 'STANDARD')) return '暂时不可用'
  return props.config.degradeEnabled ? '暂时不可用，会用标准完成' : '暂时不可用，请换标准'
}
</script>

<template>
  <div v-if="config.enabled" class="tier-picker">
    <a-radio-group :value="modelValue" :disabled="disabled" aria-label="选择图片质量" @change="emit('update:modelValue', $event.target.value)">
      <a-radio v-for="item in ordered()" :key="item.tier" :value="item.tier" :disabled="!renderTierAvailable(config, item.tier)">
        {{ item.tier === 'PREMIUM' ? '高质量' : '标准' }}<template v-if="multiplier != null"> · 每张 {{ item.units * multiplier }} 次</template>
        <small v-if="!item.available">{{ unavailableNotice(item.tier) }}</small>
      </a-radio>
    </a-radio-group>
  </div>
</template>

<style scoped>
.tier-picker :deep(.ant-radio-group) { display: grid; gap: 8px; }
.tier-picker small { display: block; margin-left: 24px; color: var(--muted-copy); font-size: 12px; white-space: normal; }
</style>
