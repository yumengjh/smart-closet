<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { CheckOutlined, PlusOutlined } from '@ant-design/icons-vue'
import CollectionCover from './CollectionCover.vue'
import { COLLECTION_SUGGESTIONS, MAX_COLLECTION_NAME, collectionApi, type Collection, type CollectionKind } from '../../services/inspirations'
import { track } from '../../services/analytics'
import { playSound } from '../../services/sound'

/**
 * 放进合集（体验改版，2026-11-23）：手机从底部弹出，电脑是对话框；合集是带封面的小方块，点一下放进去、再点拿出来，立即生效。
 * 一次选了多项（refIds 多于一个）时，点哪个合集就把这些全放进去然后收起。第一个方块是“新合集”，建议名点了才建。
 */
const props = defineProps<{ open: boolean; kind: CollectionKind; refId?: string; refIds?: string[]; selected?: string[] }>()
const emit = defineEmits<{ close: []; changed: [ids: string[]]; done: [collection: Collection] }>()
const { message } = App.useApp()
const collections = ref<Collection[]>([])
const max = ref(30)
const chosen = ref<string[]>([])
const loading = ref(false)
const busy = ref('')
const naming = ref(false)
const name = ref('')
const error = ref('')
const narrowQuery = window.matchMedia('(max-width: 767px)')
const narrow = ref(narrowQuery.matches)
const onNarrow = () => { narrow.value = narrowQuery.matches }
narrowQuery.addEventListener('change', onNarrow)
onUnmounted(() => narrowQuery.removeEventListener('change', onNarrow))

const refs = computed(() => props.refIds?.length ? props.refIds : props.refId ? [props.refId] : [])
const batch = computed(() => refs.value.length > 1)
const title = computed(() => batch.value ? `把 ${refs.value.length} 项放进合集` : '放进合集')

async function load() {
  loading.value = true; error.value = ''
  try { const page = await collectionApi.list(); collections.value = page.items; max.value = page.max }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '合集没有加载出来。' }
  finally { loading.value = false }
}
watch(() => props.open, open => { if (open) { chosen.value = [...(props.selected || [])]; name.value = ''; naming.value = false; void load() } }, { immediate: true })

const suggestions = computed(() => collections.value.length ? [] : COLLECTION_SUGGESTIONS)
const full = computed(() => collections.value.length >= max.value)
const kindProp = computed(() => props.kind === 'OUTFIT' ? 'outfit' as const : 'inspiration' as const)

async function tap(target: Collection) {
  if (busy.value) return
  busy.value = target.id
  try {
    if (batch.value) {
      await collectionApi.addMany(target.id, refs.value.map(refId => ({ kind: props.kind, refId })))
      track('collection_item_added', { kind: kindProp.value })
      playSound('pop'); message.success(`放进“${target.name}”了`)
      emit('done', target); emit('close')
      return
    }
    const on = !chosen.value.includes(target.id)
    if (on) { await collectionApi.add(target.id, props.kind, refs.value[0]); chosen.value = [...chosen.value, target.id]; track('collection_item_added', { kind: kindProp.value }); playSound('pop') }
    else { await collectionApi.removeItem(target.id, props.kind, refs.value[0]); chosen.value = chosen.value.filter(id => id !== target.id); playSound('tick') }
    emit('changed', chosen.value)
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有放进去，请重试。') }
  finally { busy.value = '' }
}

async function create(raw = name.value) {
  const value = raw.trim()
  if (!value || busy.value) return
  busy.value = 'new'
  try {
    const created = await collectionApi.create(value)
    track('collection_created', {})
    collections.value = [created, ...collections.value]
    name.value = ''; naming.value = false
    busy.value = ''
    await tap(created)
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '合集没有建好，请重试。') }
  finally { if (busy.value === 'new') busy.value = '' }
}
function startNaming() { naming.value = true; window.setTimeout(() => (document.querySelector('.cp-name input') as HTMLInputElement | null)?.focus(), 50) }
</script>

<template>
  <component :is="narrow ? 'a-drawer' : 'a-modal'" :open="open" :title="title" :footer="null" placement="bottom" height="auto" :width="narrow ? undefined : 480"
    root-class-name="cp-root" destroy-on-close @close="emit('close')" @cancel="emit('close')">
    <a-alert v-if="error" type="warning" :message="error" show-icon class="cp-alert"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <div v-if="naming" class="cp-name">
      <a-input v-model:value="name" :maxlength="MAX_COLLECTION_NAME" placeholder="起个名字，比如 周末" aria-label="新合集名称" @press-enter="create()" />
      <a-button type="primary" :loading="busy === 'new'" :disabled="!name.trim()" @click="create()">建好{{ batch ? '并放进去' : '' }}</a-button>
      <a-button @click="naming = false">取消</a-button>
    </div>
    <div v-if="suggestions.length && !naming" class="cp-suggest">
      <span>常用：</span>
      <a-button v-for="word in suggestions" :key="word" size="small" shape="round" :disabled="!!busy" @click="create(word)">{{ word }}</a-button>
    </div>
    <a-skeleton v-if="loading && !collections.length" active :paragraph="{ rows: 3 }" />
    <div v-else class="cp-grid" role="group" :aria-label="title">
      <button v-if="!full && !naming" type="button" class="cp-tile cp-new" @click="startNaming">
        <span class="cp-new-icon"><PlusOutlined /></span><b>新合集</b>
      </button>
      <button v-for="item in collections" :key="item.id" type="button" class="cp-tile" :class="{ on: !batch && chosen.includes(item.id) }" :aria-pressed="!batch && chosen.includes(item.id)" :disabled="busy === item.id" @click="tap(item)">
        <CollectionCover :collection="item" size="sm" />
        <b>{{ item.name }}</b><small>{{ item.outfitCount + item.inspirationCount }} 项</small>
        <i v-if="!batch && chosen.includes(item.id)" class="cp-check"><CheckOutlined /></i>
      </button>
    </div>
    <p v-if="full" class="cp-note">最多 {{ max }} 个合集</p>
  </component>
</template>

<style scoped>
.cp-alert { margin-bottom: 12px; }
.cp-name { display: flex; gap: 8px; margin-bottom: 12px; }
.cp-name .ant-input { flex: 1; }
.cp-suggest { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; color: var(--muted); font-size: 12px; }
.cp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px 10px; max-height: 52vh; overflow-y: auto; padding: 2px 2px 8px; }
.cp-tile { position: relative; display: grid; justify-items: center; gap: 2px; padding: 6px 4px 8px; border: 0; border-radius: 14px; background: transparent; color: var(--ink); cursor: pointer; transition: background .2s ease; }
.cp-tile:hover { background: var(--surface-alt); }
.cp-tile.on { background: var(--surface-alt); box-shadow: 0 0 0 2px var(--ink); }
.cp-tile:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.cp-tile b { max-width: 100%; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.cp-tile small { color: var(--muted-subtle); font-size: 11px; }
.cp-tile :deep(.cc) { width: 76px; }
.cp-new-icon { display: grid; place-items: center; width: 76px; aspect-ratio: 1; border: 1.5px dashed var(--line-strong, var(--line)); border-radius: 12px; color: var(--muted); font-size: 20px; }
.cp-check { position: absolute; right: 8px; top: 8px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--ink); color: var(--surface); font-size: 12px; }
.cp-note { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
</style>
<style>
/* 底部抽屉：圆角、贴底的安全区 */
.cp-root.ant-drawer .ant-drawer-content-wrapper { border-radius: 20px 20px 0 0; overflow: hidden; }
.cp-root.ant-drawer .ant-drawer-body { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
</style>
