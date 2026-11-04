<script setup lang="ts">
// 衣架视图（docs/design/2026-11-04-清新改版：胶囊导航与衣架衣柜设计.md §4）：同一页的衣物按品类挂在几个隔间里。
// 默认叠挂（只露出一截），指针移进隔间整排展开，停在某件上它再让开两边、轻轻摆一下并显示名称；鞋和配饰放在搁板上。
// 触屏没有悬停：默认展开、名称常显。色谱条悬停某段时，上方浮出“颜色 · 件数”，其余衣物淡出。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import type { Garment } from '../services/api'
import { thumbUrl } from '../services/urls'
import { playSound } from '../services/sound'
import { colorFamilies, garmentFamily, pileTilt, rackBays, type Bay, type ColorFamily } from './rack'
import GarmentQuickCard from './GarmentQuickCard.vue'

/** spread: 0 = 叠放 … 1 = 散开（工具条滑块）。 */
const props = defineProps<{ items: Garment[]; reviews?: Record<string, { message?: string } | undefined>; spread: number }>()
const bays = computed(() => rackBays(props.items))
const families = computed(() => colorFamilies(props.items))
const focusFamily = ref<ColorFamily | null>(null)
// The label floats above the hovered segment (no legend underneath); it slides from segment to segment.
const tip = ref<{ x: number; text: string } | null>(null)
function hoverFamily(event: PointerEvent, family: ColorFamily, count: number) {
  const el = event.currentTarget as HTMLElement
  focusFamily.value = family
  tip.value = { x: el.offsetLeft + el.offsetWidth / 2, text: `${family}色系 · ${count} 件` }
}
function leaveFamilies() { focusFamily.value = null; tip.value = null }
const familyOf = (item: Garment) => garmentFamily(item)
function title(item: Garment) {
  if (item.name) return item.name
  const color = item.primaryColor[0] && item.primaryColor[0] !== '未知颜色' ? item.primaryColor[0] : ''
  return item.category[0] && item.category[0] !== '未分类' ? `${color}${item.category[0]}` : '未分类衣物'
}
// 点一件衣物：在原地弹出详情卡（GarmentQuickCard），← → 在同一隔间切换；卡片里的“详情与编辑”再进详情页。
const quick = ref<{ bay: Bay; index: number } | null>(null)
const quickCard = ref<InstanceType<typeof GarmentQuickCard> | null>(null)
let closing = false
function open(item: Garment, bay: Bay) { if (closing) return; playSound('pop'); quick.value = { bay, index: bay.items.indexOf(item) } }
const quickOrigin = computed(() => {
  const current = quick.value && quick.value.bay.items[quick.value.index]
  return current ? root.value?.querySelector<HTMLElement>(`.rack-hang[data-id="${current.id}"]`) ?? null : null
})
async function closeQuick() {
  if (!quick.value || closing) return
  closing = true
  await quickCard.value?.leave()
  quick.value = null; closing = false
}
function moveQuick(index: number) {
  if (!quick.value) return
  quick.value = { ...quick.value, index }
  quickOrigin.value?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
}
watch(() => props.items, () => { quick.value = null })

// Rows drop in one after another the first time a bay scrolls into view.
const root = ref<HTMLElement | null>(null)
const seen = ref(new Set<string>())
let observer: IntersectionObserver | null = null
function observe() {
  observer?.disconnect()
  if (typeof IntersectionObserver === 'undefined') { seen.value = new Set(bays.value.map(bay => bay.key)); return }
  observer = new IntersectionObserver(entries => {
    const next = new Set(seen.value)
    for (const entry of entries) if (entry.isIntersecting) { next.add((entry.target as HTMLElement).dataset.bay!); observer?.unobserve(entry.target) }
    seen.value = next
  }, { rootMargin: '0px 0px -10% 0px' })
  root.value?.querySelectorAll<HTMLElement>('.rack-bay').forEach(el => { if (!seen.value.has(el.dataset.bay!)) observer!.observe(el) })
}
onMounted(observe)
watch(() => props.items.map(item => item.id).join(), () => { seen.value = new Set(); requestAnimationFrame(observe) })
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div ref="root" class="wardrobe-rack" :class="{ focusing: focusFamily }" :style="{ '--spread': spread }">
    <div v-if="families.length" class="rack-palette" aria-label="本页颜色分布">
      <span class="rack-palette-title">衣柜色谱</span>
      <div class="rack-spectrum" @pointerleave="leaveFamilies">
        <i v-for="share in families" :key="share.family" :class="{ hl: focusFamily === share.family }" :style="{ flexGrow: share.count, background: share.swatch }" :aria-label="`${share.family}色系 ${share.count} 件`" role="img" @pointerenter="hoverFamily($event, share.family, share.count)"></i>
        <span class="rack-spectrum-tip" :class="{ show: tip }" :style="{ left: `${tip?.x ?? 0}px` }" aria-hidden="true">{{ tip?.text }}</span>
      </div>
    </div>
    <section v-for="bay in bays" :key="bay.key" class="rack-bay" :class="{ shelf: bay.shelf, in: seen.has(bay.key), holding: quick?.bay.key === bay.key }" :data-bay="bay.key" :aria-label="`${bay.label}，${bay.items.length} 件`">
      <header class="rack-bay-head"><h2>{{ bay.label }}</h2><small>{{ bay.items.length }} 件</small><span class="rack-bay-hint">移过来展开 · 右上角滑块调松紧</span></header>
      <div class="rack-wrap">
        <template v-if="!bay.shelf"><span class="rack-end left"></span><span class="rack-rod"></span><span class="rack-end right"></span></template>
        <span v-else class="rack-shelf"></span>
        <div class="rack-lane">
          <article v-for="(item, index) in bay.items" :key="item.id" :data-id="item.id" class="rack-hang" :class="{ dim: focusFamily && familyOf(item) !== focusFamily }" :style="{ '--i': index, '--r': `${pileTilt(item.id)}deg` }" tabindex="0" role="link" :aria-label="`打开${title(item)}`" @click="open(item, bay)" @keydown.enter="open(item, bay)">
            <div class="rack-swing">
              <svg v-if="!bay.shelf" class="rack-hanger" viewBox="0 0 96 52" aria-hidden="true"><path class="hook" d="M48 19V13A5 5 0 1 0 43 8" /><path class="body" d="M48 20L86 42Q89 45 86 45H10Q7 45 10 42Z" /><circle class="knob" cx="48" cy="20" r="2" /></svg>
              <div class="rack-cloth">
                <span class="rack-fig">
                  <img :src="thumbUrl(item.displayUrl, 320)" :alt="title(item)" loading="lazy" decoding="async" draggable="false" />
                </span>
              </div>
            </div>
            <span v-if="reviews?.[item.id]?.message" class="rack-flag" :title="`需核对：${reviews[item.id]!.message}`">需核对</span>
            <span v-if="item.sourceOrigin === 'PRESET'" class="rack-flag preset" title="预设衣物的示意图，可在详情里换成自己的照片">预设</span>
            <div class="rack-foot"></div>
          </article>
          <RouterLink to="/add" class="rack-slot" :aria-label="`添加${bay.label}`"><PlusOutlined />收录{{ bay.label }}</RouterLink>
        </div>
      </div>
    </section>
    <GarmentQuickCard v-if="quick" ref="quickCard" :items="quick.bay.items" :index="quick.index" :bay="quick.bay.label" :origin="quickOrigin" @close="closeQuick" @move="moveQuick" />
  </div>
</template>

<style scoped>
.wardrobe-rack { --rail: #bfdcd3; --rail-end: #9fcfc1; --bayfill: #f3f7f6; --spring: cubic-bezier(.3, 1.45, .45, 1); --ease: cubic-bezier(.2, .8, .2, 1); }
:root[data-theme='dark'] .wardrobe-rack { --rail: #2f4b44; --rail-end: #3e6a5e; --bayfill: #151c1a; }

/* 色谱：按颜色家族分段，宽度 = 件数 */
.rack-palette { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 16px; margin: 30px 0 6px; font-size: 12px; color: var(--muted); }
.rack-palette-title { white-space: nowrap; }
.rack-spectrum { position: relative; display: flex; height: 12px; gap: 3px; }
.rack-spectrum-tip { position: absolute; bottom: calc(100% + 12px); z-index: 3; padding: 4px 10px; border-radius: 999px; white-space: nowrap; font-size: 12px; color: var(--ink); pointer-events: none; opacity: 0; transform: translate(-50%, 4px); background: var(--glass); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 6px 18px -8px #0d3b3355, 0 0 0 1px var(--line); transition: opacity .2s, transform .3s var(--spring), left .35s var(--spring); }
.rack-spectrum-tip.show { opacity: 1; transform: translate(-50%, 0); }
.rack-spectrum i { display: block; height: 100%; border-radius: 4px; box-shadow: inset 0 0 0 1px #0d1f1b14; cursor: default; transform-origin: 50% 50%; animation: rack-grow .9s var(--ease) backwards; transition: transform .3s var(--spring), opacity .2s; }
.rack-spectrum i:first-child { border-radius: 999px 4px 4px 999px; }
.rack-spectrum i:last-child { border-radius: 4px 999px 999px 4px; }
.rack-spectrum i:only-child { border-radius: 999px; }
.rack-spectrum:hover i:not(.hl) { opacity: .35; }
.rack-spectrum i:hover, .rack-spectrum i.hl { opacity: 1; transform: scaleY(1.6); }
@keyframes rack-grow { from { transform: scaleX(0); } }

/* 隔间 */
.rack-bay { position: relative; margin-top: 22px; padding: 18px 0 6px; overflow: hidden; border-radius: 30px; background: var(--bayfill); }
.rack-bay-head { display: flex; align-items: baseline; gap: 10px; height: 24px; padding: 0 26px; }
.rack-bay-head h2 { margin: 0; font-size: 17px; font-weight: 500; }
.rack-bay-head small { color: var(--muted); font-size: 13px; }
.rack-bay-hint { margin-left: auto; font-size: 12px; color: var(--muted); transition: opacity .3s; }
.rack-bay:hover .rack-bay-hint { opacity: 0; }
.rack-wrap { position: relative; margin: 0 6px; }
.rack-rod { position: absolute; left: 16px; right: 16px; top: 24.5px; z-index: 1; height: 3px; border-radius: 3px; background: var(--rail); }
.rack-end { position: absolute; top: 21px; z-index: 2; width: 10px; height: 10px; border-radius: 50%; background: var(--rail-end); box-shadow: 0 0 0 3px var(--bayfill); }
.rack-end.left { left: 11px; }
.rack-end.right { right: 11px; }
.rack-shelf { position: absolute; left: 16px; right: 16px; bottom: 44px; height: 3px; border-radius: 3px; background: var(--rail); }
.rack-shelf::before, .rack-shelf::after { content: ''; position: absolute; top: -3.5px; width: 10px; height: 10px; border-radius: 50%; background: var(--rail-end); }
.rack-shelf::before { left: -5px; }
.rack-shelf::after { right: -5px; }

/* 一排：默认叠挂（负外边距），悬停隔间展开，悬停某件再让开两边 */
.rack-lane { position: relative; z-index: 2; display: flex; padding: 18px 40px 0 30px; overflow-x: auto; scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 26px, #000 calc(100% - 60px), transparent); mask-image: linear-gradient(90deg, transparent 0, #000 26px, #000 calc(100% - 60px), transparent); }
.rack-lane::-webkit-scrollbar { display: none; }
/* 叠放程度由 --spread（0 叠放 ~ 1 散开，工具条里的滑块）决定：外边距在 --tight 与 --loose 之间插值，越叠放越歪。 */
.rack-hang { --w: 168px; --tight: -110px; --loose: 10px; position: relative; flex: none; width: var(--w); margin-left: calc(var(--tight) + (var(--loose) - var(--tight)) * var(--spread, 0)); cursor: pointer; outline: none; transition: margin .55s var(--spring), opacity .25s; animation: rack-drop .8s var(--spring) backwards paused; animation-delay: calc(var(--i) * 55ms); }
.rack-bay.in .rack-hang { animation-play-state: running; }
.rack-hang:first-child { margin-left: 0; }
@media (hover: hover) { .rack-lane:hover .rack-hang:not(:first-child), .rack-lane:focus-within .rack-hang:not(:first-child) { margin-left: max(-20px, calc(var(--tight) + (var(--loose) - var(--tight)) * var(--spread, 0))); } }
.rack-bay.holding .rack-hang:not(:first-child) { margin-left: max(-20px, calc(var(--tight) + (var(--loose) - var(--tight)) * var(--spread, 0))); }
@media (hover: hover) { .rack-lane .rack-hang:is(:hover, :focus-visible):not(:first-child), .rack-lane .rack-hang:is(:hover, :focus-visible) + .rack-hang { margin-left: max(14px, calc(var(--tight) + (var(--loose) - var(--tight)) * var(--spread, 0))); } }
.rack-hang:is(:hover, :focus-visible) { z-index: 20; }
.rack-hang.dim { opacity: .18; }
@keyframes rack-drop { from { opacity: 0; transform: translateY(-34px) rotate(-7deg); } 60% { opacity: 1; } }
.rack-swing { position: relative; width: 100%; height: 244px; transform-origin: 50% 8px; transition: transform .7s var(--spring); }
.rack-hang:is(:hover, :focus-visible) .rack-swing { transform: rotate(-3deg); }
.rack-hang:active .rack-swing { transform: rotate(-1deg) translateY(-6px); }
.rack-hanger { position: absolute; left: 50%; top: 0; z-index: 1; width: 96px; height: 52px; margin-left: -48px; overflow: visible; }
.rack-hanger .hook, .rack-hanger .body { fill: none; stroke: var(--rail-end); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.rack-hanger .knob { fill: var(--rail-end); }
/* 衣物压在衣架上面（z-index 高于衣架） */
.rack-cloth { position: absolute; inset: 30px 0 0; z-index: 2; display: flex; align-items: flex-start; justify-content: center; transform: rotate(calc(var(--r) * (1 - var(--spread, 0)))); transform-origin: 50% 0; transition: transform .6s var(--spring); }
@media (hover: hover) { .rack-lane:hover .rack-cloth { transform: none; } }
.rack-bay.holding .rack-cloth { transform: none; }
.rack-fig { position: relative; display: block; }
.rack-cloth img { display: block; max-width: 150px; max-height: 210px; object-fit: contain; user-select: none; filter: drop-shadow(0 10px 12px #0d3b3318) drop-shadow(-6px 0 10px #0d3b330f); transition: filter .4s, transform .5s var(--spring); }
.rack-hang:is(:hover, :focus-visible) .rack-cloth img { transform: scale(1.04); filter: drop-shadow(0 18px 18px #0d3b3326); }
.rack-flag { position: absolute; top: 40px; left: 18px; z-index: 6; padding: 1px 7px; border-radius: 999px; font-size: 11px; color: var(--warning); background: var(--warning-bg); }
.rack-flag.preset { color: var(--muted-strong); background: var(--surface-alt); }
.rack-flag + .rack-flag { top: 62px; }
.rack-foot { height: 22px; }

/* 搁板（鞋、包与配饰）：不挂衣架，立在板上，悬停上浮 */
.rack-bay.shelf .rack-lane { padding-top: 6px; }
.rack-bay.shelf .rack-hang { --w: 150px; --tight: -96px; --loose: 8px; }
.rack-bay.shelf .rack-hang:first-child { margin-left: 0; }
.rack-bay.shelf .rack-swing { height: 150px; transform: none !important; }
.rack-bay.shelf .rack-cloth { top: 0; align-items: flex-end; transform-origin: 50% 100%; }
.rack-bay.shelf .rack-hang:is(:hover, :focus-visible) .rack-cloth { transform: translateY(-10px); }
.rack-bay.shelf .rack-cloth img { max-width: 130px; max-height: 120px; }
.rack-bay.shelf .rack-flag { top: 4px; }

/* 末尾的“收录”空位：展开后才出现 */
.rack-slot { display: grid; flex: none; place-content: center; justify-items: center; gap: 8px; align-self: stretch; width: 128px; margin: 40px 0 46px 30px; border: 1.5px dashed color-mix(in srgb, var(--muted) 40%, transparent); border-radius: 22px; font-size: 13px; color: var(--muted); opacity: 0; transform: scale(.92); transition: opacity .3s, transform .4s var(--spring), border-color .2s, color .2s; }
.rack-lane:hover .rack-slot, .rack-slot:focus-visible { opacity: 1; transform: none; }
.rack-slot:hover { border-color: var(--accent); color: var(--accent-strong); }
.rack-bay.shelf .rack-slot { margin: 8px 0 52px 30px; }

/* 触屏没有悬停：默认展开、名称常显 */
@media (hover: none) {
  .rack-bay-hint { display: none; }
  .rack-slot { opacity: 1; transform: none; }
}
@media (max-width: 767px) {
  .rack-palette-title { display: none; }
  .rack-bay { margin-inline: -6px; border-radius: 24px; }
  .rack-bay-head { padding: 0 18px; }
  .rack-lane { padding-left: 16px; }
  .rack-hang { --w: 132px; --tight: -86px; --loose: 6px; }
  .rack-swing { height: 216px; }
  .rack-cloth img { max-width: 120px; max-height: 180px; }
  .rack-bay.shelf .rack-hang { --w: 118px; --tight: -76px; --loose: 6px; }
  .rack-bay.shelf .rack-swing { height: 124px; }
  .rack-bay.shelf .rack-cloth img { max-width: 104px; max-height: 96px; }
}
@media (prefers-reduced-motion: reduce) {
  .rack-hang, .rack-spectrum i { animation: none; }
  .rack-hang, .rack-swing, .rack-cloth, .rack-cloth img, .rack-slot, .rack-spectrum i, .rack-spectrum-tip { transition: none; }
}
</style>
