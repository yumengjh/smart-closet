<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, PictureOutlined, SearchOutlined } from '@ant-design/icons-vue'
import PageTitle from '../shell/PageTitle.vue'
import { collectionApi, inspirationApi, type Collection, type Inspiration } from '../services/inspirations'
import { mediaUrl } from '../services/urls'
import { track } from '../services/analytics'
import { playSound } from '../services/sound'

/**
 * 穿搭灵感（server 设计 2026-11-23 第四节，第一期只存图）：刷到喜欢的穿搭截图存进来，只给自己看，
 * 不会拿去生图。手机从“＋ → 存穿搭图”进来（?add=1，先亮出选图按钮，不自动弹系统相册：iOS 要求用户手势）；
 * 电脑也可以直接粘贴或拖进页面。
 */
const route = useRoute(); const router = useRouter(); const { message } = App.useApp()
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
    const page = await inspirationApi.list({ q: q.value.trim() || undefined, cursor: more ? cursor.value : null })
    if (mine !== latest) return
    items.value = more ? [...items.value, ...page.items] : page.items
    total.value = page.total; max.value = page.max; cursor.value = page.nextCursor
  } catch (cause) { if (mine === latest) error.value = cause instanceof Error ? cause.message : '灵感没有加载出来。' }
  finally { if (mine === latest) { loaded.value = true; loadingMore.value = false } }
}
async function loadCollections() { try { collections.value = (await collectionApi.list()).items } catch { /* 合集只是入口，加载失败不挡灵感列表 */ } }

let searchTimer = 0
watch(q, () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => void load(), 300) })

async function save(files: Blob[], source: 'picker' | 'paste' | 'drop') {
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
  if (adding.value) void router.replace({ query: {} })
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

const ratio = (item: Inspiration) => item.width && item.height ? `${item.width} / ${item.height}` : '3 / 4'
const full = computed(() => total.value >= max.value)

onMounted(() => { void load(); void loadCollections(); window.addEventListener('paste', pasted) })
onUnmounted(() => { window.removeEventListener('paste', pasted); window.clearTimeout(searchTimer) })
</script>

<template>
  <PageTitle title="灵感" :count="total || null" unit="张" hint="刷到喜欢的穿搭，截图存进来。只有你自己看得到，不会拿去生图。" />
  <div class="insp" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="dropped">
    <header class="insp-head">
      <a-button type="text" shape="circle" aria-label="返回衣柜" @click="router.push('/wardrobe')"><ArrowLeftOutlined /></a-button>
      <a-input v-model:value="q" allow-clear class="insp-search" placeholder="搜备注" aria-label="按备注搜灵感"><template #prefix><SearchOutlined /></template></a-input>
      <a-button type="primary" :loading="uploading > 0" :disabled="full" @click="pick"><PictureOutlined /> 存穿搭图</a-button>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="picked" />
    </header>

    <div v-if="adding && !uploading" class="insp-add">
      <p>选一张或几张截图</p>
      <a-button type="primary" size="large" :disabled="full" @click="pick"><PictureOutlined /> 从相册选</a-button>
    </div>

    <nav v-if="collections.length" class="insp-collections" aria-label="合集">
      <RouterLink v-for="item in collections" :key="item.id" :to="`/collections/${item.id}`" class="insp-collection">
        <span class="insp-cover"><img v-if="item.coverThumbUrl" :src="mediaUrl(item.coverThumbUrl)" alt="" loading="lazy" /></span>
        <b>{{ item.name }}</b><small>{{ item.outfitCount + item.inspirationCount }}</small>
      </RouterLink>
    </nav>

    <a-alert v-if="error" type="warning" :message="error" show-icon class="insp-alert"><template #action><a-button size="small" @click="load()">重试</a-button></template></a-alert>
    <a-alert v-if="full" type="info" :message="`最多存 ${max} 张，删掉一些再存`" show-icon class="insp-alert" />
    <a-skeleton v-if="!loaded" active :paragraph="{ rows: 6 }" />

    <div v-else-if="items.length" class="insp-grid">
      <RouterLink v-for="item in items" :key="item.id" :to="`/inspirations/${item.id}`" class="insp-card" :aria-label="item.note || '打开这张灵感'">
        <img :src="mediaUrl(item.thumbUrl)" :style="{ aspectRatio: ratio(item) }" alt="" loading="lazy" />
        <small v-if="item.note">{{ item.note }}</small>
      </RouterLink>
    </div>
    <div v-else-if="!error" class="insp-empty">
      <p>{{ q ? '没有找到' : '刷到喜欢的穿搭，截图存进来' }}</p>
      <a-button v-if="!q" type="primary" @click="pick"><PictureOutlined /> 存第一张</a-button>
    </div>
    <div v-if="cursor" class="insp-more"><a-button :loading="loadingMore" @click="load(true)">看更早的</a-button></div>
    <div v-if="dragging" class="insp-drop" aria-hidden="true">松手存进来</div>
  </div>
</template>

<style scoped>
.insp { position: relative; max-width: 1080px; margin: 0 auto; }
.insp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.insp-head > .ant-btn:first-child { margin-left: -8px; }
.insp-search { flex: 1; min-width: 0; max-width: 360px; }
.insp-head > .ant-btn-primary { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.insp-add { display: grid; justify-items: center; gap: 12px; margin-bottom: 16px; padding: 28px 16px; border: 1px dashed var(--line-strong, var(--line)); border-radius: 16px; background: var(--surface-alt); color: var(--muted); }
.insp-add p { margin: 0; }
.insp-collections { display: flex; gap: 10px; margin: 0 -16px 16px; padding: 0 16px 4px; overflow-x: auto; scrollbar-width: none; }
.insp-collection { flex: none; display: grid; grid-template-columns: 1fr auto; gap: 2px 6px; width: 112px; color: var(--ink); text-decoration: none; }
.insp-cover { grid-column: 1 / -1; display: block; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: var(--surface-alt); box-shadow: 0 0 0 1px var(--line); }
.insp-cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
.insp-collection b { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.insp-collection small { color: var(--muted-subtle); font-size: 12px; }
.insp-alert { margin-bottom: 12px; }
.insp-grid { columns: 2; column-gap: 10px; }
.insp-card { display: block; margin-bottom: 10px; overflow: hidden; break-inside: avoid; border-radius: 14px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); color: var(--muted); text-decoration: none; }
.insp-card:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.insp-card img { display: block; width: 100%; height: auto; object-fit: cover; background: var(--surface-alt); }
.insp-card small { display: block; padding: 6px 10px 8px; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.insp-empty { display: grid; justify-items: center; gap: 12px; padding: 40px 16px; border-radius: 16px; background: var(--surface-alt); color: var(--muted); font-size: 14px; text-align: center; }
.insp-empty p { margin: 0; }
.insp-more { margin-top: 16px; text-align: center; }
.insp-drop { position: absolute; inset: 0; display: grid; place-items: center; border: 2px dashed var(--ink); border-radius: 16px; background: color-mix(in srgb, var(--surface) 82%, transparent); color: var(--ink); font-size: 16px; pointer-events: none; }
@media (min-width: 768px) { .insp-grid { columns: 3; column-gap: 14px; } .insp-card { margin-bottom: 14px; } }
@media (min-width: 1024px) { .insp-grid { columns: 4; } }
</style>
