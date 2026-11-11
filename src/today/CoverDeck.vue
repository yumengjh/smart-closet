<script setup lang="ts">
// 封面卡片堆（ToC 改版（二）4.2）：跟手拖动，松手按 swipeOutcome 判定；甩出与回弹用 motion 的弹簧动画。
// 三个按钮与 ← → 回车是手势的等价替代；减少动态效果时只淡入淡出、不旋转。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { animate } from 'motion'
import { CloseOutlined, HeartFilled, StarOutlined } from '@ant-design/icons-vue'
import type { RecommendedOutfit } from '../recommend/types'
import { thumbUrl } from '../services/urls'
import { haptic } from '../services/celebrate'
import { collageSlots, coverTint, issueNo, masthead, stampOpacity, swipeOutcome } from './deck'

const props = defineProps<{ outfits: RecommendedOutfit[]; index: number; weather: string; busy?: boolean }>()
const emit = defineEmits<{ wear: [outfit: RecommendedOutfit, el: HTMLElement | null]; skip: [outfit: RecommendedOutfit]; open: [outfit: RecommendedOutfit]; save: [outfit: RecommendedOutfit] }>()

const today = masthead(new Date())
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
const visible = computed(() => props.outfits.slice(props.index, props.index + 3).map((outfit, depth) => ({ outfit, depth, no: props.index + depth + 1 })))
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
        class="cover-card" :data-depth="card.depth" :style="{ '--tint': tint(card.outfit), zIndex: 3 - card.depth }" :aria-hidden="card.depth > 0 || undefined"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel">
        <template v-if="card.depth === 0">
          <span class="cover-stamp yes" :style="{ opacity: stampOpacity(dx, 1) }" aria-hidden="true">就穿它</span>
          <span class="cover-stamp no" :style="{ opacity: stampOpacity(dx, -1) }" aria-hidden="true">换一套</span>
        </template>
        <header class="cover-mast"><strong>{{ today.day }}</strong><span>{{ today.week }}<br><small>{{ weather }}</small></span><em>{{ issueNo(card.no) }}</em></header>
        <div class="cover-collage">
          <img v-for="(slot, i) in (card.depth < 2 ? slots(card.outfit) : [])" :key="slot.id" :src="slot.url" alt="" draggable="false" decoding="async"
            :style="{ left: `${slot.left}%`, top: `${slot.top}%`, width: `${slot.width}%`, height: `${slot.height}%`, '--i': i }" />
        </div>
        <footer class="cover-copy"><h3>{{ card.outfit.name }}</h3><p>{{ card.outfit.highlights[0] || card.outfit.garments.map(g => g.name).join(' · ') }}</p></footer>
      </article>
    </div>
    <div class="cover-actions">
      <a-tooltip title="换一套 ←"><a-button shape="circle" class="cover-round" aria-label="换一套" :disabled="!current || busy" @click="fling(-1)"><CloseOutlined /></a-button></a-tooltip>
      <a-tooltip title="就穿它 →"><a-button ref="heart" shape="circle" class="cover-round big" aria-label="就穿它" :disabled="!current || busy" @click="fling(1)"><HeartFilled /></a-button></a-tooltip>
      <a-tooltip title="收进我的搭配"><a-button shape="circle" class="cover-round" aria-label="收进我的搭配" :disabled="!current || busy" @click="current && emit('save', current)"><StarOutlined /></a-button></a-tooltip>
    </div>
    <p class="cover-hint">左滑换一套 · 右滑就穿它 · 换一套不花点数</p>
  </div>
</template>

<style scoped>
.cover-deck { display: flex; flex-direction: column; align-items: stretch; }
.cover-stack { position: relative; height: min(580px, calc(100dvh - 300px)); min-height: 440px; border-radius: 30px; outline: none; touch-action: pan-y; }
.cover-stack:focus-visible { box-shadow: 0 0 0 3px var(--focus-ring); }
.cover-card { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 18px 18px 20px; overflow: hidden; border-radius: 30px; background: color-mix(in srgb, var(--tint) 30%, var(--surface)); box-shadow: 0 18px 40px -18px #3b241a55, 0 0 0 1px color-mix(in srgb, var(--ink) 6%, transparent); transform-origin: 50% 100%; transition: transform .45s var(--ease-out), opacity .3s ease; user-select: none; -webkit-user-select: none; cursor: grab; will-change: transform; }
.cover-card:active { cursor: grabbing; }
.cover-card[data-depth='1'] { transform: translateY(14px) scale(.95); opacity: .8; }
.cover-card[data-depth='2'] { transform: translateY(28px) scale(.9); opacity: .45; }
.cover-card:not([data-depth='0']) { pointer-events: none; }
.cover-mast { display: flex; align-items: flex-end; gap: 10px; min-width: 0; }
.cover-mast strong { flex: none; font-family: var(--display); font-size: 46px; font-weight: 400; line-height: .9; letter-spacing: -.01em; }
.cover-mast span { min-width: 0; font-size: 13px; line-height: 1.35; color: color-mix(in srgb, var(--ink) 72%, transparent); }
.cover-mast small { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 1; -webkit-box-orient: vertical; font-size: 12px; }
.cover-mast em { flex: none; margin-left: auto; font-family: var(--display); font-style: normal; font-size: 13px; letter-spacing: .18em; color: color-mix(in srgb, var(--ink) 55%, transparent); }
.cover-collage { position: relative; flex: 1; min-height: 0; margin: 10px auto 6px; aspect-ratio: 1; max-width: 100%; }
.cover-collage img { position: absolute; object-fit: contain; filter: drop-shadow(0 10px 14px #0000001f); animation: cover-drop .6s var(--spring) both; animation-delay: calc(var(--i) * 70ms); pointer-events: none; }
@keyframes cover-drop { from { opacity: 0; transform: translateY(-16px) scale(.94); } }
.cover-copy h3 { margin: 0; font-family: 'Songti SC', 'Noto Serif SC', 'STSong', var(--display); font-size: 26px; font-weight: 700; line-height: 1.25; }
.cover-copy p { display: -webkit-box; margin: 4px 0 0; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; color: color-mix(in srgb, var(--ink) 72%, transparent); }
.cover-stamp { position: absolute; top: 88px; z-index: 3; padding: 4px 14px; border: 3px solid currentColor; border-radius: 12px; font-family: 'Songti SC', 'Noto Serif SC', var(--display); font-size: 24px; font-weight: 800; opacity: 0; pointer-events: none; }
.cover-stamp.yes { left: 22px; color: var(--accent); transform: rotate(-12deg); }
.cover-stamp.no { right: 22px; color: var(--ink); transform: rotate(12deg); }
.cover-actions { display: flex; align-items: center; justify-content: center; gap: 20px; margin: 22px 0 6px; }
.cover-round.ant-btn { display: grid; place-items: center; width: 58px; min-width: 58px; height: 58px; border: 0; color: var(--ink); background: var(--surface); box-shadow: 0 0 0 1px var(--line), 0 8px 20px -10px #3b241a40; font-size: 20px; transition: transform .25s var(--spring); }
.cover-round.ant-btn:active { transform: scale(.88); }
.cover-round.big.ant-btn { width: 76px; min-width: 76px; height: 76px; color: #fff; background: var(--brand); box-shadow: 0 14px 28px -10px color-mix(in srgb, var(--brand) 70%, transparent); font-size: 30px; }
html .cover-round.big.ant-btn:hover, html .cover-round.big.ant-btn:focus-visible { color: #fff; background: color-mix(in srgb, var(--brand) 88%, #000); }
.cover-hint { margin: 0; text-align: center; font-size: 12px; color: var(--muted-subtle); }
@media (min-width: 1024px) { .cover-stack { height: 600px; } }
@media (prefers-reduced-motion: reduce) { .cover-card, .cover-round.ant-btn { transition: none; } .cover-collage img { animation: none; } }
</style>
