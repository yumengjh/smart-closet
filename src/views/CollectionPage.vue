<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, CheckOutlined, DeleteOutlined, EditOutlined, MinusCircleOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons-vue'
import PageTitle from '../shell/PageTitle.vue'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import CollectionCover from '../components/collections/CollectionCover.vue'
import '../inspiration/select-bar.css'
import { goBack } from '../shell/goBack'
import { closetApi } from '../services/api'
import { MAX_COLLECTION_NAME, collectionApi, inspirationApi, type Collection, type CollectionKind, type Inspiration } from '../services/inspirations'
import { mediaUrl } from '../services/urls'
import type { Outfit } from '../domain/outfit'
import { track } from '../services/analytics'
import { playSound } from '../services/sound'

/**
 * 一个合集（体验改版，2026-11-23）：顶部是叠起来的封面、名字和件数；“添加”从这里直接挑图和搭配放进来；“选择”一次移出多项。
 * 只用于整理和查看，不进推荐；删除合集不删里面的东西。
 */
type Entry = { kind: CollectionKind; id: string; at: number; outfit?: Outfit; inspiration?: Inspiration }
const route = useRoute(); const router = useRouter(); const { message, modal } = App.useApp()
const id = computed(() => String(route.params.id || ''))
const collection = ref<Collection | null>(null)
const allOutfits = ref<Outfit[]>([])
const inspirations = ref<Inspiration[]>([])
const error = ref('')
const loaded = ref(false)
const tab = ref<'all' | 'OUTFIT' | 'INSPIRATION'>('all')

async function load() {
  error.value = ''; loaded.value = false
  try {
    const [list, outfits, page] = await Promise.all([collectionApi.list(), closetApi.outfits(), inspirationApi.list({ collection: id.value, limit: 60 })])
    const found = list.items.find(item => item.id === id.value)
    if (!found) { error.value = '这个合集不在了。'; return }
    collection.value = found; allOutfits.value = outfits; inspirations.value = page.items
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '合集没有打开。' }
  finally { loaded.value = true }
}

const outfits = computed(() => allOutfits.value.filter(item => item.collectionIds?.includes(id.value)))
const outfitMap = computed(() => new Map(allOutfits.value.map(o => [o.id, o])))
const entries = computed<Entry[]>(() => [
  ...outfits.value.map(o => ({ kind: 'OUTFIT' as const, id: o.id, at: o.updatedAtMs, outfit: o })),
  ...inspirations.value.map(i => ({ kind: 'INSPIRATION' as const, id: i.id, at: i.createdAt, inspiration: i })),
].sort((a, b) => b.at - a.at))
const shown = computed(() => tab.value === 'all' ? entries.value : entries.value.filter(e => e.kind === tab.value))
const both = computed(() => outfits.value.length > 0 && inspirations.value.length > 0)
const summary = computed(() => [outfits.value.length ? `${outfits.value.length} 套搭配` : '', inspirations.value.length ? `${inspirations.value.length} 张图` : ''].filter(Boolean).join(' · ') || '还是空的')
const key = (e: { kind: CollectionKind; id: string }) => `${e.kind}:${e.id}`

// ---- 选择后一次移出 ----
const selecting = ref(false)
const chosen = ref(new Set<string>())
function toggleSelecting() { selecting.value = !selecting.value; chosen.value = new Set(); playSound('tick') }
function tapEntry(entry: Entry, event: MouseEvent) {
  if (!selecting.value) return
  event.preventDefault()
  const next = new Set(chosen.value); const k = key(entry)
  if (next.has(k)) next.delete(k); else next.add(k)
  chosen.value = next
}
async function removeChosen() {
  const refs = entries.value.filter(e => chosen.value.has(key(e))).map(e => ({ kind: e.kind, refId: e.id }))
  if (!refs.length) return
  try {
    await collectionApi.removeMany(id.value, refs)
    playSound('drop'); message.success(`移出了 ${refs.length} 项`)
    selecting.value = false; chosen.value = new Set(); await load()
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有移出，请重试。') }
}

// ---- 添加：从这里挑图和搭配放进来 ----
const adding = ref(false)
const addTab = ref<'INSPIRATION' | 'OUTFIT'>('INSPIRATION')
const candidates = ref<Inspiration[]>([])
const picks = ref(new Set<string>())
const addBusy = ref(false)
const narrowQuery = window.matchMedia('(max-width: 767px)')
const narrow = ref(narrowQuery.matches)
const onNarrow = () => { narrow.value = narrowQuery.matches }
narrowQuery.addEventListener('change', onNarrow)
onUnmounted(() => narrowQuery.removeEventListener('change', onNarrow))
async function openAdd() {
  adding.value = true; picks.value = new Set()
  addTab.value = inspirations.value.length || !allOutfits.value.length ? 'INSPIRATION' : 'OUTFIT'
  try { candidates.value = (await inspirationApi.list({ limit: 60 })).items } catch { candidates.value = [] }
}
const freeInspirations = computed(() => candidates.value.filter(i => !i.collectionIds.includes(id.value)))
const freeOutfits = computed(() => allOutfits.value.filter(o => !o.collectionIds?.includes(id.value)))
function togglePick(kind: CollectionKind, refId: string) { const next = new Set(picks.value); const k = `${kind}:${refId}`; if (next.has(k)) next.delete(k); else next.add(k); picks.value = next }
async function confirmAdd() {
  const refs = [...picks.value].map(k => { const [kind, refId] = k.split(':'); return { kind: kind as CollectionKind, refId } })
  if (!refs.length) return
  addBusy.value = true
  try {
    await collectionApi.addMany(id.value, refs)
    track('collection_item_added', { kind: refs[0].kind === 'OUTFIT' ? 'outfit' : 'inspiration' })
    playSound('pop'); message.success(`放进来 ${refs.length} 项`)
    adding.value = false; await load()
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有放进来，请重试。') }
  finally { addBusy.value = false }
}

// ---- 改名、删除 ----
const renaming = ref(false)
const name = ref('')
const savingName = ref(false)
function startRename() { name.value = collection.value?.name || ''; renaming.value = true }
async function rename() {
  if (!collection.value || !name.value.trim()) return
  savingName.value = true
  try { const updated = await collectionApi.update(collection.value.id, { name: name.value.trim() }); collection.value = { ...collection.value, name: updated.name }; renaming.value = false }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '没有改好，请重试。') }
  finally { savingName.value = false }
}
function remove() {
  const target = collection.value
  if (!target) return
  modal.confirm({
    title: `删除“${target.name}”？`, content: '只删合集，里面的搭配和图都还在。', okText: '删除', cancelText: '保留', okButtonProps: { danger: true },
    async onOk() { await collectionApi.remove(target.id); playSound('drop'); message.success('删掉了'); void router.replace('/collections') },
  })
}
function menu({ key: action }: { key: string | number }) { if (action === 'rename') startRename(); else if (action === 'delete') remove() }

watch(id, () => { if (id.value) void load() }, { immediate: true })
</script>

<template>
  <PageTitle :title="collection?.name || '合集'" :count="collection ? entries.length : null" unit="项" />
  <div class="co" :class="{ selecting }">
    <header class="co-head">
      <a-button type="text" shape="circle" aria-label="返回" @click="goBack(router, '/collections')"><ArrowLeftOutlined /></a-button>
      <span class="co-spacer" />
      <a-button v-if="entries.length" :type="selecting ? 'primary' : 'text'" @click="toggleSelecting">{{ selecting ? '完成' : '选择' }}</a-button>
      <a-dropdown v-if="collection" :trigger="['click']" placement="bottomRight">
        <a-button type="text" shape="circle" aria-label="合集操作"><MoreOutlined /></a-button>
        <template #overlay><a-menu @click="menu"><a-menu-item key="rename"><EditOutlined /> 改名</a-menu-item><a-menu-divider /><a-menu-item key="delete" danger><DeleteOutlined /> 删除合集</a-menu-item></a-menu></template>
      </a-dropdown>
    </header>
    <a-alert v-if="error" type="warning" :message="error" show-icon><template #action><a-button size="small" @click="router.replace('/collections')">看全部合集</a-button></template></a-alert>
    <a-skeleton v-else-if="!loaded" active :paragraph="{ rows: 6 }" />
    <template v-else-if="collection">
      <section class="co-hero">
        <div class="co-cover"><CollectionCover :collection="collection" :outfits="outfitMap" /></div>
        <div class="co-hero-text">
          <h2>{{ collection.name }}</h2>
          <p>{{ summary }}</p>
          <a-button type="primary" @click="openAdd"><PlusOutlined /> 添加</a-button>
        </div>
      </section>

      <a-segmented v-if="both" v-model:value="tab" class="co-tabs" :options="[{ value: 'all', label: '全部' }, { value: 'OUTFIT', label: `搭配 ${outfits.length}` }, { value: 'INSPIRATION', label: `图 ${inspirations.length}` }]" aria-label="看哪一类" />

      <div v-if="shown.length" class="co-grid">
        <RouterLink v-for="entry in shown" :key="key(entry)" :to="entry.kind === 'OUTFIT' ? `/outfits/${entry.id}` : `/inspirations/${entry.id}`" class="co-card" :class="{ chosen: chosen.has(key(entry)), outfit: entry.kind === 'OUTFIT' }" @click="tapEntry(entry, $event)">
          <span v-if="entry.outfit" class="co-outfit"><OutfitThumbnail :scene="entry.outfit.scene" :title="entry.outfit.name" /></span>
          <template v-else-if="entry.inspiration">
            <img class="co-backdrop" :src="mediaUrl(entry.inspiration.thumbUrl)" alt="" aria-hidden="true" loading="lazy" decoding="async" />
            <img class="co-image" :src="mediaUrl(entry.inspiration.thumbUrl)" alt="" loading="lazy" decoding="async" />
          </template>
          <span class="co-kind">{{ entry.kind === 'OUTFIT' ? '搭配' : '图' }}</span>
          <small v-if="entry.outfit" class="co-name">{{ entry.outfit.name }}</small>
          <i v-if="selecting" class="co-check" aria-hidden="true"><CheckOutlined v-if="chosen.has(key(entry))" /></i>
        </RouterLink>
      </div>
      <div v-else class="co-empty">
        <p>还是空的</p>
        <small>点“添加”挑几张图或几套搭配放进来</small>
        <a-button type="primary" @click="openAdd"><PlusOutlined /> 添加</a-button>
      </div>
    </template>
  </div>

  <Teleport to="body">
    <Transition name="insp-bar">
      <div v-if="selecting" class="insp-bar" role="toolbar" aria-label="选中的项">
        <b>已选 {{ chosen.size }}</b>
        <a-button danger :disabled="!chosen.size" @click="removeChosen"><MinusCircleOutlined /> 移出合集</a-button>
      </div>
    </Transition>
  </Teleport>

  <!-- 添加：手机从底部弹出 -->
  <component :is="narrow ? 'a-drawer' : 'a-modal'" :open="adding" :title="`放进“${collection?.name || ''}”`" :footer="null" placement="bottom" height="82%" :width="narrow ? undefined : 640" root-class-name="cp-root" destroy-on-close @close="adding = false" @cancel="adding = false">
    <div class="ad">
      <a-segmented v-model:value="addTab" block :options="[{ value: 'INSPIRATION', label: `穿搭图 ${freeInspirations.length}` }, { value: 'OUTFIT', label: `搭配 ${freeOutfits.length}` }]" aria-label="添加哪一类" />
      <div v-if="addTab === 'INSPIRATION'" class="ad-grid">
        <button v-for="item in freeInspirations" :key="item.id" type="button" class="ad-tile" :class="{ on: picks.has(`INSPIRATION:${item.id}`) }" :aria-pressed="picks.has(`INSPIRATION:${item.id}`)" @click="togglePick('INSPIRATION', item.id)">
          <img :src="mediaUrl(item.thumbUrl)" alt="" loading="lazy" /><i><CheckOutlined v-if="picks.has(`INSPIRATION:${item.id}`)" /></i>
        </button>
        <p v-if="!freeInspirations.length" class="ad-none">穿搭图都放进来了，或者还没存过</p>
      </div>
      <div v-else class="ad-grid">
        <button v-for="item in freeOutfits" :key="item.id" type="button" class="ad-tile outfit" :class="{ on: picks.has(`OUTFIT:${item.id}`) }" :aria-pressed="picks.has(`OUTFIT:${item.id}`)" @click="togglePick('OUTFIT', item.id)">
          <OutfitThumbnail :scene="item.scene" :title="item.name" :resolution="160" /><small>{{ item.name }}</small><i><CheckOutlined v-if="picks.has(`OUTFIT:${item.id}`)" /></i>
        </button>
        <p v-if="!freeOutfits.length" class="ad-none">搭配都放进来了，或者还没存过</p>
      </div>
      <div class="ad-foot"><a-button type="primary" block size="large" :disabled="!picks.size" :loading="addBusy" @click="confirmAdd">放进来{{ picks.size ? ` ${picks.size} 项` : '' }}</a-button></div>
    </div>
  </component>

  <a-modal :open="renaming" title="改个名字" ok-text="保存" cancel-text="取消" :confirm-loading="savingName" :ok-button-props="{ disabled: !name.trim() }" width="360px" destroy-on-close @ok="rename" @cancel="renaming = false">
    <a-input v-model:value="name" :maxlength="MAX_COLLECTION_NAME" aria-label="合集名称" autofocus @press-enter="rename" />
  </a-modal>
</template>

<style scoped>
.co { max-width: 1080px; margin: 0 auto; padding-bottom: 24px; }
.co.selecting { padding-bottom: 96px; }
.co-head { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; }
.co-head > .ant-btn:first-child { margin-left: -8px; }
.co-head > :last-child { margin-right: -8px; }
.co-spacer { flex: 1; }
.co-hero { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: center; gap: 16px; margin-bottom: 18px; }
.co-hero h2 { margin: 0; overflow: hidden; color: var(--ink); font-size: 22px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.co-hero p { margin: 4px 0 12px; color: var(--muted); font-size: 13px; }
.co-hero .ant-btn { display: inline-flex; align-items: center; gap: 6px; }
.co-tabs { margin-bottom: 14px; }
/* 和穿搭收藏列表一样的 3:4 网格，图整张放下不裁；搭配缩略图（4:5）在格子里居中，名字压在底部。 */
.co-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.co-card { position: relative; display: block; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 14px; background: var(--surface-alt); box-shadow: 0 0 0 1px var(--line); color: var(--ink); text-decoration: none; }
.co-card img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.co-backdrop { object-fit: cover; filter: blur(18px) saturate(1.1); opacity: .55; transform: scale(1.15); }
.co-image { object-fit: contain; }
.co-outfit { position: absolute; inset: 0 0 30px; display: grid; place-items: center; background: var(--surface-alt); }
.co-outfit :deep(.outfit-thumbnail) { width: 100%; height: 100%; }
.co-outfit :deep(canvas) { display: block; width: 100%; height: 100%; object-fit: contain; }
.co-name { position: absolute; inset: auto 0 0; padding: 6px 10px 8px; overflow: hidden; background: var(--surface); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.co-kind { position: absolute; left: 8px; top: 8px; padding: 0 8px; border-radius: 999px; background: #ffffffd9; color: var(--muted-strong); font-size: 11px; line-height: 20px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.co-card.outfit .co-kind { background: #111111c7; color: #fff; }
.co-check { position: absolute; right: 8px; top: 8px; display: grid; place-items: center; width: 24px; height: 24px; border: 2px solid #fff; border-radius: 50%; background: #00000033; color: #fff; font-size: 12px; font-style: normal; box-shadow: 0 1px 4px #0000004d; }
.co-card.chosen { box-shadow: 0 0 0 2px var(--ink); }
.co-card.chosen .co-check { background: var(--ink); border-color: var(--ink); }
.co-empty { display: grid; justify-items: center; gap: 8px; padding: 40px 16px; border-radius: 20px; background: var(--surface-alt); color: var(--muted); text-align: center; }
.co-empty p { margin: 0; color: var(--ink); font-size: 15px; }
.co-empty small { font-size: 12px; }
.ad { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.ad-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; align-content: start; }
.ad-tile { position: relative; display: block; padding: 0; overflow: hidden; border: 0; border-radius: 12px; background: var(--surface-alt); aspect-ratio: 3 / 4; cursor: pointer; }
.ad-tile.outfit { aspect-ratio: auto; display: grid; }
.ad-tile.outfit small { padding: 4px 6px 6px; overflow: hidden; color: var(--ink); font-size: 12px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.ad-tile img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ad-tile i { position: absolute; right: 6px; top: 6px; display: grid; place-items: center; width: 22px; height: 22px; border: 2px solid #fff; border-radius: 50%; background: #00000033; color: #fff; font-size: 11px; font-style: normal; }
.ad-tile.on { box-shadow: 0 0 0 2px var(--ink); }
.ad-tile.on i { background: var(--ink); border-color: var(--ink); }
.ad-none { grid-column: 1 / -1; margin: 20px 0; color: var(--muted); font-size: 13px; text-align: center; }
.ad-foot { position: sticky; bottom: 0; margin-top: auto; padding-top: 8px; background: var(--surface); }
@media (min-width: 768px) { .co-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .co-card { border-radius: 16px; } .co-hero { grid-template-columns: 160px minmax(0, 1fr); } }
@media (min-width: 1024px) { .co-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
