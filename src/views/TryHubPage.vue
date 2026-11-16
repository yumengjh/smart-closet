<script setup lang="ts">
// 试穿入口（ToC 改版（二）3.1）：上身效果图（原 OOTD 页，已改成“这套 + 谁来穿”的工作台）与实时试穿合成一个入口。
// 实时试穿这里只是启动页：看今日剩余时长、挑从哪件或哪套开始、看拍摄小贴士，点“打开镜头”才进全屏的 /try-on。
// 没有实时试穿权限时不显示切换，直接是上身效果图。
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BulbOutlined, CameraOutlined, HistoryOutlined, LockOutlined, VideoCameraOutlined } from '@ant-design/icons-vue'
import { useBillingStore } from '../billing/store'
import { realtimePrice } from '../billing/model'
import OotdPage from './OotdPage.vue'
import PageTitle from '../shell/PageTitle.vue'
import OutfitCollage from '../today/OutfitCollage.vue'
import { scenePieces } from '../today/deck'
import TryOnQuota from '../tryon/TryOnQuota.vue'
import { tryOnAccess } from '../tryon/access'
import { tryOnApi, type Candidate } from '../tryon/api'
import type { Outfit } from '../domain/outfit'
import { mediaUrl } from '../services/urls'
import { creationCatalog, loadCreationCatalog } from '../creation/access'

const billing = useBillingStore()
onMounted(() => { void loadCreationCatalog(true).catch(() => { /* Optional feature: the existing try-on flow stays usable. */ }) })
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
function start() {
  if (needsPoints.value) { billing.purchase = 'tryon'; return }
  void router.push({ path: '/try-on', query: pick.value ? { [pick.value.kind]: pick.value.id } : {} })
}
const TIPS = [
  { icon: BulbOutlined, text: '站在光线均匀的地方，背景越简单越好' },
  { icon: CameraOutlined, text: '离镜头远一点，让要试的部位完整入镜' },
  { icon: LockOutlined, text: '取景提示只在你的浏览器里识别，结束后参考图会删除' },
]
</script>

<template>
  <div class="try-hub">
    <div v-if="creationCatalog?.enabled" class="try-creation-entry"><div><strong>把搭配做成作品</strong><span>画报、平铺，记录自己的穿搭</span></div><a-button @click="router.push('/creation')">穿搭创作</a-button></div>
    <div v-if="liveAvailable" class="try-hub-switch">
      <a-segmented v-model:value="mode" block :options="[{ value: 'image', label: '上身效果图' }, { value: 'live', label: '实时试穿' }]" aria-label="试穿方式" />
    </div>
    <div v-if="mode === 'live'" class="try-live">
      <PageTitle title="实时试穿" />
      <section class="try-live-stage">
        <div class="try-live-frame" aria-hidden="true">
          <span class="try-live-corner tl" /><span class="try-live-corner tr" /><span class="try-live-corner bl" /><span class="try-live-corner br" />
          <VideoCameraOutlined />
        </div>
        <div class="try-live-copy">
          <h2>对着镜头，直接换上</h2>
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
        <li v-for="tip in TIPS" :key="tip.text"><component :is="tip.icon" />{{ tip.text }}</li>
      </ul>

      <div class="try-live-cta">
        <a-button type="primary" size="large" block :disabled="!cap?.ready && !needsPoints" @click="start"><VideoCameraOutlined /> {{ needsPoints ? '充值点数' : `打开镜头${realtimePrice(billing.realtime) ? ` · ${realtimePrice(billing.realtime)}` : ''}` }}</a-button>
        <a-button v-if="cap?.hasHistory" type="text" @click="router.push('/try-on?history=1')"><HistoryOutlined /> 拍摄记录</a-button>
      </div>
    </div>
    <OotdPage v-else />
  </div>
</template>

<style scoped>
.try-creation-entry { display: flex; justify-content: space-between; align-items: center; gap: 16px; max-width: 1080px; margin: 0 auto 18px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.try-creation-entry strong, .try-creation-entry span { display: block; }
.try-creation-entry strong { font-size: 14px; }
.try-creation-entry span { margin-top: 4px; font-size: 12px; color: var(--muted); }
.try-hub-switch { max-width: 360px; margin: 0 auto 16px; }
.try-live { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; max-width: 640px; margin: 0 auto; }
.try-live > * { min-width: 0; }
.try-live-stage { position: relative; display: flex; flex-direction: column; justify-content: flex-end; min-height: 300px; padding: 20px; overflow: hidden; border-radius: 20px; color: #fff; background: radial-gradient(120% 90% at 50% 0%, #3a3a3a 0%, #111 70%); }
.try-live-frame { position: absolute; inset: 22px 22px 110px; display: grid; place-items: center; color: #ffffff40; font-size: 44px; }
.try-live-corner { position: absolute; width: 22px; height: 22px; border-color: #ffffffb3; border-style: solid; border-width: 0; }
.try-live-corner.tl { top: 0; left: 0; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 8px; }
.try-live-corner.tr { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 8px; }
.try-live-corner.bl { bottom: 0; left: 0; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 8px; }
.try-live-corner.br { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 8px; }
.try-live-copy { position: relative; }
.try-live-copy h2 { margin: 0; font-size: 20px; font-weight: 650; }
.try-live-copy p { margin: 4px 0 0; font-size: 13px; color: #ffffffb3; }
.try-live-copy :deep(.ant-typography) { color: #ffffff99; }
.try-live-warn { color: #ffd59a !important; }
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
@media (prefers-reduced-motion: reduce) { .try-live-thumb { transition: none; } }
</style>
