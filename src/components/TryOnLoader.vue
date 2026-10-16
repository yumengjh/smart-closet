<script lang="ts">
export type LoaderStep = { key: string; label: string; state: 'done' | 'active' | 'waiting'; detail?: string; percent?: number }
</script>

<script setup lang="ts">
import { CheckCircleFilled, LoadingOutlined } from '@ant-design/icons-vue'

/** Waiting animation for camera and model start-up: a figure being "scanned" plus the real loading steps. */
defineProps<{ steps: LoaderStep[]; compact?: boolean }>()
// Joints of a standing figure in a 60×100 box; lines connect them like the pose skeleton.
const joints = [[30, 12], [18, 30], [42, 30], [12, 48], [48, 48], [10, 64], [50, 64], [22, 58], [38, 58], [21, 78], [39, 78], [20, 96], [40, 96]]
const bones = [[1, 2], [1, 3], [3, 5], [2, 4], [4, 6], [1, 7], [2, 8], [7, 8], [7, 9], [9, 11], [8, 10], [10, 12]]
</script>

<template>
  <div v-if="compact" class="loader-chip" role="status" aria-live="polite">
    <LoadingOutlined spin />
    <template v-for="step in steps" :key="step.key"><span v-if="step.state === 'active'">{{ step.label }}<small v-if="step.detail"> · {{ step.detail }}</small></span></template>
  </div>
  <div v-else class="loader" role="status" aria-live="polite">
    <svg class="loader-figure" viewBox="-6 -4 72 108" aria-hidden="true">
      <circle cx="30" cy="12" r="8" class="head" />
      <line v-for="([a, b], i) in bones" :key="`b${i}`" :x1="joints[a]![0]" :y1="joints[a]![1]" :x2="joints[b]![0]" :y2="joints[b]![1]" class="bone" :style="{ animationDelay: `${i * 0.08}s` }" />
      <circle v-for="([x, y], i) in joints.slice(1)" :key="`j${i}`" :cx="x" :cy="y" r="2.6" class="joint" :style="{ animationDelay: `${i * 0.12}s` }" />
      <rect x="-6" y="0" width="72" height="3" rx="1.5" class="scan" />
    </svg>
    <div class="loader-copy">
      <h2>正在准备试穿</h2>
      <ol>
        <li v-for="step in steps" :key="step.key" :class="step.state">
          <CheckCircleFilled v-if="step.state === 'done'" /><LoadingOutlined v-else-if="step.state === 'active'" spin /><i v-else class="dot" />
          <span>{{ step.label }}</span><small v-if="step.detail">{{ step.detail }}</small>
          <a-progress v-if="step.state === 'active' && step.percent !== undefined" :percent="step.percent" :show-info="false" size="small" stroke-color="#36e2c8" trail-color="#ffffff22" />
        </li>
      </ol>
      <p>首次使用需要下载识别模型，之后会直接从本机缓存读取。</p>
    </div>
  </div>
</template>

<style scoped>
.loader { display: flex; align-items: center; gap: 28px; padding: 24px; color: #f1f6f3; text-align: left; }
.loader-figure { width: 96px; flex: none; overflow: visible; }
.head { fill: none; stroke: #accdb9; stroke-width: 2.4; }
.bone { stroke: #36e2c8; stroke-width: 2.4; stroke-linecap: round; stroke-dasharray: 40; stroke-dashoffset: 40; animation: draw 2.4s ease-in-out infinite; }
.joint { fill: #fff; animation: pulse 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.scan { fill: #36e2c8; opacity: .35; animation: scan 2.4s ease-in-out infinite; }
@keyframes draw { 0% { stroke-dashoffset: 40 } 40%, 70% { stroke-dashoffset: 0 } 100% { stroke-dashoffset: -40 } }
@keyframes pulse { 0%, 100% { transform: scale(.7); opacity: .5 } 50% { transform: scale(1.25); opacity: 1 } }
@keyframes scan { 0% { transform: translateY(0) } 50% { transform: translateY(98px) } 100% { transform: translateY(0) } }
.loader-copy { min-width: 0; max-width: 300px; }
.loader-copy h2 { margin: 0 0 12px; font-size: 20px; font-weight: 600; color: inherit; }
.loader-copy ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.loader-copy li { display: grid; grid-template-columns: 18px auto 1fr; align-items: center; column-gap: 8px; font-size: 13px; color: #8fa198; }
.loader-copy li.active { color: #f1f6f3; }
.loader-copy li.done { color: #c4d0c8; }
.loader-copy li.done .anticon { color: #36e2c8; }
.loader-copy li small { justify-self: end; font-size: 12px; color: #accdb9; font-variant-numeric: tabular-nums; }
.loader-copy li .ant-progress { grid-column: 2 / -1; margin: 0; }
.dot { width: 6px; height: 6px; margin-left: 4px; border-radius: 50%; background: #ffffff33; }
.loader-copy p { margin: 14px 0 0; font-size: 12px; line-height: 1.7; color: #8fa198; }
.loader-chip { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; background: #151b18d9; color: #e9f5ef; font-size: 13px; white-space: nowrap; pointer-events: none; }
.loader-chip small { color: #accdb9; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) { .loader { flex-direction: column; gap: 16px; padding: 16px; } .loader-figure { width: 72px; } }
@media (prefers-reduced-motion: reduce) { .bone, .joint, .scan { animation: none; stroke-dashoffset: 0; } }
</style>
