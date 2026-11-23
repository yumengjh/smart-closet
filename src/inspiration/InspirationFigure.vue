<script setup lang="ts">
import { computed, ref } from 'vue'
import { badge, boxStyle, clampBox } from './labels'
import type { InspirationItem } from '../services/inspirations'
import { mediaUrl } from '../services/urls'

/**
 * 截图与标记（体验改版，2026-11-23）。看的时候：点标记高亮这一件。改的时候：拖标记挪位置，拖右下角或左上角的圆点调大小，
 * 在空白处拖出一个框补一件。只在松手时把新框交给页面保存，拖动过程全在本地。
 */
const props = defineProps<{ imageUrl: string; items: InspirationItem[]; order: Map<number, number>; active: number | null; editing: boolean; show: boolean }>()
const emit = defineEmits<{ select: [index: number]; change: [index: number, box: number[]]; draw: [box: number[]] }>()

const frame = ref<HTMLElement | null>(null)
type Drag = { kind: 'move' | 'nw' | 'se' | 'draw'; index: number; startX: number; startY: number; box: [number, number, number, number]; moved: boolean }
const drag = ref<Drag | null>(null)
const draft = ref<{ index: number; box: [number, number, number, number] } | null>(null)

const marks = computed(() => props.items
  .map(item => ({ item, box: draft.value && draft.value.index === item.index ? draft.value.box : item.box }))
  .map(mark => ({ ...mark, style: boxStyle(mark.box) }))
  .filter(mark => mark.style))
const drawing = computed(() => drag.value?.kind === 'draw' && draft.value ? boxStyle(draft.value.box) : null)

function point(event: PointerEvent) {
  const rect = frame.value!.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
}
function start(event: PointerEvent, kind: Drag['kind'], item?: InspirationItem) {
  if (!props.editing || !frame.value) return
  event.preventDefault(); event.stopPropagation()
  const at = point(event)
  const box = (item?.box && item.box.length === 4 ? item.box : [at.x, at.y, at.x, at.y]) as [number, number, number, number]
  drag.value = { kind, index: item?.index ?? -1, startX: at.x, startY: at.y, box: [...box] as [number, number, number, number], moved: false }
  draft.value = { index: item?.index ?? -1, box: [...box] as [number, number, number, number] }
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  if (item && kind === 'move') emit('select', item.index)
}
function move(event: PointerEvent) {
  const current = drag.value
  if (!current || !draft.value) return
  const at = point(event)
  const dx = at.x - current.startX, dy = at.y - current.startY
  if (Math.abs(dx) + Math.abs(dy) > 0.004) current.moved = true
  const [l, t, r, b] = current.box
  if (current.kind === 'move') {
    const w = r - l, h = b - t
    const nl = Math.max(0, Math.min(1 - w, l + dx)), nt = Math.max(0, Math.min(1 - h, t + dy))
    draft.value = { index: current.index, box: clampBox(nl, nt, nl + w, nt + h) }
  } else if (current.kind === 'nw') draft.value = { index: current.index, box: clampBox(l + dx, t + dy, r, b) }
  else if (current.kind === 'se') draft.value = { index: current.index, box: clampBox(l, t, r + dx, b + dy) }
  else draft.value = { index: -1, box: clampBox(current.startX, current.startY, at.x, at.y, 0) }
}
function end() {
  const current = drag.value, result = draft.value
  drag.value = null
  if (!current || !result) { draft.value = null; return }
  if (current.kind === 'draw') {
    const [l, t, r, b] = result.box
    draft.value = null
    if (r - l >= 0.04 && b - t >= 0.04) emit('draw', [...result.box])
    return
  }
  if (current.moved) emit('change', current.index, [...result.box])
  // 保存前先停在新位置，页面保存成功后用服务端结果替换，失败时回到原处。
  window.setTimeout(() => { if (!drag.value) draft.value = null }, 900)
}
function tapMark(item: InspirationItem) { if (!props.editing) emit('select', item.index) }
</script>

<template>
  <figure class="fg" :class="{ focusing: active !== null && show && !editing, editing }">
    <div ref="frame" class="fg-frame" @pointerdown="event => editing && start(event, 'draw')" @pointermove="move" @pointerup="end" @pointercancel="end">
      <img :src="mediaUrl(imageUrl)" alt="穿搭截图" draggable="false" />
      <template v-if="show || editing">
        <button v-for="mark in marks" :key="mark.item.index" type="button" class="fg-mark" :class="{ on: active === mark.item.index }" :style="mark.style!"
          :aria-label="`${badge(order.get(mark.item.index) || 0)} ${mark.item.category || '一件'}${editing ? '，拖动可以挪位置' : ''}`" :aria-pressed="active === mark.item.index"
          @click.stop="tapMark(mark.item)" @pointerdown="event => start(event, 'move', mark.item)">
          <em>{{ badge(order.get(mark.item.index) || 0) }}</em>
          <template v-if="editing && active === mark.item.index">
            <i class="fg-handle nw" aria-hidden="true" @pointerdown="event => start(event, 'nw', mark.item)"></i>
            <i class="fg-handle se" aria-hidden="true" @pointerdown="event => start(event, 'se', mark.item)"></i>
          </template>
        </button>
        <span v-if="drawing" class="fg-draw" :style="drawing" aria-hidden="true"></span>
      </template>
    </div>
    <slot />
  </figure>
</template>

<style scoped>
.fg { position: relative; margin: 0; border-radius: 18px; overflow: hidden; background: var(--surface-alt); }
.fg-frame { position: relative; width: fit-content; max-width: 100%; margin: 0 auto; touch-action: auto; user-select: none; -webkit-user-select: none; }
.fg.editing .fg-frame { touch-action: none; cursor: crosshair; }
.fg-frame img { display: block; max-width: 100%; max-height: 72vh; object-fit: contain; pointer-events: none; }
.fg-mark { position: absolute; padding: 0; border: 1.5px solid #ffffffcc; border-radius: 10px; background: transparent; box-shadow: 0 0 0 1px #00000033; cursor: pointer; transition: border-color .2s ease, background .2s ease, opacity .2s ease; }
.fg.editing .fg-mark { border-style: dashed; cursor: move; transition: none; }
.fg-mark em { position: absolute; left: 4px; top: 4px; display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 4px; border-radius: 11px; background: #111111cc; color: #fff; font-size: 13px; font-style: normal; line-height: 1; pointer-events: none; }
.fg-mark.on { border-color: #fff; border-style: solid; background: #ffffff1f; box-shadow: 0 0 0 2px var(--ink), 0 0 0 9999px #00000059; z-index: 1; }
.fg.editing .fg-mark.on { box-shadow: 0 0 0 2px var(--ink), 0 0 0 9999px #00000033; }
.fg.focusing .fg-mark:not(.on) { opacity: .35; }
.fg-mark:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.fg-handle { position: absolute; width: 22px; height: 22px; border: 2px solid var(--ink); border-radius: 50%; background: #fff; box-shadow: 0 1px 4px #0000004d; cursor: nwse-resize; touch-action: none; }
.fg-handle::after { content: ''; position: absolute; inset: -12px; }
.fg-handle.nw { left: -11px; top: -11px; }
.fg-handle.se { right: -11px; bottom: -11px; }
.fg-draw { position: absolute; border: 2px dashed #fff; border-radius: 10px; background: #ffffff26; box-shadow: 0 0 0 1px #00000055; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .fg-mark { transition: none; } }
</style>
