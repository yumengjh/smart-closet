<script setup lang="ts">
// “姿势”一行（server 设计 2026-11-21 4.2）：上身图与需要人物的创作效果共用，放在部位清单下面、不放进折叠。
// 小人示意直接用 PoseFigure（只画关键点，不调模型）；“自动”显示淡色人形与“自动”。点开由父组件打开 PosePicker 抽屉。
import { computed } from 'vue'
import { RightOutlined } from '@ant-design/icons-vue'
import type { PoseCatalog, PoseChoice } from '../services/platform'
import PoseFigure from './PoseFigure.vue'

const props = withDefaults(defineProps<{ pose: PoseChoice; catalog: PoseCatalog | null; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ open: [] }>()
const chosen = computed(() => {
  const value = props.pose
  if (value.mode === 'AUTO') return null
  return [...(props.catalog?.presets || []), ...(props.catalog?.mine || [])].find(item => item.id === value.id) || null
})
const name = computed(() => props.pose.mode === 'AUTO' ? '自动' : chosen.value?.name || '已选')
</script>

<template>
  <a-button type="text" class="pose-row" :disabled="disabled" :aria-label="`姿势：${name}，换一个`" @click="emit('open')">
    <span class="pose-row-label">姿势</span>
    <span class="pose-row-art" :class="{ auto: !chosen }">
      <PoseFigure v-if="chosen" :pose="chosen" />
      <svg v-else viewBox="0 0 24 32" aria-hidden="true"><circle cx="12" cy="5" r="3.2" /><path d="M7.5 10.5h9l1.6 9.5h-2.6l-.8 10h-2.2l-.5-7-.5 7h-2.2l-.8-10H5.9z" /></svg>
    </span>
    <b class="pose-row-name">{{ name }}</b>
    <span class="pose-row-go">换 <RightOutlined /></span>
  </a-button>
</template>

<style scoped>
.pose-row.ant-btn { display: flex; align-items: center; gap: 10px; width: 100%; height: auto; min-height: 56px; margin-top: 4px; padding: 6px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; color: var(--ink); text-align: left; }
.pose-row-label { flex: none; width: 44px; font-size: 13px; color: var(--muted-strong); }
.pose-row-art { flex: none; width: 33px; height: 44px; overflow: hidden; border-radius: 6px; background: var(--surface-alt); }
.pose-row-art.auto { display: grid; place-items: center; }
.pose-row-art.auto svg { width: 18px; height: 26px; fill: var(--muted-subtle); opacity: .7; }
.pose-row-name { flex: 1; min-width: 0; overflow: hidden; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.pose-row-go { flex: none; display: inline-flex; align-items: center; gap: 2px; font-size: 13px; color: var(--muted-strong); }
.pose-row-go :deep(.anticon) { font-size: 10px; }
</style>
