<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Anchors, Geometry, Point } from '../try-on/geometry'

/** Hand placement of the garment anchors that the automatic silhouette analysis got wrong. */
const props = defineProps<{ open: boolean; image: string; aspect: number; geometry: Geometry | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; save: [Anchors | undefined] }>()
type Handle = { key: string; label: string; color: string; axis: 'x' | 'y' | 'xy'; get: () => Point; set: (p: Point) => void }
const state = reactive({ left: 0, right: 1, shoulderY: 0, hemY: 1, sleeves: [{ pivot: { x: 0, y: 0 }, tip: { x: 0, y: 0 } }, { pivot: { x: 1, y: 0 }, tip: { x: 1, y: 0 } }] })
const board = ref<HTMLElement>()
const active = ref('')
const clamp = (v: number) => Math.max(0, Math.min(1, v))
watch(() => props.open, open => {
  if (!open || !props.geometry) return
  const g = props.geometry
  Object.assign(state, { left: g.left, right: g.right, shoulderY: g.shoulderY, hemY: g.hemY,
    sleeves: g.sleeves.map(s => ({ pivot: { ...s.pivot }, tip: { ...s.tip } })) })
}, { immediate: true })
const mid = () => (state.left + state.right) / 2
const handles = computed<Handle[]>(() => [
  { key: 'shoulder', label: '肩线', color: '#ffb02e', axis: 'y', get: () => ({ x: mid(), y: state.shoulderY }), set: p => { state.shoulderY = Math.min(p.y, state.hemY - .1) } },
  { key: 'hem', label: '衣摆', color: '#ffb02e', axis: 'y', get: () => ({ x: mid(), y: state.hemY }), set: p => { state.hemY = Math.max(p.y, state.shoulderY + .1) } },
  { key: 'left', label: '衣身左边', color: '#36e2c8', axis: 'x', get: () => ({ x: state.left, y: (state.shoulderY + state.hemY) / 2 }), set: p => { state.left = Math.min(p.x, state.right - .15) } },
  { key: 'right', label: '衣身右边', color: '#36e2c8', axis: 'x', get: () => ({ x: state.right, y: (state.shoulderY + state.hemY) / 2 }), set: p => { state.right = Math.max(p.x, state.left + .15) } },
  ...state.sleeves.flatMap((sleeve, side) => [
    { key: `pivot${side}`, label: '袖子转轴（肩关节）', color: '#ff6fb1', axis: 'xy' as const, get: () => sleeve.pivot, set: (p: Point) => { sleeve.pivot = p } },
    { key: `tip${side}`, label: '袖口中心', color: '#9ad1ff', axis: 'xy' as const, get: () => sleeve.tip, set: (p: Point) => { sleeve.tip = p } },
  ]),
])
function place(handle: Handle, event: PointerEvent) {
  const rect = board.value!.getBoundingClientRect()
  const p = { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }
  const current = handle.get()
  handle.set({ x: handle.axis === 'y' ? current.x : p.x, y: handle.axis === 'x' ? current.y : p.y })
}
function start(handle: Handle, event: PointerEvent) { active.value = handle.key; (event.target as HTMLElement).setPointerCapture(event.pointerId) }
function move(handle: Handle, event: PointerEvent) { if (active.value === handle.key) place(handle, event) }
function nudge(handle: Handle, dx: number, dy: number) {
  const p = handle.get()
  handle.set({ x: clamp(p.x + (handle.axis === 'y' ? 0 : dx)), y: clamp(p.y + (handle.axis === 'x' ? 0 : dy)) })
}
function key(handle: Handle, event: KeyboardEvent) {
  const step = event.shiftKey ? .02 : .005, moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const m = moves[event.key]
  if (m) { event.preventDefault(); nudge(handle, ...m) }
}
const percent = (v: number) => `${(v * 100).toFixed(2)}%`
function save() {
  emit('save', { left: state.left, right: state.right, shoulderY: state.shoulderY, hemY: state.hemY,
    sleeves: [{ pivot: { ...state.sleeves[0]!.pivot }, tip: { ...state.sleeves[0]!.tip } }, { pivot: { ...state.sleeves[1]!.pivot }, tip: { ...state.sleeves[1]!.tip } }] })
  emit('update:open', false)
}
function reset() { emit('save', undefined); emit('update:open', false) }
</script>

<template>
  <a-modal :open="open" title="校准衣物锚点" width="640px" :footer="null" destroy-on-close @update:open="emit('update:open', $event)">
    <p class="anchor-intro">拖动圆点对准衣物的实际位置，方向键可微调（按住 Shift 移动更多）。只影响这件衣物在本浏览器里的试穿预览。</p>
    <div ref="board" class="anchor-board" :style="{ aspectRatio: aspect, width: `min(100%, ${(60 * aspect).toFixed(2)}vh)` }">
      <img :src="image" alt="正在校准的衣物" draggable="false" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <line :x1="state.left" :x2="state.left" y1="0" y2="1" class="body-line" />
        <line :x1="state.right" :x2="state.right" y1="0" y2="1" class="body-line" />
        <line x1="0" x2="1" :y1="state.shoulderY" :y2="state.shoulderY" class="level-line" />
        <line x1="0" x2="1" :y1="state.hemY" :y2="state.hemY" class="level-line" />
        <line v-for="(s, i) in state.sleeves" :key="i" :x1="s.pivot.x" :y1="s.pivot.y" :x2="s.tip.x" :y2="s.tip.y" class="sleeve-line" />
      </svg>
      <button v-for="h in handles" :key="h.key" type="button" class="anchor-handle" :class="{ dragging: active === h.key }"
        :style="{ left: percent(h.get().x), top: percent(h.get().y), background: h.color }" :aria-label="`${h.label}，可拖动或用方向键调整`" :title="h.label"
        @pointerdown.prevent="start(h, $event)" @pointermove="move(h, $event)" @pointerup="active = ''" @pointercancel="active = ''" @keydown="key(h, $event)" />
    </div>
    <ul class="anchor-legend">
      <li><i style="background:#ffb02e" />肩线与衣摆：衣服顶部与底部的位置</li>
      <li><i style="background:#36e2c8" />衣身左右边：腋下以下的衣身宽度</li>
      <li><i style="background:#ff6fb1" />袖子转轴：袖子绕它转动，放在肩关节处</li>
      <li><i style="background:#9ad1ff" />袖口中心：决定袖子方向和长度</li>
    </ul>
    <div class="anchor-actions">
      <a-button @click="reset">恢复自动识别</a-button>
      <a-space><a-button @click="emit('update:open', false)">先不保存</a-button><a-button type="primary" @click="save">保存锚点</a-button></a-space>
    </div>
  </a-modal>
</template>

<style scoped>
.anchor-intro { margin: 0 0 12px; font-size: 13px; color: var(--muted-copy); line-height: 1.7; }
.anchor-board { position: relative; margin: 0 auto; touch-action: none; user-select: none;
  background-color: var(--surface-alt); background-image: conic-gradient(#b7c5bd44 25%, transparent 0 50%, #b7c5bd44 0 75%, transparent 0); background-size: 16px 16px; border-radius: var(--radius-md); }
.anchor-board img, .anchor-board svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.anchor-board svg { overflow: visible; pointer-events: none; }
.body-line { stroke: #36e2c8; stroke-width: 1.5px; vector-effect: non-scaling-stroke; stroke-dasharray: 6 4; }
.level-line { stroke: #ffb02e; stroke-width: 1.5px; vector-effect: non-scaling-stroke; stroke-dasharray: 6 4; }
.sleeve-line { stroke: #ff6fb1; stroke-width: 2px; vector-effect: non-scaling-stroke; }
.anchor-handle { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; padding: 0; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 1px 4px #0006; cursor: grab; touch-action: none; }
.anchor-handle:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.anchor-handle.dragging { cursor: grabbing; transform: scale(1.25); }
.anchor-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin: 14px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--muted-copy); }
.anchor-legend i { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: 50%; vertical-align: -1px; }
.anchor-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 18px; }
@media (max-width: 560px) { .anchor-legend { grid-template-columns: 1fr; } }
</style>
