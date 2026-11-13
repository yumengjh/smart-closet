<script setup lang="ts">
// 整理中（ToC 改版 P4，#240）：刚拍的衣服在衣柜最上面横排显示——正在整理的带进度，等你确认的点进去看，已经做好的一键收进衣柜。
// 全部列表与批量处理在 /pending（“整理中”页）。数据就是原来的未入柜（status=DRAFT）。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { RightOutlined } from '@ant-design/icons-vue'
import { closetApi, type Garment } from '../services/api'
import { isProcessing } from '../domain/workflow'
import { thumbUrl } from '../services/urls'
import { playSound } from '../services/sound'
import { useClosetStore } from '../stores/closet'
import { sortingState, type SortingState } from './sorting'

const emit = defineEmits<{ changed: [] }>()
const closet = useClosetStore(); const { message } = App.useApp()
const items = ref<Garment[]>([]); const total = ref(0); const busy = ref(''); let timer = 0; let alive = false
const states = computed(() => items.value.map(item => ({ item, state: sortingState(item) })))
const waiting = computed(() => states.value.filter(s => s.state !== 'processing').length)
const LABEL: Record<SortingState, string> = { processing: '正在整理', review: '等你确认', failed: '没整理好', ready: '可以收进衣柜' }
async function load() {
  try { const page = await closetApi.list({ status: 'DRAFT', q: '', category: '', color: '', season: '', page: 1, size: 12 }); if (!alive) return; items.value = page.items; total.value = page.total }
  catch { /* 拿不到就先不显示，不打断衣柜 */ }
  window.clearTimeout(timer)
  if (alive && items.value.some(item => isProcessing(item.taskStatus))) timer = window.setTimeout(load, 4000)
}
async function admit(item: Garment) {
  busy.value = item.id
  try { await closetApi.confirm(item.id, { revision: item.revision }); playSound('success'); message.success('已收进衣柜'); await load(); await closet.refreshCounts(); emit('changed') }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '没收进去，点开看一下。') }
  finally { busy.value = '' }
}
const image = (item: Garment) => thumbUrl(item.displayUrl || item.sourceUrl, 320)
onMounted(() => { alive = true; void load() })
onUnmounted(() => { alive = false; window.clearTimeout(timer) })
defineExpose({ reload: load })
</script>

<template>
  <section v-if="total" class="sorting" aria-label="整理中">
    <header>
      <h2>整理中 <small>{{ total }} 件<template v-if="waiting"> · {{ waiting }} 件要你看一下</template></small></h2>
      <RouterLink to="/pending">全部 <RightOutlined /></RouterLink>
    </header>
    <div class="sorting-row">
      <article v-for="{ item, state } in states" :key="item.id" class="sorting-item" :class="state">
        <RouterLink :to="`/garment/${item.id}`" class="sorting-media" :aria-label="`${item.name || item.category[0] || '新衣服'}：${LABEL[state]}`">
          <img v-if="image(item)" :src="image(item)" alt="" loading="lazy" />
          <span v-if="state === 'processing'" class="sorting-bar"><i /></span>
        </RouterLink>
        <small>{{ LABEL[state] }}</small>
        <a-button v-if="state === 'ready'" size="small" type="primary" block :loading="busy === item.id" @click="admit(item)">收进衣柜</a-button>
        <RouterLink v-else-if="state !== 'processing'" :to="`/garment/${item.id}`" custom v-slot="{ navigate }"><a-button size="small" block @click="navigate">看一下</a-button></RouterLink>
      </article>
    </div>
  </section>
</template>

<style scoped>
.sorting { margin: 0 0 18px; padding: 14px; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.sorting header { display: flex; align-items: baseline; margin-bottom: 10px; }
.sorting h2 { margin: 0; font-size: 15px; font-weight: 650; }
.sorting h2 small { margin-left: 6px; font-size: 13px; font-weight: 400; color: var(--muted); }
.sorting header a { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; font-size: 13px; color: var(--muted); }
.sorting-row { display: flex; gap: 10px; margin: 0 -14px; padding: 2px 14px 2px; overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-inline: 14px; scrollbar-width: none; }
.sorting-row::-webkit-scrollbar { display: none; }
.sorting-item { display: flex; flex: 0 0 96px; flex-direction: column; gap: 6px; scroll-snap-align: start; }
.sorting-media { position: relative; display: grid; place-items: center; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 12px; background: var(--surface-alt); }
.sorting-media img { width: 88%; height: 88%; object-fit: contain; }
.sorting-item.processing .sorting-media img { opacity: .55; filter: saturate(.4); }
.sorting-bar { position: absolute; left: 10px; right: 10px; bottom: 10px; height: 4px; overflow: hidden; border-radius: 2px; background: var(--line); }
.sorting-bar i { position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: 2px; background: var(--brand); animation: sorting-slide 1.4s ease-in-out infinite; }
@keyframes sorting-slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
.sorting-item small { overflow: hidden; font-size: 12px; color: var(--muted); text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.sorting-item.review small, .sorting-item.ready small { color: var(--accent-strong); }
.sorting-item.failed small { color: var(--danger); }
@media (prefers-reduced-motion: reduce) { .sorting-bar i { animation: none; width: 100%; opacity: .5; } }
</style>
