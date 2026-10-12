<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue'
import type { Pose } from '../services/platform'
import PoseFigure from './PoseFigure.vue'
import { SOURCE_LABEL } from './pose-figure'

withDefaults(defineProps<{ pose: Pose; selected?: boolean; animate?: boolean; showDescription?: boolean }>(), { selected: false, animate: false, showDescription: false })
defineEmits<{ select: [] }>()
</script>

<template>
  <button type="button" class="pose-card" :class="{ selected }" :aria-pressed="selected" @click="$emit('select')">
    <span class="pose-card-art"><PoseFigure :pose="pose" :animate="animate" /><span v-if="pose.source !== 'PRESET'" class="pose-card-badge">{{ SOURCE_LABEL[pose.source] }}</span></span>
    <span v-if="selected" class="pose-card-check"><CheckOutlined /></span>
    <span class="pose-card-body">
      <strong>{{ pose.name }}</strong>
      <span v-if="pose.tags.length" class="pose-card-tags"><em v-for="t in pose.tags.slice(0, 3)" :key="t">{{ t }}</em></span>
      <small v-if="showDescription">{{ pose.description }}</small>
    </span>
  </button>
</template>

<style scoped>
.pose-card { position: relative; display: flex; flex-direction: column; width: 100%; min-width: 0; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); color: var(--ink); text-align: left; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
.pose-card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgb(0 0 0 / 8%); }
.pose-card:focus-visible { outline: 2px solid var(--focus-ring, var(--accent)); outline-offset: 2px; }
.pose-card.selected { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.pose-card-art { position: relative; display: block; aspect-ratio: 3 / 4; }
.pose-card-badge { position: absolute; bottom: 6px; left: 6px; padding: 1px 8px; border-radius: 999px; background: #ffffffd9; color: #3a3d45; font-size: 11px; line-height: 18px; }
.pose-card-check { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--action-bg); color: var(--action-fg); font-size: 12px; }
.pose-card-body { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px 10px; }
.pose-card-body strong { overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.pose-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.pose-card-tags em { padding: 0 6px; border-radius: 4px; background: var(--surface-alt); color: var(--muted-copy); font-size: 11px; font-style: normal; line-height: 18px; }
.pose-card-body small { color: var(--muted-copy); font-size: 12px; line-height: 1.6; }
@media (prefers-reduced-motion: reduce) { .pose-card, .pose-card:hover { transform: none; transition: none; } }
</style>
