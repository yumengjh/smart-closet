<script setup lang="ts">
// 快速搭（清新改版 §6）：上下两排卡片，上面上衣、下面下装，各自左右滑动切换，像翻小卡片一样快速预览一套。
// 每排可以锁住；“随机一套”只换没锁的排；“评一评”用本地推荐引擎给这一套打分（零模型调用，只在点按时计算一次）；
// 满意了“在搭台打开”，带着这两件进组合台继续排版、保存。连衣裙等连体衣物暂不进这两排。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App as AntApp } from 'ant-design-vue'
import { LockOutlined, UnlockOutlined, LeftOutlined, RightOutlined, StarOutlined, PlusOutlined } from '@ant-design/icons-vue'
import type { Garment } from '../services/api'
import { activeCloset } from '../services/activeCloset'
import { thumbUrl } from '../services/urls'
import { roleFromGarment } from '../domain/outfit'
import { candidateScene } from '../agent/bridge'
import { createUuid } from '../domain/id'
import { recommendApi } from '../recommend/api'
import type { RecommendedOutfit } from '../recommend/types'
import { useClosetStore } from '../stores/closet'
import { playSound } from '../services/sound'
import { FAMILY_SWATCH, garmentFamily } from '../wardrobe/rack'

type RowKey = 'top' | 'bottom'
const route = useRoute(); const router = useRouter(); const closet = useClosetStore(); const { message } = AntApp.useApp()
const loading = ref(true); const error = ref('')
const rows = ref<Record<RowKey, Garment[]>>({ top: [], bottom: [] })
const current = ref<Record<RowKey, number>>({ top: 0, bottom: 0 })
const locked = ref<Record<RowKey, boolean>>({ top: false, bottom: false })
const tracks = ref<Record<RowKey, HTMLElement | null>>({ top: null, bottom: null })
const ROWS: { key: RowKey; label: string }[] = [{ key: 'top', label: '上衣' }, { key: 'bottom', label: '下装' }]
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function title(item: Garment) {
  if (item.name) return item.name
  const color = item.primaryColor[0] && item.primaryColor[0] !== '未知颜色' ? item.primaryColor[0] : ''
  return item.category[0] && item.category[0] !== '未分类' ? `${color}${item.category[0]}` : '未分类衣物'
}
const tint = (item: Garment) => { const family = garmentFamily(item); return family ? FAMILY_SWATCH[family] : '#cfd8d5' }
const pick = computed(() => ({ top: rows.value.top[current.value.top], bottom: rows.value.bottom[current.value.bottom] }))

/** Every active garment (the list API serves at most 50 per page), split into the two rows; favourites first. */
async function load() {
  loading.value = true; error.value = ''
  try {
    // smart-closet-server#198: the closet the outfit board already loaded; favourites first, otherwise newest-updated
    // first (the same stable order as the list API's sort=favorite).
    const all: Garment[] = (await activeCloset()).sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)))
    const tops = all.filter(item => ['TOP', 'OUTER'].includes(roleFromGarment(item)))
    const bottoms = all.filter(item => roleFromGarment(item) === 'BOTTOM')
    rows.value = { top: tops, bottom: bottoms }
    // From a garment's 用它搭一套 (?mix=id): start on that garment and lock its row.
    const anchor = typeof route.query.mix === 'string' ? route.query.mix : ''
    for (const row of ROWS) {
      const index = rows.value[row.key].findIndex(item => item.id === anchor)
      if (index >= 0) { current.value[row.key] = index; locked.value[row.key] = true }
    }
    await nextTick()
    for (const row of ROWS) scrollTo(row.key, current.value[row.key], false)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '衣柜暂时无法加载。' }
  finally { loading.value = false }
}

// Each row is a horizontal scroll-snap track; the card nearest the centre is the current one.
function cardStep(track: HTMLElement) { const card = track.querySelector<HTMLElement>('.mix-card'); return card ? card.offsetWidth + 14 : 1 }
function scrollTo(row: RowKey, index: number, smooth = true) {
  const track = tracks.value[row]
  if (!track) return
  track.scrollTo({ left: index * cardStep(track), behavior: smooth && !calm() ? 'smooth' : 'instant' })
}
const frames: Record<RowKey, number> = { top: 0, bottom: 0 }
function scrolled(row: RowKey) {
  cancelAnimationFrame(frames[row])
  frames[row] = requestAnimationFrame(() => {
    const track = tracks.value[row]
    if (!track) return
    const index = Math.max(0, Math.min(rows.value[row].length - 1, Math.round(track.scrollLeft / cardStep(track))))
    if (index !== current.value[row]) { current.value[row] = index; playSound('tick') }
  })
}
function step(row: RowKey, delta: number) { if (locked.value[row]) return; scrollTo(row, Math.max(0, Math.min(rows.value[row].length - 1, current.value[row] + delta))) }
function choose(row: RowKey, index: number) { if (!locked.value[row] && index !== current.value[row]) scrollTo(row, index) }
function toggleLock(row: RowKey) { locked.value[row] = !locked.value[row]; playSound(locked.value[row] ? 'tap' : 'tick') }
function shuffle() {
  const free = ROWS.filter(row => !locked.value[row.key] && rows.value[row.key].length > 1)
  if (!free.length) { message.info('两排都锁住了，先解锁一排再随机。'); return }
  playSound('pop')
  for (const row of free) {
    const count = rows.value[row.key].length
    let next = Math.floor(Math.random() * count)
    if (next === current.value[row.key]) next = (next + 1 + Math.floor(Math.random() * (count - 1))) % count
    scrollTo(row.key, next)
  }
}

// 评一评：点了才算一次（本地推荐引擎，零模型调用）；组合一变，分数就收起。
const scoring = ref(false)
const score = ref<{ key: string; outfit: RecommendedOutfit | null; problem: string } | null>(null)
const comboKey = computed(() => [pick.value.top?.id, pick.value.bottom?.id].join('+'))
watch(comboKey, () => { score.value = null })
let runId: string | null = null
async function rate() {
  if (!pick.value.top || !pick.value.bottom || scoring.value) return
  scoring.value = true
  const key = comboKey.value
  try {
    runId ??= (await recommendApi.recommend({ occasion: 'DAILY', count: 3 })).runId
    const outfit = await recommendApi.adopt(runId, [pick.value.top.id, pick.value.bottom.id])
    if (key === comboKey.value) score.value = { key, outfit, problem: '' }
  } catch (cause) {
    if (key === comboKey.value) score.value = { key, outfit: null, problem: cause instanceof Error ? cause.message : '暂时评不了这一套。' }
  } finally { scoring.value = false }
}
const scoreLine = computed(() => score.value?.outfit ? [...score.value.outfit.highlights.slice(0, 2), ...score.value.outfit.warnings.slice(0, 1)].join('；') : score.value?.problem || '')

async function openBoard() {
  const top = pick.value.top, bottom = pick.value.bottom
  if (!top || !bottom || !closet.user) return
  const name = `${title(top)} + ${title(bottom)}`
  const scene = await candidateScene({ name, reason: '', garmentIds: [top.id, bottom.id] })
  const id = createUuid()
  try { localStorage.setItem(`yixu.outfit-draft.v1:${closet.user.username}:new:${id}`, JSON.stringify({ name, revision: null, scene, savedAt: Date.now() })) } catch { message.error('浏览器存储不可用，无法带到组合台。'); return }
  playSound('tap')
  await router.push({ path: '/outfits/new', query: { draft: id, from: 'mix' } })
}

function keys(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"], .ant-select') || document.querySelector('.ant-modal-wrap, .garment-quick')) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); step(event.shiftKey ? 'bottom' : 'top', event.key === 'ArrowLeft' ? -1 : 1) }
}
onMounted(() => { void load(); window.addEventListener('keydown', keys) })
onUnmounted(() => window.removeEventListener('keydown', keys))
</script>

<template>
  <section class="quick-mix" aria-label="快速搭">
    <div v-if="loading" class="mix-loading"><a-skeleton active :paragraph="{ rows: 6 }" /></div>
    <a-alert v-else-if="error" type="error" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <div v-else-if="!rows.top.length || !rows.bottom.length" class="mix-empty">
      <p>快速搭需要至少一件上衣和一件下装。</p>
      <a-button type="primary" @click="router.push('/add')"><PlusOutlined /> 添加衣物</a-button>
    </div>
    <template v-else>
      <div v-for="row in ROWS" :key="row.key" class="mix-row" :class="{ locked: locked[row.key] }">
        <div class="mix-stage">
          <a-button type="text" shape="circle" class="mix-arrow left" :aria-label="`上一件${row.label}`" :disabled="locked[row.key] || current[row.key] === 0" @click="step(row.key, -1)"><LeftOutlined /></a-button>
          <div :ref="el => { tracks[row.key] = el as HTMLElement | null }" class="mix-track" :class="{ frozen: locked[row.key] }" @scroll.passive="scrolled(row.key)">
            <article v-for="(item, index) in rows[row.key]" :key="item.id" class="mix-card" :class="{ current: index === current[row.key] }" :style="{ '--tint': tint(item) }" @click="choose(row.key, index)">
              <img :src="thumbUrl(item.displayUrl, 480)" :alt="title(item)" loading="lazy" decoding="async" draggable="false" />
            </article>
          </div>
          <a-button type="text" shape="circle" class="mix-arrow right" :aria-label="`下一件${row.label}`" :disabled="locked[row.key] || current[row.key] === rows[row.key].length - 1" @click="step(row.key, 1)"><RightOutlined /></a-button>
        </div>
      </div>
      <!-- 两排的名称、序号和锁统一放在卡片下面，卡片之间不夹文字。 -->
      <div class="mix-info">
        <div v-for="row in ROWS" :key="row.key" class="mix-info-item" :class="{ locked: locked[row.key] }">
          <a-tooltip :title="locked[row.key] ? '解锁这一排' : '锁住这一排，只换另一排'"><a-button type="text" shape="circle" class="mix-lock" :class="{ on: locked[row.key] }" :aria-pressed="locked[row.key]" :aria-label="locked[row.key] ? `解锁${row.label}` : `锁住${row.label}`" @click="toggleLock(row.key)"><LockOutlined v-if="locked[row.key]" /><UnlockOutlined v-else /></a-button></a-tooltip>
          <span><b>{{ row.label }}</b><small>{{ current[row.key] + 1 }}/{{ rows[row.key].length }}</small><em>{{ pick[row.key] ? title(pick[row.key]!) : '' }}</em></span>
        </div>
      </div>
      <p v-if="score" class="mix-verdict" :class="{ problem: !score.outfit }" aria-live="polite">
        <template v-if="score.outfit"><b>{{ score.outfit.score }}</b><span>分</span></template>
        {{ scoreLine }}
      </p>
      <footer class="mix-bar">
        <a-button type="text" size="small" :loading="scoring" :disabled="Boolean(score)" class="mix-rate" @click="rate"><StarOutlined /> {{ score ? '已评' : '评一评' }}</a-button>
        <a-button type="text" size="small" class="mix-shuffle" @click="shuffle"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 3.8C14.3 15 15.5 16 17.5 16H21M17 13l3 3-3 3M3 16h3.5c1.2 0 2-.3 2.7-1M21 7h-3.5c-1.2 0-2 .4-2.7 1M17 4l3 3-3 3" /></svg> 随机一套</a-button>
        <a-button type="primary" size="small" class="mix-open" @click="openBoard">在搭台打开</a-button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
/* 卡片高度按一屏剩余空间算：顶栏、标签行、两排标题、操作行、底部导航都扣掉，手机上两排能一屏看完。 */
.quick-mix { --card-w: min(260px, 42vw); --card-h: clamp(150px, calc((100dvh - 400px) / 2), 270px); max-width: 980px; margin: 0 auto; }
.mix-loading, .mix-empty { padding: 28px; border-radius: 28px; background: var(--surface-alt); }
.mix-empty { display: grid; justify-items: center; gap: 14px; text-align: center; color: var(--muted); }
.mix-lock.ant-btn { width: 30px; min-width: 30px; height: 30px; color: var(--muted); }
.mix-lock.ant-btn.on { color: var(--accent-strong); background: var(--accent-soft); }
.mix-stage { position: relative; }
/* 横向滑动切换；在卡片上竖着滑交给页面滚动（touch-action），不再卡住。 */
.mix-track { display: flex; gap: 12px; padding: 4px calc(50% - var(--card-w) / 2) 6px; overflow-x: auto; overflow-y: hidden; touch-action: pan-x pan-y; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
.mix-track::-webkit-scrollbar { display: none; }
.mix-track.frozen { overflow-x: hidden; }
.mix-card { display: grid; flex: none; place-items: center; width: var(--card-w); height: var(--card-h); border-radius: 24px; background: color-mix(in srgb, var(--tint) 16%, var(--surface-alt)); scroll-snap-align: center; cursor: pointer; opacity: .45; transform: scale(.88); transition: transform .45s var(--spring), opacity .3s ease, box-shadow .3s ease; }
.mix-card.current { opacity: 1; transform: none; box-shadow: 0 16px 30px -22px #00000066; }
.mix-row.locked .mix-card.current { box-shadow: 0 0 0 2px var(--brand), 0 16px 30px -22px #00000066; }
.mix-card img { max-width: 80%; max-height: 84%; object-fit: contain; filter: drop-shadow(0 10px 12px #00000022); user-select: none; pointer-events: none; }
.mix-arrow.ant-btn { position: absolute; top: calc(50% - 20px); z-index: 2; width: 40px; height: 40px; color: var(--muted-strong); background: var(--glass); backdrop-filter: blur(10px); box-shadow: 0 0 0 1px var(--line); }
.mix-arrow.left { left: calc(50% - var(--card-w) / 2 - 58px); }
.mix-arrow.right { right: calc(50% - var(--card-w) / 2 - 58px); }
/* 操作行：安静的一行小按钮，不吸底、不加底色。 */
.mix-info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; padding: 0 4px; }
.mix-info-item { display: flex; align-items: center; gap: 6px; min-width: 0; }
.mix-info-item > span { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.mix-info-item b { flex: none; font-size: 13px; font-weight: 600; }
.mix-info-item small { flex: none; font-size: 11px; color: var(--muted-subtle); font-variant-numeric: tabular-nums; }
.mix-info-item em { min-width: 0; overflow: hidden; font-style: normal; font-size: 12px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.mix-verdict { margin: 10px 4px 0; padding: 10px 14px; border-radius: 16px; font-size: 13px; line-height: 1.7; color: var(--muted-strong); background: var(--accent-soft); }
.mix-verdict b { margin-right: 2px; font-size: 18px; font-weight: 600; color: var(--accent-strong); font-variant-numeric: tabular-nums; }
.mix-verdict > span { margin-right: 8px; font-size: 12px; color: var(--muted); }
.mix-verdict.problem { color: var(--warning); background: var(--warning-bg); }
.mix-bar { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 8px; }
.mix-rate.ant-btn { margin-right: auto; }
.mix-rate.ant-btn, .mix-shuffle.ant-btn { display: inline-flex; align-items: center; gap: 5px; color: var(--muted-strong); }
.mix-rate.ant-btn:hover, .mix-shuffle.ant-btn:hover { color: var(--accent-strong); }
.mix-shuffle svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
@media (hover: none) { .mix-arrow { display: none; } }
@media (max-width: 767px) {
  .quick-mix { --card-w: 58vw; --card-h: clamp(140px, calc((100dvh - 380px) / 2), 240px); }
  .mix-bar { padding: 0 4px; }
}
@media (prefers-reduced-motion: reduce) { .mix-card { transition: none; } }
</style>
