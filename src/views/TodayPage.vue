<script setup lang="ts">
// “今天”页（ToC 改版（二）第四节，方向 B · 今日封面）：一叠可以左右滑的搭配卡。
// 左滑换一套：不发任何推荐反馈（T2）。右滑就穿它：等同“今天穿了这套”，写穿着记录（T3）。全程零模型调用（T4）。
import { computed, onMounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { AppstoreAddOutlined, CameraOutlined, CheckCircleFilled, RightOutlined, SkinOutlined, UndoOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import CoverDeck from '../today/CoverDeck.vue'
import RecommendationDetailModal from '../recommend/RecommendationDetailModal.vue'
import OutfitCollage from '../today/OutfitCollage.vue'
import { recommendApi } from '../recommend/api'
import { outfitScene } from '../recommend/sceneCache'
import type { RecommendedOutfit, RecommendationView } from '../recommend/types'
import { closetApi } from '../services/api'
import type { Outfit } from '../domain/outfit'
import { useClosetStore } from '../stores/closet'
import { playSound } from '../services/sound'
import { celebrate, originOf } from '../services/celebrate'
import { thumbUrl } from '../services/urls'
import { appendUnique, collageSlots, coverTint, FIRST_BATCH, MORE_BATCH, REFILL_AT, scenePieces, TODAY_OCCASIONS, type TodayOccasion } from '../today/deck'
import { readWorn, saveWorn, type WornToday } from '../today/worn'

const router = useRouter(); const closet = useClosetStore(); const { message } = App.useApp()
const occasion = ref<TodayOccasion>('DAILY')
const view = ref<RecommendationView | null>(null)
const queue = ref<RecommendedOutfit[]>([]); const index = ref(0); let seen = new Set<string>()
const loading = ref(true); const error = ref(''); const refilling = ref(false); const busy = ref(false)
const worn = ref<WornToday | null>(null); const showDeck = ref(true)
const undo = ref<{ index: number } | null>(null); let undoTimer = 0
const detailOpen = ref(false); const detailIndex = ref(0)
const saved = ref<Outfit[]>([])
const savedIds = new Map<string, string>()
const deck = ref<InstanceType<typeof CoverDeck> | null>(null)
const user = computed(() => closet.user?.username || 'local')
const weather = computed(() => view.value?.intent.description || '')
const dateLine = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())
const greeting = computed(() => { const h = new Date().getHours(); return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好' })
const name = computed(() => closet.user?.displayName || closet.user?.username || '')
const remaining = computed(() => queue.value.length - index.value)
const finished = computed(() => !loading.value && !error.value && queue.value.length > 0 && remaining.value <= 0 && !view.value?.hasMore)
const empty = computed(() => !loading.value && !error.value && queue.value.length === 0)

async function load() {
  loading.value = true; error.value = ''; index.value = 0; queue.value = []; seen = new Set(); undo.value = null
  try {
    const result = await recommendApi.recommend({ occasion: occasion.value, requiredGarmentIds: [], count: FIRST_BATCH })
    view.value = result; queue.value = appendUnique([], seen, result.outfits)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '暂时没拿到今天的搭配。' }
  finally { loading.value = false }
}
async function refill() {
  if (refilling.value || !view.value?.hasMore || remaining.value > REFILL_AT) return
  refilling.value = true
  try { const more = await recommendApi.more(view.value.runId, MORE_BATCH); view.value = { ...view.value, hasMore: more.hasMore }; queue.value = appendUnique(queue.value, seen, more.outfits) }
  catch { /* 续卡失败不打断：用户划完会看到“再来一批”。 */ }
  finally { refilling.value = false }
}
watch(index, () => { void refill() })
watch(occasion, () => { playSound('tick'); void load() })

function skip() {
  playSound('tick')
  clearTimeout(undoTimer); undo.value = { index: index.value }
  undoTimer = window.setTimeout(() => { undo.value = null }, 4000)
  index.value++
}
function takeBack() {
  if (!undo.value) return
  index.value = undo.value.index; undo.value = null; clearTimeout(undoTimer)
  void deck.value?.returnFromLeft()
}
async function wear(outfit: RecommendedOutfit, el: HTMLElement | null) {
  busy.value = true
  try {
    await recommendApi.wear({ garmentIds: outfit.garments.map(g => g.id) })
    worn.value = { date: new Date().toDateString(), name: outfit.name, garments: outfit.garments }
    saveWorn(user.value, worn.value); showDeck.value = false; undo.value = null
    void celebrate('wear', originOf(el))
  } catch (cause) {
    playSound('error'); message.error(cause instanceof Error ? cause.message : '没有记下来，请再试一次。')
    void deck.value?.returnFromLeft()
  } finally { busy.value = false }
}
/** 保存为“我的搭配”；已经存过的同一套直接复用，返回搭配 id。 */
/** outfitScene 只用到名称和衣物 id，所以“今天穿了”的本机记录也能直接保存。 */
type Savable = { name: string; garments: { id: string }[] }
async function save(outfit: Savable, quiet = false): Promise<string | null> {
  const key = outfit.garments.map(g => g.id).sort().join(',')
  const existing = savedIds.get(key); if (existing) { if (!quiet) message.info('这套已经在我的搭配里了。'); return existing }
  try {
    const scene = await outfitScene(outfit as unknown as RecommendedOutfit)
    const created = await closetApi.saveOutfit(null, null, outfit.name, scene)
    savedIds.set(key, created.id); saved.value = [created, ...saved.value]
    window.dispatchEvent(new CustomEvent('closet-outfit-saved'))
    if (!quiet) { playSound('pop'); message.success('已收进我的搭配') }
    return created.id
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没能保存这套搭配。'); return null }
}
async function tryOn(outfit: Savable) {
  const id = await save(outfit, true)
  if (id) void router.push({ path: '/try', query: { outfit: id } })
}
function open(outfit: RecommendedOutfit) { detailIndex.value = Math.max(0, queue.value.indexOf(outfit)); detailOpen.value = true }
function replace(i: number, next: RecommendedOutfit) { queue.value = queue.value.map((o, k) => k === i ? next : o) }
function again() { showDeck.value = true; if (remaining.value <= 0) void load() }

async function loadSaved() {
  try { saved.value = (await closetApi.outfits()).slice(0, 8) } catch { saved.value = [] }
}
const wornSlots = computed(() => worn.value ? collageSlots(worn.value.garments, path => thumbUrl(path, 480)) : [])
const wornTint = computed(() => worn.value ? coverTint(worn.value.garments) : '')

onMounted(() => {
  worn.value = readWorn(user.value); showDeck.value = !worn.value
  void load(); void loadSaved()
})
</script>

<template>
  <div class="today-page">
    <h1 class="page-title-sr">今天</h1>
    <section class="today-main">
      <header class="today-hello"><h2>{{ greeting }}<template v-if="name">，{{ name }}</template></h2><p>{{ dateLine }}<template v-if="weather"> · {{ weather }}</template></p></header>
      <div class="today-occasions" role="radiogroup" aria-label="今天的场合">
        <a-button v-for="o in TODAY_OCCASIONS" :key="o.value" shape="round" class="today-chip" :class="{ on: occasion === o.value }" role="radio" :aria-checked="occasion === o.value" @click="occasion = o.value">{{ o.label }}</a-button>
      </div>

      <div v-if="worn && !showDeck" class="today-done" :style="{ '--tint': wornTint }">
        <span class="today-done-tag"><CheckCircleFilled /> 已记下今天穿这套</span>
        <div class="today-done-collage"><img v-for="(slot, i) in wornSlots" :key="slot.id" :src="slot.url" alt="" :style="{ left: `${slot.left}%`, top: `${slot.top}%`, width: `${slot.width}%`, height: `${slot.height}%`, '--i': i }" /></div>
        <h3>今天就穿「{{ worn.name }}」</h3>
        <p>之后的推荐会参考你今天穿了什么。</p>
        <div class="today-done-actions"><a-button size="large" @click="again">再看看别的</a-button><a-button type="primary" size="large" @click="tryOn(worn)"><SkinOutlined /> 穿上看看</a-button></div>
      </div>
      <template v-else>
        <div v-if="loading" class="today-skeleton" aria-busy="true"><a-skeleton active :paragraph="{ rows: 6 }" /></div>
        <div v-else-if="error" class="today-state">
          <h3>今天的搭配暂时没拿到</h3><p>{{ error }}</p><a-button type="primary" size="large" @click="load"><ReloadOutlined /> 再试一次</a-button>
        </div>
        <div v-else-if="empty" class="today-state">
          <h3>{{ view?.emptyReason || '衣柜里的衣服还不够搭一套' }}</h3>
          <p>放几件衣服进来，鱼搭就能每天给你搭一套。</p>
          <div class="today-state-actions"><a-button type="primary" size="large" @click="router.push('/wardrobe?presets=1')"><AppstoreAddOutlined /> 从常见单品挑</a-button><a-button size="large" @click="router.push('/add')"><CameraOutlined /> 拍一件</a-button></div>
        </div>
        <div v-else-if="finished" class="today-state">
          <h3>这一批看完啦</h3><p>换个场合，或者再来一批。</p><a-button type="primary" size="large" @click="load"><ReloadOutlined /> 再来一批</a-button>
        </div>
        <CoverDeck v-else ref="deck" :outfits="queue" :index="index" :busy="busy" @skip="skip" @wear="wear" @save="o => save(o)" @open="open" />
      </template>
      <Transition name="today-undo"><a-button v-if="undo" shape="round" class="today-undo" @click="takeBack"><UndoOutlined /> 撤回</a-button></Transition>
    </section>

    <aside class="today-side">
      <button v-if="showDeck && queue[index]" type="button" class="today-strip" @click="tryOn(queue[index]!)">
        <span class="today-strip-icon"><SkinOutlined /></span><span><b>穿上看看</b><small>生成这套的上身效果图</small></span><RightOutlined />
      </button>
      <div class="today-sec"><h2>我的搭配</h2><RouterLink to="/outfits">全部 <RightOutlined /></RouterLink></div>
      <div v-if="saved.length" class="today-saved">
        <RouterLink v-for="o in saved" :key="o.id" :to="`/outfits/${o.id}`" class="today-saved-item"><span class="today-saved-media"><OutfitCollage :pieces="scenePieces(o.scene)" :title="o.name" :size="320" /></span><b>{{ o.name }}</b></RouterLink>
      </div>
      <p v-else class="today-quiet">遇到喜欢的，点 ☆ 收进来。</p>
      <template v-if="closet.pendingCount">
        <div class="today-sec"><h2>衣柜动态</h2></div>
        <RouterLink to="/pending" class="today-strip"><span class="today-strip-icon mint">{{ closet.pendingCount > 99 ? '99+' : closet.pendingCount }}</span><span><b>{{ closet.pendingCount }} 件新衣服在整理</b><small>做好会自动收进衣柜，个别需要你确认一下</small></span><RightOutlined /></RouterLink>
      </template>
    </aside>

    <RecommendationDetailModal v-if="view" v-model:open="detailOpen" v-model:index="detailIndex" :run-id="view.runId" :outfits="queue" @replace="replace" />
  </div>
</template>

<style scoped>
.today-page { display: grid; gap: 8px; max-width: 1180px; margin: 0 auto; padding: 4px 16px 0; }
.page-title-sr { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.today-main { position: relative; min-width: 0; }
.today-hello { margin: 4px 0 14px; }
.today-hello h2 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -.01em; }
.today-hello p { margin: 2px 0 0; overflow: hidden; font-size: 13px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.today-occasions { display: flex; gap: 8px; margin: 0 -16px 14px; padding: 2px 16px; overflow-x: auto; scrollbar-width: none; }
.today-occasions::-webkit-scrollbar { display: none; }
.today-chip.ant-btn { flex: none; height: 34px; padding: 0 16px; border: 0; border-radius: 999px; color: var(--muted-strong); background: var(--surface-alt); box-shadow: none; }
html .today-chip.ant-btn:not(.on):hover { color: var(--ink); background: var(--selection-bg); }
.today-chip.on.ant-btn, html .today-chip.on.ant-btn:hover { color: var(--action-fg); background: var(--action-bg); font-weight: 600; }
.today-skeleton, .today-state { min-height: 420px; padding: 28px 24px; border-radius: 20px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.today-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; }
.today-state h3 { margin: 0; font-size: 18px; font-weight: 600; }
.today-state p { margin: 0 0 12px; color: var(--muted); }
.today-state-actions, .today-done-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.today-done { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; min-height: 420px; padding: 22px; border-radius: 20px; text-align: center; background: var(--surface); box-shadow: 0 0 0 1px var(--line); animation: today-rise .5s var(--ease-out); }
@keyframes today-rise { from { opacity: 0; transform: translateY(14px) scale(.98); } }
.today-done-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--success); }
.today-done-collage { position: relative; width: min(72%, 320px); aspect-ratio: 1; border-radius: 14px; background: color-mix(in srgb, var(--tint) 12%, var(--surface-alt)); }
.today-done-collage img { position: absolute; object-fit: contain; filter: drop-shadow(0 10px 14px #0000001f); }
.today-done h3 { margin: 8px 0 0; font-size: 20px; font-weight: 600; }
.today-done p { margin: 0 0 12px; color: var(--muted); font-size: 14px; }
.today-undo.ant-btn { position: fixed; left: 50%; bottom: calc(var(--dock-space) + 12px); z-index: 40; height: 40px; padding: 0 18px; border: 0; border-radius: 999px; color: var(--action-fg); background: var(--action-bg); box-shadow: 0 10px 24px -8px #0000004d; transform: translateX(-50%); }
.today-undo-enter-active, .today-undo-leave-active { transition: opacity .2s ease, transform .3s var(--spring); }
.today-undo-enter-from, .today-undo-leave-to { opacity: 0; transform: translate(-50%, 12px); }
.today-side { min-width: 0; padding-top: 18px; }
.today-sec { display: flex; align-items: baseline; margin: 24px 0 10px; }
.today-sec h2 { margin: 0; font-size: 17px; font-weight: 650; }
.today-sec a { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; font-size: 13px; color: var(--muted); }
.today-strip { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 0; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
.today-strip > span:nth-child(2) { flex: 1; min-width: 0; }
.today-strip b { display: block; font-size: 15px; font-weight: 600; }
.today-strip small { display: block; color: var(--muted); font-size: 12px; }
.today-strip > .anticon { color: var(--muted-subtle); font-size: 12px; }
.today-strip-icon { display: grid; flex: none; place-items: center; width: 40px; height: 40px; border-radius: 12px; color: var(--ink); background: var(--surface-alt); font-size: 18px; font-weight: 600; }
.today-strip-icon.mint { color: var(--accent-strong); background: var(--accent-soft); font-size: 13px; }
.today-saved { display: flex; gap: 12px; margin: 0 -16px; padding: 0 16px 4px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.today-saved::-webkit-scrollbar { display: none; }
.today-saved-item { flex: none; width: 132px; scroll-snap-align: start; }
.today-saved-media { display: block; aspect-ratio: 1; overflow: hidden; border-radius: 14px; background: var(--surface-alt); }
.today-saved-item b { display: block; margin: 6px 4px 0; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.today-quiet { margin: 0; color: var(--muted); font-size: 13px; }
@media (min-width: 1024px) {
  .today-page { grid-template-columns: minmax(0, 560px) minmax(0, 1fr); gap: 48px; align-items: start; padding-top: 12px; }
  .today-hello h2 { font-size: 30px; }
  .today-side { padding-top: 112px; }
  .today-saved { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); margin: 0; padding: 0; overflow: visible; }
  .today-saved-item { width: auto; }
}
@media (prefers-reduced-motion: reduce) { .today-done { animation: none; } .today-undo-enter-active, .today-undo-leave-active { transition: none; } }
</style>
