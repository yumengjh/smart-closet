<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, CheckOutlined, DeleteOutlined, FolderAddOutlined, PictureOutlined, PlusOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons-vue'
import CollectionCover from '../components/collections/CollectionCover.vue'
import CollectionPicker from '../components/collections/CollectionPicker.vue'
import '../inspiration/select-bar.css'
import { closetApi } from '../services/api'
import type { Outfit } from '../domain/outfit'
import PageTitle from '../shell/PageTitle.vue'
import { goBack } from '../shell/goBack'
import { collectionApi, inspirationApi, type Collection, type Inspiration } from '../services/inspirations'
import { mediaUrl } from '../services/urls'
import { track } from '../services/analytics'
import { playSound } from '../services/sound'

/**
 * 穿搭收藏（server 设计 2026-11-23；体验改版）：刷到喜欢的穿搭截图存进来，只给自己看。顶部是“攒了几套、还有几张没看”，
 * 合集像一摞照片；卡片上直接写看出来的风格和件数；“选择”可以一次放进合集或删除。手机从“＋ → 存穿搭图”进来（?add=1，
 * 先亮出选图按钮，不自动弹系统相册：iOS 要求用户手势）；电脑也可以直接粘贴或拖进页面。
 */
const route = useRoute(); const router = useRouter(); const { message, modal } = App.useApp()
const items = ref<Inspiration[]>([])
const total = ref(0)
const max = ref(300)
const cursor = ref<string | null>(null)
const loaded = ref(false)
const loadingMore = ref(false)
const error = ref('')
const q = ref('')
const collections = ref<Collection[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(0)
const dragging = ref(false)
const adding = computed(() => route.query.add === '1')

let latest = 0
async function load(more = false) {
  const mine = ++latest
  if (more) loadingMore.value = true; else error.value = ''
  try {
    const page = await inspirationApi.list({ q: q.value.trim() || undefined, look: look.value || undefined, cursor: more ? cursor.value : null })
    if (mine !== latest) return
    items.value = more ? [...items.value, ...page.items] : page.items
    total.value = page.total; max.value = page.max; cursor.value = page.nextCursor
  } catch (cause) { if (mine === latest) error.value = cause instanceof Error ? cause.message : '穿搭收藏没有加载出来。' }
  finally { if (mine === latest) { loaded.value = true; loadingMore.value = false } }
}
const outfits = ref(new Map<string, Outfit>())
async function loadCollections() {
  try {
    collections.value = (await collectionApi.list()).items
    // 只有搭配的合集用搭配缩略图做封面。
    if (collections.value.some(c => !c.coverThumbUrls?.length && c.coverOutfitId)) outfits.value = new Map((await closetApi.outfits()).map(o => [o.id, o]))
  } catch { /* 合集只是入口，加载失败不挡列表 */ }
}

// 风格筛选：只从拆过的图里汇总出现过的风格词；没拆过的图不出现这一行。
const look = ref('')
const lookOptions = ref<{ id: string; label: string }[]>([])
watch(items, list => { const seen = new Map(lookOptions.value.map(o => [o.id, o])); for (const item of list) for (const l of item.analysis?.looks || []) seen.set(l.id, l); lookOptions.value = [...seen.values()] })
function chooseLook(id: string) { pending.value = false; look.value = look.value === id ? '' : id; void load() }
// “还没看”：在已加载的里筛，不另外请求。
const pending = ref(false)
function choosePending() { pending.value = !pending.value; if (look.value) { look.value = ''; void load() } }
const shown = computed(() => pending.value ? items.value.filter(i => i.status !== 'ANALYZED') : items.value)
const unseen = computed(() => items.value.filter(i => i.status !== 'ANALYZED' && i.status !== 'ANALYZING').length)
const hero = computed(() => items.value.slice(0, 3))
function surprise() {
  const pool = items.value.filter(i => i.status !== 'ANALYZED')
  const target = (pool.length ? pool : items.value)[Math.floor(Math.random() * (pool.length || items.value.length))]
  if (target) { playSound('swoosh'); void router.push(`/inspirations/${target.id}`) }
}
const cardLine = (item: Inspiration) => item.status === 'ANALYZING' ? '正在看…' : item.status === 'ANALYZED' && item.analysis
  ? [item.analysis.looks[0]?.label, `${item.analysis.items.length} 件`].filter(Boolean).join(' · ') : item.status === 'REJECTED' ? '没看成' : '还没看'

// ---- 选择：一次放进合集或删除 ----
const selecting = ref(false)
const chosen = ref(new Set<string>())
function toggleSelecting() { selecting.value = !selecting.value; chosen.value = new Set(); playSound('tick') }
function toggle(item: Inspiration) { const next = new Set(chosen.value); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); chosen.value = next }
function open(item: Inspiration, event: MouseEvent) { if (selecting.value) { event.preventDefault(); toggle(item) } }
const collecting = ref(false)
function collected() { selecting.value = false; chosen.value = new Set(); void loadCollections() }
function removeChosen() {
  const ids = [...chosen.value]
  if (!ids.length) return
  modal.confirm({
    title: `删除这 ${ids.length} 张？`, content: '图片会彻底删除。用它们存成的搭配、动作卡和收进种草的衣服不受影响。', okText: '删除', cancelText: '保留', okButtonProps: { danger: true },
    async onOk() {
      let failed = 0
      for (const id of ids) { try { await inspirationApi.remove(id); track('inspiration_deleted', {}) } catch { failed++ } }
      playSound('drop'); message[failed ? 'warning' : 'success'](failed ? `有 ${failed} 张没删掉，请重试` : '删掉了')
      selecting.value = false; chosen.value = new Set(); await load(); void loadCollections()
    },
  })
}
let searchTimer = 0
watch(q, () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => void load(), 300) })

async function save(files: Blob[], source: 'picker' | 'paste' | 'drop' | 'share') {
  const images = files.filter(file => file.type.startsWith('image/'))
  if (!images.length) { if (files.length) message.warning('只能存图片'); return }
  let saved = 0; let duplicates = 0; let first: Inspiration | null = null
  uploading.value += images.length
  for (const file of images) {
    try {
      const result = await inspirationApi.upload(file)
      track('inspiration_saved', { source, duplicate: result.duplicate })
      if (result.duplicate) duplicates++; else { saved++; first ??= result.inspiration }
    } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有存上，请重试。') }
    finally { uploading.value-- }
  }
  if (saved) { playSound('success'); message.success(saved === 1 ? '存好了' : `存好了 ${saved} 张`) }
  if (duplicates) message.info(duplicates === 1 ? '这张已经存过了' : `${duplicates} 张已经存过了`)
  if (adding.value || route.query.shared !== undefined) void router.replace({ query: {} })
  await load()
  // 一次只存一张时直接打开它，方便马上写备注、放进合集。
  if (images.length === 1 && first) void router.push(`/inspirations/${first.id}`)
}
function picked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files || [])]
  input.value = ''
  void save(files, 'picker')
}
function pick() { fileInput.value?.click() }
function pasted(event: ClipboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"]')) return
  const files = [...(event.clipboardData?.files || [])]
  if (files.length) { event.preventDefault(); void save(files, 'paste') }
}
function dropped(event: DragEvent) { dragging.value = false; const files = [...(event.dataTransfer?.files || [])]; if (files.length) void save(files, 'drop') }

const full = computed(() => total.value >= max.value)

// 系统分享（安卓 share_target，见 public/sw.js）：service worker 把图片放进本机临时收件箱，这里上传后立刻清空。
async function receiveShared() {
  if (route.query.shared === undefined) return
  if (route.query.shared === '0' || !('caches' in window)) { message.info('没有收到图片，可以在这里点“存穿搭图”选图'); void router.replace({ query: {} }); return }
  try {
    const inbox = await caches.open('yuda-share-v1')
    const keys = await inbox.keys()
    const files: File[] = []
    for (const key of keys) {
      const response = await inbox.match(key)
      if (!response) continue
      const blob = await response.blob()
      files.push(new File([blob], decodeURIComponent(response.headers.get('x-name') || 'shared.png'), { type: blob.type || 'image/png' }))
    }
    for (const key of keys) await inbox.delete(key)
    if (files.length) await save(files, 'share')
    else void router.replace({ query: {} })
  } catch { message.error('分享过来的图没有读到，可以在这里点“存穿搭图”选图'); void router.replace({ query: {} }) }
}

onMounted(() => { void load(); void loadCollections(); void receiveShared(); window.addEventListener('paste', pasted) })
onUnmounted(() => { window.removeEventListener('paste', pasted); window.clearTimeout(searchTimer) })
</script>

<template>
  <PageTitle title="穿搭收藏" :count="total || null" unit="张" hint="刷到喜欢的穿搭，截图存进来。只有你自己看得到，整张图不会拿去生图。" />
  <div class="insp" :class="{ dragging, selecting }" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="dropped">
    <header class="insp-head">
      <a-button type="text" shape="circle" aria-label="返回" @click="goBack(router, '/wardrobe')"><ArrowLeftOutlined /></a-button>
      <a-input v-model:value="q" allow-clear class="insp-search" placeholder="搜单品、穿法或备注" aria-label="搜穿搭收藏"><template #prefix><SearchOutlined /></template></a-input>
      <a-button v-if="items.length" :type="selecting ? 'primary' : 'text'" class="insp-select" @click="toggleSelecting">{{ selecting ? '完成' : '选择' }}</a-button>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="picked" />
    </header>

    <!-- 顶部：攒了几套、还有几张没看；最近三张叠成一摞 -->
    <section v-if="loaded && items.length && !q && !look && !pending" class="insp-hero">
      <div class="insp-hero-text">
        <h2>攒了 {{ total }} 套穿搭</h2>
        <p>{{ unseen ? `还有 ${unseen} 张没看过怎么穿` : '每一张都看过了，再存几张吧' }}</p>
        <div class="insp-hero-actions">
          <a-button type="primary" :loading="uploading > 0" :disabled="full" @click="pick"><PlusOutlined /> 存穿搭图</a-button>
          <a-button v-if="items.length > 1" @click="surprise">{{ unseen ? '挑一张看看' : '随便看一张' }}</a-button>
        </div>
      </div>
      <button type="button" class="insp-hero-stack" aria-label="打开最近存的一张" @click="router.push(`/inspirations/${hero[0].id}`)">
        <img v-for="(item, n) in [...hero].reverse()" :key="item.id" :src="mediaUrl(item.thumbUrl)" alt="" :style="{ '--n': hero.length - 1 - n }" />
      </button>
    </section>

    <div v-if="adding && !uploading" class="insp-add">
      <p>选一张或几张截图</p>
      <a-button type="primary" size="large" :disabled="full" @click="pick"><PictureOutlined /> 从相册选</a-button>
    </div>

    <!-- 合集：一摞一摞的 -->
    <section v-if="collections.length || items.length" class="insp-sec">
      <header><h3>合集</h3><RouterLink to="/collections" class="insp-more-link">全部 <RightOutlined /></RouterLink></header>
      <nav class="insp-collections" aria-label="合集">
        <RouterLink v-for="item in collections" :key="item.id" :to="`/collections/${item.id}`" class="insp-collection">
          <CollectionCover :collection="item" :outfits="outfits" />
          <b>{{ item.name }}</b><small>{{ item.outfitCount + item.inspirationCount }} 项</small>
        </RouterLink>
        <RouterLink to="/collections?new=1" class="insp-collection insp-collection-new"><span><PlusOutlined /></span><b>新合集</b><small>&nbsp;</small></RouterLink>
      </nav>
    </section>

    <div v-if="items.length" class="insp-filters" role="group" aria-label="筛选">
      <a-button size="small" shape="round" :type="!look && !pending ? 'primary' : 'default'" @click="pending = false; look && chooseLook(look)">全部</a-button>
      <a-button v-if="unseen" size="small" shape="round" :type="pending ? 'primary' : 'default'" :aria-pressed="pending" @click="choosePending">还没看 {{ unseen }}</a-button>
      <a-button v-for="option in lookOptions" :key="option.id" size="small" shape="round" :type="look === option.id ? 'primary' : 'default'" :aria-pressed="look === option.id" @click="chooseLook(option.id)">{{ option.label }}</a-button>
    </div>

    <a-alert v-if="error" type="warning" :message="error" show-icon class="insp-alert"><template #action><a-button size="small" @click="load()">重试</a-button></template></a-alert>
    <a-alert v-if="full" type="info" :message="`最多存 ${max} 张，删掉一些再存`" show-icon class="insp-alert" />
    <a-skeleton v-if="!loaded" active :paragraph="{ rows: 6 }" />

    <div v-else-if="shown.length" class="insp-grid">
      <RouterLink v-for="item in shown" :key="item.id" :to="`/inspirations/${item.id}`" class="insp-card" :class="{ chosen: chosen.has(item.id), working: item.status === 'ANALYZING' }" :aria-label="selecting ? `选择这张${chosen.has(item.id) ? '（已选）' : ''}` : (item.note || '打开这张')" @click="open(item, $event)">
        <img class="insp-card-backdrop" :src="mediaUrl(item.thumbUrl)" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        <img class="insp-card-image" :src="mediaUrl(item.thumbUrl)" alt="" loading="lazy" decoding="async" />
        <span class="insp-card-line" :class="{ seen: item.status === 'ANALYZED' }">{{ cardLine(item) }}</span>
        <i v-if="selecting" class="insp-check" aria-hidden="true"><CheckOutlined v-if="chosen.has(item.id)" /></i>
        <small v-if="item.note" class="insp-card-note">{{ item.note }}</small>
      </RouterLink>
    </div>
    <div v-else-if="!error" class="insp-empty">
      <div class="insp-empty-stack" aria-hidden="true"><span></span><span></span><span></span></div>
      <p>{{ q || look || pending ? '没有找到' : '刷到喜欢的穿搭，截图存进来' }}</p>
      <small v-if="!q && !look && !pending">鱼搭会帮你看出每一件、配饰和姿势</small>
      <a-button v-if="!q && !look && !pending" type="primary" @click="pick"><PictureOutlined /> 存第一张</a-button>
    </div>
    <div v-if="cursor" class="insp-more"><a-button :loading="loadingMore" @click="load(true)">看更早的</a-button></div>
    <div v-if="dragging" class="insp-drop" aria-hidden="true">松手存进来</div>
  </div>

  <!-- 选择后的底栏 -->
  <Teleport to="body">
    <Transition name="insp-bar">
      <div v-if="selecting" class="insp-bar" role="toolbar" aria-label="选中的穿搭收藏">
        <b>已选 {{ chosen.size }}</b>
        <a-button :disabled="!chosen.size" @click="collecting = true"><FolderAddOutlined /> 放进合集</a-button>
        <a-button danger :disabled="!chosen.size" @click="removeChosen"><DeleteOutlined /> 删除</a-button>
      </div>
    </Transition>
  </Teleport>
  <CollectionPicker :open="collecting" kind="INSPIRATION" :ref-ids="[...chosen]" @close="collecting = false" @done="collected" />
</template>

<style scoped>
.insp { position: relative; max-width: 1080px; margin: 0 auto; padding-bottom: 24px; }
.insp.selecting { padding-bottom: 96px; }
.insp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.insp-head > .ant-btn:first-child { margin-left: -8px; }
.insp-search { flex: 1; min-width: 0; max-width: 420px; }
.insp-select.ant-btn { margin-left: auto; }

.insp-hero { display: grid; grid-template-columns: minmax(0, 1fr) 132px; align-items: center; gap: 12px; margin-bottom: 20px; padding: 18px 16px 18px 20px; border-radius: 22px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); overflow: hidden; }
.insp-hero h2 { margin: 0; color: var(--ink); font-size: 22px; font-weight: 600; letter-spacing: .01em; }
.insp-hero p { margin: 4px 0 14px; color: var(--muted); font-size: 13px; }
.insp-hero-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.insp-hero-actions .ant-btn { display: inline-flex; align-items: center; gap: 6px; }
.insp-hero-stack { position: relative; height: 150px; padding: 0; border: 0; background: transparent; cursor: pointer; }
.insp-hero-stack img { position: absolute; left: 50%; top: 50%; width: 88px; height: 120px; margin: -60px 0 0 -44px; border-radius: 12px; object-fit: cover; background: var(--surface-alt); box-shadow: 0 10px 22px -12px #00000080, 0 0 0 2px var(--surface);
  transform: translateX(calc((var(--n) - 1) * 22px)) rotate(calc((var(--n) - 1) * 9deg)); transition: transform .35s cubic-bezier(.2, .9, .2, 1); }
.insp-hero-stack:hover img { transform: translateX(calc((var(--n) - 1) * 30px)) rotate(calc((var(--n) - 1) * 13deg)); }
.insp-hero-stack:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 4px; border-radius: 16px; }

.insp-add { display: grid; justify-items: center; gap: 12px; margin-bottom: 16px; padding: 28px 16px; border: 1px dashed var(--line-strong, var(--line)); border-radius: 16px; background: var(--surface-alt); color: var(--muted); }
.insp-add p { margin: 0; }

.insp-sec { margin-bottom: 16px; }
.insp-sec > header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.insp-sec h3 { margin: 0; color: var(--ink); font-size: 15px; font-weight: 600; }
.insp-more-link { display: inline-flex; align-items: center; gap: 2px; color: var(--muted); font-size: 13px; text-decoration: none; }
.insp-collections { display: flex; gap: 12px; margin: 0 -16px; padding: 4px 16px 6px; overflow-x: auto; scrollbar-width: none; }
.insp-collection { flex: none; display: grid; justify-items: start; gap: 2px; width: 104px; color: var(--ink); text-decoration: none; }
.insp-collection b { max-width: 100%; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.insp-collection small { color: var(--muted-subtle); font-size: 12px; }
.insp-collection-new span { display: grid; place-items: center; width: 100%; aspect-ratio: 1; border: 1.5px dashed var(--line-strong, var(--line)); border-radius: 12px; color: var(--muted); font-size: 20px; }
.insp-collection-new b { color: var(--muted); }

.insp-filters { display: flex; gap: 6px; margin: 0 -16px 12px; padding: 0 16px; overflow-x: auto; scrollbar-width: none; }
.insp-filters .ant-btn { flex: none; }
.insp-alert { margin-bottom: 12px; }

/* 统一 3:4 的网格（2026-11-23）：按时间从左到右读；整张图放进格子不裁，空出来的两边用同一张图的模糊放大铺底。 */
.insp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.insp-card { position: relative; display: block; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 14px; background: var(--surface-alt); box-shadow: 0 0 0 1px var(--line); color: var(--muted); text-decoration: none; transition: transform .2s ease, box-shadow .2s ease; }
.insp-card:active { transform: scale(.985); }
.insp-card:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.insp-card img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.insp-card-backdrop { object-fit: cover; filter: blur(18px) saturate(1.1); opacity: .55; transform: scale(1.15); }
.insp-card-image { object-fit: contain; }
.insp-card-line { position: absolute; left: 8px; top: 8px; padding: 2px 8px; border-radius: 999px; background: #ffffffd9; color: var(--muted-strong); font-size: 11px; line-height: 18px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.insp-card-line.seen { background: #111111c7; color: #fff; }
.insp-card.working .insp-card-line { animation: insp-pulse 1.4s ease-in-out infinite; }
@keyframes insp-pulse { 50% { opacity: .55; } }
.insp-card-note { position: absolute; inset: auto 0 0; padding: 28px 10px 8px; overflow: hidden; background: linear-gradient(#0000, #00000080); color: #fff; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }
.insp-check { position: absolute; right: 8px; top: 8px; display: grid; place-items: center; width: 24px; height: 24px; border: 2px solid #fff; border-radius: 50%; background: #00000033; color: #fff; font-size: 12px; font-style: normal; box-shadow: 0 1px 4px #0000004d; }
.insp-card.chosen { box-shadow: 0 0 0 2px var(--ink); }
.insp-card.chosen .insp-check { background: var(--ink); border-color: var(--ink); }
.insp.selecting .insp-card-image { transition: transform .2s ease; }
.insp.selecting .insp-card.chosen .insp-card-image { transform: scale(.94); }

.insp-empty { display: grid; justify-items: center; gap: 10px; padding: 36px 16px 40px; border-radius: 20px; background: var(--surface-alt); color: var(--muted); font-size: 14px; text-align: center; }
.insp-empty p { margin: 0; color: var(--ink); font-size: 15px; }
.insp-empty small { margin-top: -4px; font-size: 12px; }
.insp-empty-stack { position: relative; width: 120px; height: 110px; margin-bottom: 4px; }
.insp-empty-stack span { position: absolute; left: 30px; top: 6px; width: 60px; height: 84px; border-radius: 10px; background: var(--surface); box-shadow: 0 6px 14px -8px #00000040, 0 0 0 1px var(--line); }
.insp-empty-stack span:nth-child(1) { transform: rotate(-12deg) translateX(-18px); }
.insp-empty-stack span:nth-child(3) { transform: rotate(10deg) translateX(18px); }
.insp-more { margin-top: 16px; text-align: center; }
.insp-drop { position: absolute; inset: 0; display: grid; place-items: center; border: 2px dashed var(--ink); border-radius: 16px; background: color-mix(in srgb, var(--surface) 82%, transparent); color: var(--ink); font-size: 16px; pointer-events: none; }
@media (min-width: 768px) { .insp-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .insp-card { border-radius: 16px; } .insp-hero { grid-template-columns: minmax(0, 1fr) 200px; padding: 24px 28px; } .insp-hero-stack img { width: 110px; height: 150px; margin: -75px 0 0 -55px; } .insp-hero-stack { height: 180px; } }
@media (min-width: 1024px) { .insp-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .insp-hero-stack img, .insp-card, .insp-card img { transition: none; } .insp-card.working .insp-card-line { animation: none; } }
</style>
