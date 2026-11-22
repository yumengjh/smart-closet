<script setup lang="ts">
// 跟着摆的线框（server 设计 2026-11-22 6.3）：预设动作的关节画成半透明线框，放在画面中央最大的 3:4 框里；
// 画面镜像显示时线框也翻转。摆好后变实线。纯展示，不接收点击；关节点只在本页使用。
import { computed } from 'vue'
import type { Pose } from '../services/platform'
import { FRAME, figure } from '../ootd/pose-figure'
import { mirrorKeypoints, type Rect } from './pose/follow'

const props = defineProps<{ pose: Pose; box: Rect; mirrored: boolean; matched: boolean }>()
const shape = computed(() => figure(props.mirrored ? { ...props.pose, keypoints: mirrorKeypoints(props.pose.keypoints) } : props.pose))
const style = computed(() => ({ left: `${props.box.x}px`, top: `${props.box.y}px`, width: `${props.box.width}px`, height: `${props.box.height}px` }))
</script>

<template>
  <div v-if="shape" class="tryon-follow" :class="{ 'is-matched': matched }" :style="style" aria-hidden="true">
    <svg :viewBox="`0 0 ${FRAME.width} ${FRAME.height}`" preserveAspectRatio="xMidYMid meet">
      <polygon v-if="shape.torso" class="follow-torso" :points="shape.torso" />
      <line v-for="s in shape.segments" :key="s.key" class="follow-bone" :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2" />
      <circle v-for="j in shape.joints" :key="j.key" class="follow-joint" :cx="j.x" :cy="j.y" r="1.8" />
      <circle v-if="shape.head" class="follow-head" :cx="shape.head.x" :cy="shape.head.y" :r="shape.head.r" />
    </svg>
  </div>
</template>

<style scoped>
/* 线框画在视频上，不跟随主题：白线加深色描边，亮暗背景都看得清；摆好后变薄荷绿实线。 */
.tryon-follow { --line: #ffffffd9; --halo: #0000004d; position: absolute; z-index: 4; pointer-events: none; }
.tryon-follow svg { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 1.5px var(--halo)); animation: follow-breathe 2.4s ease-in-out infinite; }
.follow-torso { fill: #ffffff14; stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 3; }
.follow-bone { stroke: var(--line); stroke-width: 2.6; stroke-linecap: round; stroke-dasharray: 4 4; }
.follow-joint { fill: var(--line); }
.follow-head { fill: none; stroke: var(--line); stroke-width: 2; stroke-dasharray: 4 3; }
.is-matched { --line: #9fe8c3; }
.is-matched svg { animation: none; }
.is-matched .follow-bone, .is-matched .follow-head, .is-matched .follow-torso { stroke-dasharray: none; }
.is-matched .follow-bone { stroke-width: 3.2; }
@keyframes follow-breathe { 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) { .tryon-follow svg { animation: none; } }
</style>
