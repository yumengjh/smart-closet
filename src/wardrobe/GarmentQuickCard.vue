<script setup lang="ts">
// 衣架里点一件衣物弹出的详情卡（清新改版 §4.2）：图片从衣架上“飞”进卡片左侧，右侧信息随卡片直接出现（不逐条缓动），
// 底部是“用它搭一套 / 实时试穿 / 详情与编辑”。← → 在同一隔间里切换上一件、下一件，Esc 或点背景关闭，关闭时图片飞回衣架。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CloseOutlined, LeftOutlined, RightOutlined, SkinOutlined, HeartFilled, ArrowRightOutlined, VideoCameraOutlined } from '@ant-design/icons-vue'
import type { Garment } from '../services/api'
import { thumbUrl } from '../services/urls'
import { recommendApi } from '../recommend/api'
import type { WearSummary } from '../recommend/types'
import { tryOnAccess } from '../tryon/access'
import { playSound } from '../services/sound'
import { FAMILY_SWATCH, familyFromName, garmentFamily } from './rack'
import { roleFromGarment } from '../domain/outfit'
import { wantedLabel } from './wanted'

const props = defineProps<{ items: Garment[]; index: number; origin: HTMLElement | null; bay: string }>()
const emit = defineEmits<{ close: []; move: [index: number] }>()
const router = useRouter()
const garment = computed(() => props.items[props.index])
const title = computed(() => {
  const item = garment.value
  if (item.name) return item.name
  const color = item.primaryColor[0] && item.primaryColor[0] !== '未知颜色' ? item.primaryColor[0] : ''
  return item.category[0] && item.category[0] !== '未分类' ? `${color}${item.category[0]}` : '未分类衣物'
})
// 上衣、外套、下装去“快速搭”并锁住这件；连衣裙、鞋、配饰等去“今天穿什么”的按单品推荐。
const mixable = computed(() => ['TOP', 'OUTER', 'BOTTOM'].includes(roleFromGarment(garment.value)))
const kind = computed(() => [props.bay, garment.value.subtype?.[0] || garment.value.category[0]].filter((value, i, all) => value && all.indexOf(value) === i).join(' · '))
const tint = computed(() => { const family = garmentFamily(garment.value); return family ? FAMILY_SWATCH[family] : '#cfd8d5' })
const colors = computed(() => [...garment.value.primaryColor, ...garment.value.secondaryColors].filter(name => name && name !== '未知颜色').slice(0, 4).map(name => {
  const family = familyFromName(name)
  return { name, swatch: family ? FAMILY_SWATCH[family] : garment.value.imageColor }
}))
const facts = computed(() => [
  { label: '风格', values: garment.value.styles },
  { label: '图案', values: garment.value.patterns },
  { label: '版型', values: [...(garment.value.fit || []), ...garment.value.garmentLength] },
  { label: '面料', values: [...garment.value.materialComposition, ...garment.value.texture, ...(garment.value.thickness || [])] },
  { label: '品牌', values: garment.value.brand },
].map(row => ({ ...row, values: [...new Set(row.values.filter(Boolean))].slice(0, 4) })).filter(row => row.values.length))

const wear = ref<WearSummary | null>(null)
const wearLoading = ref(false)
watch(() => garment.value.id, id => {
  wear.value = null; wearLoading.value = true
  recommendApi.wearSummary(id).then(value => { if (garment.value.id === id) wear.value = value }).catch(() => {}).finally(() => { if (garment.value.id === id) wearLoading.value = false })
}, { immediate: true })
const lastWorn = computed(() => !wear.value?.count ? '还没穿过' : wear.value.daysSince === 0 ? '今天' : wear.value.daysSince === 1 ? '昨天' : `${wear.value.daysSince} 天前`)

function go(path: string | { path: string; query: Record<string, string> }) { playSound('tap'); emit('close'); void router.push(path) }
function step(delta: number) {
  const next = props.index + delta
  if (next < 0 || next >= props.items.length) return
  playSound('tick'); emit('move', next)
}

// 图片从衣架飞进卡片：克隆原图，从原位置动画到卡片图片的位置，落地后再显示卡片里的图。
const card = ref<HTMLElement | null>(null)
const picture = ref<HTMLImageElement | null>(null)
const landed = ref(false)
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
function originImage() { return props.origin?.querySelector<HTMLImageElement>('img') ?? null }
async function fly(from: HTMLImageElement | null, to: HTMLImageElement | null, back = false) {
  if (!from || !to || calm()) return
  const a = (back ? to : from).getBoundingClientRect(), b = (back ? from : to).getBoundingClientRect()
  if (!a.width || !b.width) return
  const ghost = (back ? to : from).cloneNode() as HTMLImageElement
  ghost.removeAttribute('id'); ghost.className = 'garment-quick-ghost'
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` })
  document.body.appendChild(ghost)
  const dx = b.left - a.left, dy = b.top - a.top, s = Math.min(b.width / a.width, b.height / a.height)
  await ghost.animate([{ transform: 'none' }, { transform: `translate(${dx + (b.width - a.width * s) / 2}px, ${dy + (b.height - a.height * s) / 2}px) scale(${s})` }], { duration: back ? 380 : 520, easing: 'cubic-bezier(.2,.9,.15,1)', fill: 'forwards' }).finished.catch(() => {})
  ghost.remove()
}
const scrimOn = ref(false)
onMounted(async () => {
  scrimOn.value = true
  const source = originImage()
  if (source) source.style.visibility = 'hidden'
  await nextTick()
  card.value?.focus({ preventScroll: true })
  if (!calm()) {
    card.value?.animate([{ opacity: 0, scale: '.96', translate: '0 14px' }, { opacity: 1, scale: '1', translate: '0 0' }], { duration: 360, easing: 'cubic-bezier(.2,.9,.15,1)' })
  }
  await fly(source, picture.value)
  landed.value = true
  if (source) source.style.visibility = ''
})
/** Called by the parent before it unmounts the card: the picture flies back to the rack while the card fades. */
async function leave() {
  scrimOn.value = false
  const source = originImage()
  landed.value = false
  if (source) source.style.visibility = 'hidden'
  const fade = calm() ? Promise.resolve() : card.value?.animate([{ opacity: 1 }, { opacity: 0, scale: '.97', translate: '0 10px' }], { duration: 240, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {})
  await Promise.all([fly(source, picture.value, true), fade])
  if (source) source.style.visibility = ''
}
defineExpose({ leave })
watch(() => props.index, () => { landed.value = true })

function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close') }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
  else if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
}
onMounted(() => window.addEventListener('keydown', keys))
onUnmounted(() => window.removeEventListener('keydown', keys))
</script>

<template>
  <Teleport to="body">
    <div class="garment-quick-scrim" :class="{ on: scrimOn }" @click="emit('close')"></div>
    <section ref="card" class="garment-quick" role="dialog" aria-modal="true" :aria-label="`${title}，衣物详情`" tabindex="-1" :style="{ '--tint': tint }">
      <div class="garment-quick-image">
        <span class="garment-quick-floor" aria-hidden="true"></span>
        <Transition name="garment-quick-swap" mode="out-in">
          <img :key="garment.id" ref="picture" :src="thumbUrl(garment.displayUrl, 720)" :alt="title" :class="{ hidden: !landed }" draggable="false" />
        </Transition>
        <span class="garment-quick-pager">
          <a-button type="text" shape="circle" aria-label="上一件" :disabled="index === 0" @click="step(-1)"><LeftOutlined /></a-button>
          <small>{{ index + 1 }} / {{ items.length }}</small>
          <a-button type="text" shape="circle" aria-label="下一件" :disabled="index === items.length - 1" @click="step(1)"><RightOutlined /></a-button>
        </span>
      </div>
      <div class="garment-quick-info">
        <a-button class="garment-quick-close" type="text" shape="circle" aria-label="关闭" @click="emit('close')"><CloseOutlined /></a-button>
        <header>
          <small>{{ kind }}</small>
          <h2>{{ title }}<HeartFilled v-if="garment.favorite" class="garment-quick-fav" aria-label="已收藏" /></h2>
          <span v-if="garment.status === 'WANTED'" class="garment-quick-badge">{{ wantedLabel }} · 还没买</span>
          <span v-if="garment.sourceOrigin === 'PRESET'" class="garment-quick-badge">预设示意图</span>
        </header>
        <div class="garment-quick-stats">
          <div><b>{{ wearLoading ? '…' : wear?.count ?? 0 }}</b><span>穿过次数</span></div>
          <div><b class="small">{{ wearLoading ? '…' : lastWorn }}</b><span>上次穿</span></div>
          <div><b class="small">{{ garment.seasons.slice(0, 2).join(' / ') || '四季' }}</b><span>季节</span></div>
        </div>
        <div v-if="colors.length" class="garment-quick-row">
          <span class="garment-quick-label">颜色</span>
          <span class="garment-quick-colors"><span v-for="color in colors" :key="color.name"><i :style="{ background: color.swatch }"></i>{{ color.name }}</span></span>
        </div>
        <div v-for="row in facts" :key="row.label" class="garment-quick-row">
          <span class="garment-quick-label">{{ row.label }}</span>
          <span class="garment-quick-tags"><em v-for="value in row.values" :key="value">{{ value }}</em></span>
        </div>
        <footer class="garment-quick-actions">
          <a-button type="primary" shape="round" size="large" class="garment-quick-main" @click="go({ path: '/outfits', query: mixable ? { mix: garment.id } : { with: garment.id } })"><SkinOutlined /> 用它搭一套</a-button>
          <a-button v-if="tryOnAccess?.enabled" shape="round" size="large" @click="go({ path: '/try-on', query: { garment: garment.id } })"><VideoCameraOutlined /> 试穿</a-button>
          <a-button shape="round" size="large" @click="go(`/garment/${garment.id}`)">详情与编辑 <ArrowRightOutlined /></a-button>
        </footer>
      </div>
    </section>
  </Teleport>
</template>

<style>
/* Teleported to <body>, so not scoped. */
.garment-quick-scrim { position: fixed; inset: 0; z-index: 940; background: color-mix(in srgb, var(--paper) 55%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); opacity: 0; transition: opacity .35s ease; }
.garment-quick-scrim.on { opacity: 1; }
.garment-quick { position: fixed; left: 50%; top: 50%; z-index: 941; display: grid; grid-template-columns: 1.05fr 1fr; width: min(860px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); overflow: hidden; border-radius: 32px; background: var(--surface); box-shadow: 0 40px 90px -30px #0d3b3366, 0 0 0 1px var(--line); transform: translate(-50%, -50%); outline: none; }
.garment-quick-image { position: relative; display: grid; place-items: center; min-height: 460px; background: color-mix(in srgb, var(--tint) 18%, var(--surface-alt)); }
.garment-quick-image img { position: relative; z-index: 1; max-width: 76%; max-height: 360px; object-fit: contain; filter: drop-shadow(0 18px 20px #0d3b3326); user-select: none; }
.garment-quick-image img.hidden { visibility: hidden; }
.garment-quick-floor { position: absolute; left: 26%; right: 26%; bottom: 13%; height: 16px; border-radius: 50%; background: radial-gradient(closest-side, #0d3b3326, transparent); }
.garment-quick-pager { position: absolute; left: 50%; bottom: 16px; z-index: 2; display: flex; align-items: center; gap: 4px; padding: 3px; border-radius: 999px; transform: translateX(-50%); background: var(--glass); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 0 0 1px var(--line); }
.garment-quick-pager small { min-width: 44px; font-size: 12px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
.garment-quick-pager .ant-btn { width: 32px; min-width: 32px; height: 32px; color: var(--muted-strong); }
.garment-quick-ghost { position: fixed; z-index: 945; margin: 0; object-fit: contain; transform-origin: 0 0; pointer-events: none; filter: drop-shadow(0 18px 20px #0d3b3326); }
.garment-quick-swap-enter-active, .garment-quick-swap-leave-active { transition: opacity .2s ease, transform .3s cubic-bezier(.2,.9,.15,1); }
.garment-quick-swap-enter-from { opacity: 0; transform: translateX(16px) scale(.97); }
.garment-quick-swap-leave-to { opacity: 0; transform: translateX(-16px) scale(.97); }

.garment-quick-info { position: relative; display: flex; flex-direction: column; gap: 18px; min-width: 0; padding: 30px 30px 26px; overflow-y: auto; }
.garment-quick-close.ant-btn { position: absolute; top: 16px; right: 16px; width: 38px; height: 38px; color: var(--muted-strong); }
.garment-quick-info header { padding-right: 40px; }
.garment-quick-info header small { font-size: 12px; letter-spacing: .06em; color: var(--accent-strong); }
.garment-quick-info h2 { display: flex; align-items: center; gap: 8px; margin: 6px 0 0; font-size: 24px; font-weight: 600; line-height: 1.35; }
.garment-quick-fav { font-size: 16px; color: #e5674f; }
.garment-quick-badge { display: inline-block; margin-top: 8px; padding: 1px 8px; border-radius: 999px; font-size: 11px; color: var(--muted-strong); background: var(--surface-alt); }
.garment-quick-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.garment-quick-stats > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 18px; background: var(--surface-alt); }
.garment-quick-stats b { font-size: 24px; font-weight: 600; line-height: 30px; font-variant-numeric: tabular-nums; }
.garment-quick-stats b.small { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.garment-quick-stats span { font-size: 12px; color: var(--muted); }
.garment-quick-row { display: flex; align-items: baseline; gap: 14px; font-size: 13px; }
.garment-quick-label { flex: none; width: 32px; color: var(--muted); }
.garment-quick-colors, .garment-quick-tags { display: flex; flex-wrap: wrap; gap: 6px 12px; min-width: 0; }
.garment-quick-colors span { display: inline-flex; align-items: center; gap: 6px; color: var(--muted-strong); }
.garment-quick-colors i { width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 1px #0d1f1b22; }
.garment-quick-tags { gap: 6px; }
.garment-quick-tags em { padding: 3px 10px; border-radius: 999px; font-style: normal; font-size: 12px; color: var(--muted-strong); background: var(--surface-alt); }
.garment-quick-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; padding-top: 6px; }
.garment-quick-actions .ant-btn { display: inline-flex; flex: 1 1 0; align-items: center; justify-content: center; gap: 6px; min-width: 0; padding-inline: 14px; overflow: hidden; white-space: nowrap; }
.garment-quick-actions .garment-quick-main { flex-basis: 100%; }
@media (max-width: 767px) {
  .garment-quick { top: auto; bottom: 8px; grid-template-columns: 1fr; max-height: calc(100dvh - 24px); border-radius: 28px; transform: translate(-50%, 0); overflow-y: auto; }
  .garment-quick-image { min-height: 260px; }
  .garment-quick-image img { max-height: 220px; }
  .garment-quick-info { padding: 22px 20px 20px; overflow: visible; }
}
@media (prefers-reduced-motion: reduce) { .garment-quick-scrim, .garment-quick-swap-enter-active, .garment-quick-swap-leave-active { transition: none; } }
</style>
