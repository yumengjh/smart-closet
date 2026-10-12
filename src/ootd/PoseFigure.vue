<script setup lang="ts">
import { computed } from 'vue'
import type { Pose } from '../services/platform'
import { FRAME, figure, palette } from './pose-figure'

const props = withDefaults(defineProps<{ pose: Pose; animate?: boolean }>(), { animate: false })
const shape = computed(() => figure(props.pose))
const colors = computed(() => palette(props.pose.id || props.pose.name))
const gradientId = computed(() => `pose-bg-${(props.pose.id || props.pose.name).replace(/[^a-zA-Z0-9]/g, '')}`)
</script>

<template>
  <svg class="pose-figure" :class="{ animate }" :viewBox="`0 0 ${FRAME.width} ${FRAME.height}`" role="img" :aria-label="`动作示意：${pose.name}`">
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="colors[0]" />
        <stop offset="1" :stop-color="colors[1]" />
      </linearGradient>
    </defs>
    <rect class="pose-bg" :width="FRAME.width" :height="FRAME.height" :fill="`url(#${gradientId})`" />
    <circle class="pose-halo" :cx="FRAME.width * 0.78" :cy="FRAME.height * 0.16" r="22" />
    <template v-if="shape">
      <ellipse class="pose-shadow" :cx="FRAME.width / 2" :cy="shape.ground" rx="30" ry="4.5" />
      <polygon v-if="shape.torso" class="pose-torso" :points="shape.torso" />
      <line v-for="(s, i) in shape.segments" :key="s.key" class="pose-bone" :class="s.side" :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2" pathLength="1" :style="{ animationDelay: `${i * 45}ms` }" />
      <circle v-for="j in shape.joints" :key="j.key" class="pose-joint" :cx="j.x" :cy="j.y" r="2.4" />
      <circle v-if="shape.head" class="pose-head" :cx="shape.head.x" :cy="shape.head.y" :r="shape.head.r" />
    </template>
    <g v-else class="pose-text-art">
      <circle :cx="FRAME.width / 2" :cy="FRAME.height * 0.42" r="30" class="pose-text-ring" />
      <text :x="FRAME.width / 2" :y="FRAME.height * 0.42 + 9" text-anchor="middle">{{ pose.name.slice(0, 1) }}</text>
    </g>
  </svg>
</template>

<style scoped>
.pose-figure { display: block; width: 100%; height: 100%; --pose-ink: #2b2d33; --pose-left: #e2725b; --pose-right: #3f7fd8; }
.pose-halo { fill: #ffffff; opacity: .45; }
.pose-shadow { fill: #00000014; }
.pose-torso { fill: var(--pose-ink); opacity: .12; stroke: none; }
.pose-bone { stroke-width: 5.2; stroke-linecap: round; stroke: var(--pose-ink); }
.pose-bone.left { stroke: var(--pose-left); }
.pose-bone.right { stroke: var(--pose-right); }
.pose-joint { fill: #fff; stroke: var(--pose-ink); stroke-width: 1.4; }
.pose-head { fill: var(--pose-ink); stroke: #fff; stroke-width: 2; }
.pose-text-ring { fill: #ffffff99; stroke: var(--pose-ink); stroke-opacity: .15; stroke-width: 1.5; }
.pose-text-art text { font-size: 28px; font-weight: 600; fill: var(--pose-ink); }
.animate .pose-bone { stroke-dasharray: 1; stroke-dashoffset: 1; animation: pose-draw .5s ease-out forwards; }
.animate .pose-head, .animate .pose-joint { opacity: 0; animation: pose-fade .3s ease-out .45s forwards; }
@keyframes pose-draw { to { stroke-dashoffset: 0; } }
@keyframes pose-fade { to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .animate .pose-bone { animation: none; stroke-dashoffset: 0; } .animate .pose-head, .animate .pose-joint { animation: none; opacity: 1; } }
</style>
