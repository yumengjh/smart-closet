<script setup lang="ts">
// 试穿入口（ToC 改版（二）3.1；试穿与创作合并 server#271）：“做张图”（上身图与创作效果共用一个分步流程，见 TryMaker）
// 与“镜头试穿”（实时试穿的启动页：看今日剩余时长、挑从哪件或哪套开始、看拍摄小贴士，点“打开镜头”才进全屏的 /try-on）。
// 没有实时试穿权限时不显示切换，直接是“做张图”。右上“我的图”（/try/album）收着上身图与作品，有进行中的任务时带小红点。
// 启动动效与取景引导（server#277）：舞台上是呼吸的人形轮廓，选的衣服落到对应部位；“打开镜头”从按钮圆形展开进 /try-on 并直接开预览。
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BulbOutlined, CameraOutlined, HistoryOutlined, LockOutlined, PictureOutlined, SoundOutlined, VideoCameraOutlined } from '@ant-design/icons-vue'
import { useBillingStore } from '../billing/store'
import { realtimePrice } from '../billing/model'
import TryMaker from '../components/try/TryMaker.vue'
import PageTitle from '../shell/PageTitle.vue'
import OutfitCollage from '../today/OutfitCollage.vue'
import { scenePieces } from '../today/deck'
import TryOnQuota from '../tryon/TryOnQuota.vue'
import { tryOnAccess } from '../tryon/access'
import { tryOnApi, type Candidate } from '../tryon/api'
import type { Outfit } from '../domain/outfit'
import { mediaUrl } from '../services/urls'
import { liveWorks, refreshWorks } from '../creation/works'
import { useProcessingStore } from '../stores/processing'
import { ALBUM_PATH } from '../try/routes'
import { isPictureEntry } from '../domain/waiting'
import { revealNavigate } from '../shell/revealNavigate'
import { partsFor, scopeOf, setupTip, type Device, type Scope } from '../tryon/guide'
import { CAMERA_LAYOUT_QUERY } from '../tryon/stage'
import { voiceSupported } from '../tryon/voice'

const billing = useBillingStore(), processing = useProcessingStore()
onMounted(() => { void refreshWorks(1) })
// 上身图的进度在整理中心（processing store）里，作品的进度在 works；任一有进行中的就点亮。
const albumBusy = computed(() => liveWorks.value > 0 || processing.entries.some(entry => isPictureEntry(entry) && entry.state === 'processing' && entry.href.startsWith(ALBUM_PATH)))
const route = useRoute(), router = useRouter()
const liveAvailable = computed(() => Boolean(tryOnAccess.value?.enabled))
const mode = computed<'image' | 'live'>({
  get: () => liveAvailable.value && route.query.mode === 'live' ? 'live' : 'image',
  set: value => { void router.replace({ query: { ...route.query, mode: value === 'live' ? 'live' : undefined } }) },
})
const cap = computed(() => tryOnAccess.value)
const garments = ref<Candidate[]>([]); const outfits = ref<Outfit[]>([]); const loaded = ref(false)
const pick = ref<{ kind: 'garment' | 'outfit'; id: string } | null>(null)
async function loadChoices() {
  if (loaded.value) return
  loaded.value = true
  const [g, o] = await Promise.allSettled([tryOnApi.garments(1), tryOnApi.outfits()])
  garments.value = g.status === 'fulfilled' ? g.value.filter(c => c.ready).slice(0, 24) : []
  outfits.value = o.status === 'fulfilled' ? o.value.slice(0, 12) : []
}
watch(mode, value => { if (value === 'live') void loadChoices() }, { immediate: true })
function choose(kind: 'garment' | 'outfit', id: string) { pick.value = pick.value?.kind === kind && pick.value.id === id ? null : { kind, id } }
const isPicked = (kind: 'garment' | 'outfit', id: string) => pick.value?.kind === kind && pick.value.id === id
const needsPoints = computed(() => billing.realtime?.enabled && cap.value?.enabled && cap.value.quota.remaining <= 0 && (cap.value.points?.milliPointsPerSecond || 0) > 0 && (cap.value.points?.paidSeconds || 0) <= 0)
/** 从按钮圆形展开进试穿页，并带上 open=1：试穿页直接打开本地预览（免费、不计时）。 */
function start(event: MouseEvent) {
  if (needsPoints.value) { billing.purchase = 'tryon'; return }
  const query = new URLSearchParams({ open: '1', ...(pick.value ? { [pick.value.kind]: pick.value.id } : {}) })
  const box = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  const origin = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2, from: Math.min(box.width, box.height) / 2 } : { x: innerWidth / 2, y: innerHeight / 2, from: 0 }
  void revealNavigate(router, `/try-on?${query}`, origin)
}
const pickedGarment = computed(() => pick.value?.kind === 'garment' ? garments.value.find(g => g.id === pick.value!.id) : undefined)
const pickedOutfit = computed(() => pick.value?.kind === 'outfit' ? outfits.value.find(o => o.id === pick.value!.id) : undefined)
// 舞台轮廓上的落点（占舞台高度的百分比）：衣服按穿戴位置落到头、颈、上身、手、腰、腿、脚。
const ZONE: Record<string, number> = { HAT: 10, HEADWEAR: 10, GLASSES: 12, EAR: 12, NECK: 22, SCARF: 22, TOP: 36, INNER: 36, OUTER: 36, ONE_PIECE: 44, OVERALL: 44, BAG: 44, WRIST: 50, FINGER: 50, GLOVES: 50, ARM: 46, HANDHELD: 50, BELT: 52, BOTTOM: 68, SOCKS: 88, SHOES: 92 }
const dropAt = computed(() => `${ZONE[pickedGarment.value?.wearingRole || ''] ?? 40}%`)
// 拍摄小贴士按设备和所选衣物生成：手机前摄拍全身要靠墙放稳、后退两三步；电脑离屏幕两米左右。
const coarse = window.matchMedia('(pointer: coarse)').matches, narrowScreen = window.matchMedia(CAMERA_LAYOUT_QUERY).matches
const device: Device = coarse ? (narrowScreen ? 'phone' : 'tablet') : 'desktop'
const scope = computed<Scope>(() => pickedGarment.value ? scopeOf(partsFor([pickedGarment.value.wearingRole])) : 'full')
const tips = computed(() => [
  { icon: CameraOutlined, text: setupTip({ device, front: true, portrait: true }, scope.value) },
  { icon: BulbOutlined, text: '站在光线均匀的地方，背景越简单越好' },
  ...(voiceSupported && device !== 'desktop' ? [{ icon: SoundOutlined, text: '站远了看不清字，可以在镜头里打开语音提示' }] : []),
  { icon: LockOutlined, text: '取景提示只在你的浏览器里识别，结束后参考图会删除' },
])
</script>

<template>
  <div class="try-hub">
    <PageTitle v-if="mode === 'image'" title="试穿" />
    <div class="try-hub-top">
      <a-segmented v-if="liveAvailable" v-model:value="mode" block class="try-hub-switch" :options="[{ value: 'image', label: '做张图' }, { value: 'live', label: '镜头试穿' }]" aria-label="试穿方式" />
      <a-badge :dot="albumBusy" :offset="[-4, 4]" class="try-hub-album"><a-button @click="router.push(ALBUM_PATH)"><PictureOutlined /> 我的图</a-button></a-badge>
    </div>
    <div v-if="mode === 'live'" class="try-live">
      <PageTitle title="实时试穿" />
      <section class="try-live-stage">
        <div class="try-live-frame" aria-hidden="true">
          <span class="try-live-corner tl" /><span class="try-live-corner tr" /><span class="try-live-corner bl" /><span class="try-live-corner br" />
          <svg class="try-live-figure" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">
            <circle cx="50" cy="20" r="12" />
            <path d="M42 36 Q50 40 58 36 L72 43 Q78 45 79 53 L84 97 Q84 102 80 102 L76 102 L71 62 L68 104 L70 189 Q70 194 66 194 L56 194 L51 118 L49 118 L44 194 L34 194 Q30 194 30 189 L32 104 L29 62 L24 102 L20 102 Q16 102 16 97 L21 53 Q22 45 28 43 Z" />
          </svg>
          <span class="try-live-scan" />
          <Transition name="try-live-drop" mode="out-in">
            <span v-if="pickedGarment" :key="pickedGarment.id" class="try-live-worn" :style="{ top: dropAt }"><img :src="mediaUrl(pickedGarment.imageUrl)" alt="" /></span>
            <span v-else-if="pickedOutfit" :key="pickedOutfit.id" class="try-live-worn outfit"><OutfitCollage :pieces="scenePieces(pickedOutfit.scene)" :title="pickedOutfit.name" :size="240" /></span>
          </Transition>
        </div>
        <div class="try-live-copy">
          <h2>{{ pickedGarment ? `对着镜头，换上${pickedGarment.name}` : pickedOutfit ? `对着镜头，换上「${pickedOutfit.name}」` : '对着镜头，直接换上' }}</h2>
          <p v-if="cap?.ready || needsPoints"><TryOnQuota :remaining="cap?.quota.remaining || 0" :points="cap?.points" /></p>
          <p v-else-if="cap" class="try-live-warn">{{ cap.reason || '实时试穿暂时不可用' }}</p>
        </div>
      </section>

      <section class="try-live-pick">
        <header><h2>从哪件开始</h2><small>不选也行，进去再换</small></header>
        <div v-if="garments.length" class="try-live-row" role="listbox" aria-label="衣服">
          <button v-for="g in garments" :key="g.id" type="button" role="option" class="try-live-item" :class="{ on: isPicked('garment', g.id) }" :aria-selected="isPicked('garment', g.id)" @click="choose('garment', g.id)">
            <span class="try-live-thumb"><img :src="mediaUrl(g.imageUrl)" :alt="g.name" loading="lazy" /></span>
            <b>{{ g.name }}</b><em v-if="g.wanted">种草</em>
          </button>
        </div>
        <p v-else-if="loaded" class="try-live-quiet">衣柜里还没有可以试穿的衣服，先去添加几件。</p>
        <template v-if="outfits.length">
          <header class="try-live-sub"><h3>或者整套试</h3></header>
          <div class="try-live-row" role="listbox" aria-label="搭配">
            <button v-for="o in outfits" :key="o.id" type="button" role="option" class="try-live-item outfit" :class="{ on: isPicked('outfit', o.id) }" :aria-selected="isPicked('outfit', o.id)" @click="choose('outfit', o.id)">
              <span class="try-live-thumb"><OutfitCollage :pieces="scenePieces(o.scene)" :title="o.name" :size="320" /></span>
              <b>{{ o.name }}</b>
            </button>
          </div>
        </template>
      </section>

      <ul class="try-live-tips">
        <li v-for="tip in tips" :key="tip.text"><component :is="tip.icon" />{{ tip.text }}</li>
      </ul>

      <div class="try-live-cta">
        <a-button type="primary" size="large" block :disabled="!cap?.ready && !needsPoints" @click="start"><VideoCameraOutlined /> {{ needsPoints ? '充值点数' : `打开镜头${realtimePrice(billing.realtime) ? ` · ${realtimePrice(billing.realtime)}` : ''}` }}</a-button>
        <a-button v-if="cap?.hasHistory" type="text" @click="router.push('/try-on?history=1')"><HistoryOutlined /> 拍摄记录</a-button>
      </div>
    </div>
    <TryMaker v-else />
  </div>
</template>

<style scoped>
.try-hub-top { display: flex; align-items: center; justify-content: flex-end; gap: 12px; max-width: 1080px; margin: 0 auto 16px; }
.try-hub-switch { flex: 1; max-width: 360px; margin-right: auto; }
.try-hub-album { flex: none; }
.try-live { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; max-width: 640px; margin: 0 auto; }
.try-live > * { min-width: 0; }
/* 舞台卡跟随主题：浅色是白底墨线、深绿扫描线，深色是黑底白线、薄荷绿扫描线。 */
.try-live-stage {
  --stage-bg: radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #eeefec 72%); --stage-ink: var(--ink); --stage-copy: var(--muted-strong); --stage-quiet: var(--muted);
  --stage-line: #1111114d; --stage-line-strong: #11111180; --stage-fill: #1111110a; --stage-fill-strong: #11111112; --stage-corner: #11111166;
  --stage-glow: #2f7d5b; --stage-glow-soft: #2f7d5b33; --stage-worn-shadow: 0 8px 22px #00000024; --stage-warn: var(--warning);
  position: relative; display: flex; flex-direction: column; justify-content: flex-end; min-height: 300px; padding: 20px; overflow: hidden; border-radius: 20px;
  color: var(--stage-ink); background: var(--stage-bg); box-shadow: 0 0 0 1px var(--line);
}
:root[data-theme='dark'] .try-live-stage {
  --stage-bg: radial-gradient(120% 90% at 50% 0%, #3a3a3a 0%, #111 70%); --stage-ink: #fff; --stage-copy: #ffffffb3; --stage-quiet: #ffffff99;
  --stage-line: #ffffff59; --stage-line-strong: #ffffff8c; --stage-fill: #ffffff0a; --stage-fill-strong: #ffffff14; --stage-corner: #ffffffb3;
  --stage-glow: #9fe8c3; --stage-glow-soft: #9fe8c355; --stage-worn-shadow: 0 8px 22px #0008; --stage-warn: #ffd59a;
  box-shadow: none;
}
.try-live-frame { position: absolute; inset: 22px 22px 110px; display: grid; place-items: center; }
/* 人形轮廓慢慢呼吸，扫描线上下走：还没开镜头，先让人知道“站进这里”。 */
/* 人形整体放进取景框：铺满框内并按比例缩放，头和脚都不会被裁掉或被文字挡住。 */
.try-live-figure { position: absolute; inset: 6px; width: calc(100% - 12px); height: calc(100% - 12px); fill: var(--stage-fill); stroke: var(--stage-line); stroke-width: 1.2; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; animation: try-live-breathe 3.2s ease-in-out infinite; }
.try-live-figure * { vector-effect: non-scaling-stroke; }
.try-live-scan { position: absolute; left: 12%; right: 12%; top: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--stage-glow), transparent); box-shadow: 0 0 16px 3px var(--stage-glow-soft); opacity: .75; animation: try-live-scan 3.6s ease-in-out infinite alternate; }
/* 选的衣服落到轮廓对应部位。 */
.try-live-worn { position: absolute; left: 50%; display: grid; place-items: center; width: 56px; height: 56px; overflow: hidden; border-radius: 14px; background: #ffffffeb; box-shadow: 0 0 0 2px var(--stage-glow), var(--stage-worn-shadow); transform: translate(-50%, -50%); }
.try-live-worn img { width: 86%; height: 86%; object-fit: contain; }
.try-live-worn.outfit { top: 46%; width: 92px; height: 116px; }
.try-live-worn.outfit :deep(canvas), .try-live-worn.outfit :deep(img) { width: 100%; height: 100%; object-fit: contain; }
.try-live-drop-enter-active { transition: opacity .3s ease, transform .5s cubic-bezier(.34, 1.4, .64, 1); }
.try-live-drop-leave-active { transition: opacity .15s ease, transform .15s ease; }
.try-live-drop-enter-from { opacity: 0; transform: translate(-50%, -140%) scale(1.25); }
.try-live-drop-leave-to { opacity: 0; transform: translate(-50%, -50%) scale(.8); }
@keyframes try-live-breathe { 50% { stroke: var(--stage-line-strong); fill: var(--stage-fill-strong); } }
@keyframes try-live-scan { to { top: calc(100% - 2px); } }
.try-live-corner { position: absolute; width: 22px; height: 22px; border-color: var(--stage-corner); border-style: solid; border-width: 0; }
.try-live-corner.tl { top: 0; left: 0; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 8px; }
.try-live-corner.tr { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 8px; }
.try-live-corner.bl { bottom: 0; left: 0; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 8px; }
.try-live-corner.br { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 8px; }
.try-live-copy { position: relative; }
.try-live-copy h2 { margin: 0; font-size: 20px; font-weight: 650; }
.try-live-copy p { margin: 4px 0 0; font-size: 13px; color: var(--stage-copy); }
.try-live-copy :deep(.ant-typography) { color: var(--stage-quiet); }
.try-live-warn { color: var(--stage-warn) !important; }
.try-live-pick { padding: 16px; border-radius: 20px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.try-live-pick header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.try-live-pick h2 { margin: 0; font-size: 16px; font-weight: 650; }
.try-live-pick header small { color: var(--muted); font-size: 12px; }
.try-live-sub { margin: 16px 0 10px !important; }
.try-live-sub h3 { margin: 0; font-size: 14px; font-weight: 600; }
.try-live-row { display: flex; gap: 10px; margin: 0 -16px; padding: 2px 16px 4px; overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-inline: 16px; scrollbar-width: none; }
.try-live-row::-webkit-scrollbar { display: none; }
.try-live-item { position: relative; display: flex; flex: 0 0 92px; flex-direction: column; gap: 6px; padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; scroll-snap-align: start; }
.try-live-item.outfit { flex-basis: 108px; }
.try-live-thumb { display: grid; place-items: center; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 12px; background: var(--surface-alt); transition: box-shadow .15s ease; }
.try-live-thumb img { width: 86%; height: 86%; object-fit: contain; }
.try-live-item.on .try-live-thumb { box-shadow: 0 0 0 2px var(--ink); }
.try-live-item:focus-visible { outline: none; }
.try-live-item:focus-visible .try-live-thumb { box-shadow: 0 0 0 2px var(--focus-ring); }
.try-live-item b { overflow: hidden; font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.try-live-item em { position: absolute; top: 6px; left: 6px; padding: 0 6px; border-radius: 6px; background: var(--surface); font-size: 10px; font-style: normal; line-height: 18px; color: var(--accent-strong); }
.try-live-quiet { margin: 0; color: var(--muted); font-size: 13px; }
.try-live-tips { display: grid; gap: 10px; margin: 0; padding: 4px 4px; list-style: none; }
.try-live-tips li { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--muted-strong); }
.try-live-tips .anticon { flex: none; margin-top: 3px; color: var(--muted); }
.try-live-cta { position: sticky; bottom: calc(var(--dock-space) + 4px); z-index: 5; display: grid; gap: 6px; padding: 12px; border-radius: 18px; background: var(--glass); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); box-shadow: 0 0 0 1px var(--line), 0 10px 30px -16px #00000040; }
.try-live-cta .ant-btn-lg { height: 50px; font-size: 16px; }
@media (min-width: 1024px) {
  .try-live { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); max-width: 1080px; align-items: start; gap: 20px; }
  .try-live-stage { grid-row: span 3; min-height: 520px; position: sticky; top: 24px; }
  .try-live-cta { position: static; padding: 0; background: none; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; }
}
@media (min-width: 1024px) { .try-live-worn { width: 76px; height: 76px; } .try-live-worn.outfit { width: 132px; height: 164px; } }
@media (prefers-reduced-motion: reduce) {
  .try-live-thumb { transition: none; }
  .try-live-figure, .try-live-scan { animation: none; }
  .try-live-scan { display: none; }
  .try-live-drop-enter-active, .try-live-drop-leave-active { transition: opacity .15s ease; }
  .try-live-drop-enter-from, .try-live-drop-leave-to { transform: translate(-50%, -50%); }
}
</style>
