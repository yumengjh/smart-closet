<script setup lang="ts">
// 封面卡片堆（ToC 改版（二）4.2）：跟手拖动，松手按 swipeOutcome 判定；甩出与回弹用 motion 的弹簧动画。
// 三个按钮与 ← → 回车是手势的等价替代；减少动态效果时只淡入淡出、不旋转。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { animate } from 'motion'
import { CheckOutlined, StarOutlined, SwapOutlined } from '@ant-design/icons-vue'
import { displayOuter } from '../recommend/situation'
import type { RecommendedOutfit } from '../recommend/types'
import { thumbUrl } from '../services/urls'
import { haptic } from '../services/celebrate'
import { collageSlots, coverTint, stampOpacity, swipeOutcome } from './deck'

const props = defineProps<{ outfits: RecommendedOutfit[]; index: number; busy?: boolean }>()
const emit = defineEmits<{ wear: [outfit: RecommendedOutfit, el: HTMLElement | null]; skip: [outfit: RecommendedOutfit]; open: [outfit: RecommendedOutfit]; save: [outfit: RecommendedOutfit] }>()

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
const visible = computed(() => props.outfits.slice(props.index, props.index + 3).map((outfit, depth) => ({ outfit, depth, no: props.index + depth + 1 })))
const outfits = computed(() => props.outfits)
const current = computed(() => props.outfits[props.index])
const cards = ref<HTMLElement[]>([])
const topCard = () => cards.value.find(el => el.dataset.depth === '0') ?? null
const heart = ref<{ $el: HTMLElement } | null>(null)
const slots = (outfit: RecommendedOutfit) => collageSlots(outfit.garments, path => thumbUrl(path, 480))
const tint = (outfit: RecommendedOutfit) => coverTint(outfit.garments)

let drag: { id: number; x: number; y: number; last: number; t: number; v: number; crossed: boolean; moved: boolean } | undefined
const dx = ref(0)
const flinging = ref(false)
function transformFor(x: number) { return reduced.matches ? `translateX(${x}px)` : `translateX(${x}px) rotate(${x / 18}deg)` }
function down(event: PointerEvent) {
  if (event.button !== 0 || flinging.value || props.busy || (event.target as Element).closest('button')) return
  const el = topCard(); if (!el) return
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, last: event.clientX, t: performance.now(), v: 0, crossed: false, moved: false }
  el.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return
  const el = topCard(); if (!el) return
  const now = performance.now(), x = event.clientX - drag.x
  if (!drag.moved && Math.abs(x) < 6) return
  drag.moved = true
  drag.v = (event.clientX - drag.last) / Math.max(8, now - drag.t); drag.last = event.clientX; drag.t = now
  dx.value = x; el.style.transform = transformFor(x)
  const crossed = Math.abs(x) >= 90
  if (crossed !== drag.crossed) { drag.crossed = crossed; if (crossed) haptic() }
}
function up(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return
  const { moved, v } = drag; drag = undefined
  if (!moved) { if (current.value) emit('open', current.value); return }
  const outcome = swipeOutcome(dx.value, v)
  if (outcome) void fling(outcome)
  else void settle()
}
async function settle() {
  const el = topCard(); dx.value = 0
  if (!el) return
  if (reduced.matches) { el.style.transform = ''; return }
  await animate(el, { transform: 'translateX(0px) rotate(0deg)' }, { type: 'spring', bounce: 0.45, duration: 0.5 }).finished
  el.style.transform = ''
}
/** 1 = 就穿它，-1 = 换一套。按钮和键盘也走这里，所以卡片总是先飞走再通知页面。 */
async function fling(direction: 1 | -1) {
  const outfit = current.value, el = topCard()
  if (!outfit || flinging.value) return
  flinging.value = true
  dx.value = direction * 140
  try {
    if (el) {
      const target = reduced.matches ? { opacity: 0 } : { transform: `translateX(${direction * 130}%) rotate(${direction * 22}deg)`, opacity: 0 }
      await animate(el, target, { duration: reduced.matches ? 0.18 : 0.42, ease: [0.2, 0.9, 0.15, 1] }).finished
    }
    if (direction > 0) emit('wear', outfit, heart.value?.$el ?? el); else emit('skip', outfit)
  } finally {
    dx.value = 0; flinging.value = false
    await nextTick()
    // 新顶上来的卡片：清掉内联样式，从后排轻轻升上来。
    cards.value.forEach(card => { card.style.transform = ''; card.style.opacity = '' })
  }
}
function keys(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') { event.preventDefault(); void fling(-1) }
  else if (event.key === 'ArrowRight') { event.preventDefault(); void fling(1) }
  else if (event.key === 'Enter' && current.value) { event.preventDefault(); emit('open', current.value) }
}
// 被页面放回来（撤回）的卡片从左边飞回。
async function returnFromLeft() {
  await nextTick(); const el = topCard(); if (!el || reduced.matches) return
  await animate(el, { transform: ['translateX(-120%) rotate(-18deg)', 'translateX(0px) rotate(0deg)'], opacity: [0, 1] }, { type: 'spring', bounce: 0.3, duration: 0.6 }).finished
  el.style.transform = ''
}
defineExpose({ fling, returnFromLeft })
const cancel = () => { if (drag) { drag = undefined; void settle() } }
onMounted(() => window.addEventListener('blur', cancel))
onUnmounted(() => window.removeEventListener('blur', cancel))
</script>

<template>
  <div class="cover-deck">
    <div class="cover-stack" tabindex="0" role="group" aria-roledescription="搭配卡片" :aria-label="current ? `今日推荐：${current.name}。左右方向键换一套或就穿它，回车看详情` : '今日推荐'" @keydown="keys">
      <article v-for="card in [...visible].reverse()" :key="card.outfit.key" ref="cards"
        class="cover-card" :data-depth="card.depth" :style="{ zIndex: 3 - card.depth }" :aria-hidden="card.depth > 0 || undefined"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel">
        <template v-if="card.depth === 0">
          <span class="cover-stamp yes" :style="{ opacity: stampOpacity(dx, 1) }" aria-hidden="true"><CheckOutlined /> 就穿它</span>
          <span class="cover-stamp no" :style="{ opacity: stampOpacity(dx, -1) }" aria-hidden="true">换一套</span>
        </template>
        <div class="cover-photo" :style="{ '--tint': tint(card.outfit) }">
          <div class="cover-collage">
            <img v-for="(slot, i) in (card.depth < 2 ? slots(card.outfit) : [])" :key="slot.id" :src="slot.url" alt="" draggable="false" decoding="async"
              :style="{ left: `${slot.left}%`, top: `${slot.top}%`, width: `${slot.width}%`, height: `${slot.height}%`, '--i': i }" />
          </div>
          <span class="cover-count">{{ card.no }} / {{ outfits.length }}</span>
        </div>
        <footer class="cover-copy">
          <div><h3>{{ card.outfit.name }}</h3><p>{{ card.outfit.highlights[0] || card.outfit.garments.map(g => g.name).join(' · ') }}</p><p v-if="displayOuter(card.outfit)">外套建议 · {{ displayOuter(card.outfit)?.name }}</p></div>
          <a-tooltip v-if="card.depth === 0" title="收进我的搭配"><a-button shape="circle" class="cover-save" aria-label="收进我的搭配" :disabled="busy" @click.stop="emit('save', card.outfit)"><StarOutlined /></a-button></a-tooltip>
        </footer>
      </article>
    </div>
    <div class="cover-actions">
      <a-button size="large" class="cover-skip" :disabled="!current || busy" @click="fling(-1)"><SwapOutlined /> 换一套</a-button>
      <a-button ref="heart" type="primary" size="large" class="cover-wear" :disabled="!current || busy" @click="fling(1)"><CheckOutlined /> 就穿这套</a-button>
    </div>
    <p class="cover-hint">左右滑动也可以 · 换一套不花点数</p>
  </div>
</template>

<style scoped>
.cover-deck { display: flex; flex-direction: column; align-items: stretch; }
.cover-stack { position: relative; height: clamp(340px, calc(100dvh - 380px), 540px); border-radius: 20px; outline: none; touch-action: pan-y; }
.cover-stack:focus-visible { box-shadow: 0 0 0 3px var(--focus-ring); }
.cover-card { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 12px; padding: 10px 10px 14px; overflow: hidden; border-radius: 20px; background: var(--surface); box-shadow: 0 0 0 1px var(--line), 0 10px 28px -18px #00000033; transform-origin: 50% 100%; transition: transform .45s var(--ease-out), opacity .3s ease; user-select: none; -webkit-user-select: none; cursor: grab; will-change: transform; }
.cover-card:active { cursor: grabbing; }
.cover-card[data-depth='1'] { transform: translateY(8px) scale(.965); }
.cover-card[data-depth='2'] { transform: translateY(8px) scale(.965); opacity: 0; }
.cover-card:not([data-depth='0']) { pointer-events: none; }
.cover-photo { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; container-type: size; overflow: hidden; border-radius: 14px; background: color-mix(in srgb, var(--tint) 12%, var(--surface-alt)); }
.cover-collage { position: relative; width: min(94cqw, 92cqh); height: min(94cqw, 92cqh); }
.cover-collage img { position: absolute; object-fit: contain; filter: drop-shadow(0 8px 12px #0000001a); animation: cover-drop .5s var(--ease-out) both; animation-delay: calc(var(--i) * 60ms); pointer-events: none; }
@keyframes cover-drop { from { opacity: 0; transform: translateY(-10px); } }
.cover-count { position: absolute; right: 10px; bottom: 10px; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--muted); background: var(--surface); }
.cover-copy { display: flex; align-items: center; gap: 12px; padding: 0 6px; }
.cover-copy > div { flex: 1; min-width: 0; }
.cover-copy h3 { margin: 0; overflow: hidden; font-size: 18px; font-weight: 600; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.cover-copy p { display: -webkit-box; margin: 2px 0 0; overflow: hidden; -webkit-line-clamp: 1; -webkit-box-orient: vertical; font-size: 13px; color: var(--muted); }
.cover-save.ant-btn { flex: none; width: 40px; min-width: 40px; height: 40px; }
.cover-stamp { position: absolute; top: 20px; z-index: 3; display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 14px; border-radius: 8px; font-size: 14px; font-weight: 600; opacity: 0; pointer-events: none; }
.cover-stamp.yes { left: 20px; color: var(--action-fg); background: var(--action-bg); }
.cover-stamp.no { right: 20px; color: var(--ink); background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.cover-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0 6px; }
.cover-actions .ant-btn { height: 48px; font-size: 15px; }
.cover-hint { margin: 0; text-align: center; font-size: 12px; color: var(--muted-subtle); }
@media (min-width: 1024px) { .cover-stack { height: clamp(380px, calc(100dvh - 400px), 540px); } }
@media (prefers-reduced-motion: reduce) { .cover-card { transition: none; } .cover-collage img { animation: none; } }
</style>
