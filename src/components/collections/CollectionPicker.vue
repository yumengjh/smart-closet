<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { COLLECTION_SUGGESTIONS, MAX_COLLECTION_NAME, collectionApi, type Collection, type CollectionKind } from '../../services/inspirations'
import { track } from '../../services/analytics'

/**
 * 放进合集（穿搭灵感设计 5.2）：勾选即放入、取消即移出，立即生效；同一项可放进多个合集。
 * 第一次用时只给建议名，点了才建，不替用户预建。
 */
const props = defineProps<{ open: boolean; kind: CollectionKind; refId: string; selected: string[] }>()
const emit = defineEmits<{ close: []; changed: [ids: string[]] }>()
const { message } = App.useApp()
const collections = ref<Collection[]>([])
const max = ref(30)
const chosen = ref<string[]>([])
const loading = ref(false)
const busy = ref('')
const name = ref('')
const error = ref('')

async function load() {
  loading.value = true; error.value = ''
  try { const page = await collectionApi.list(); collections.value = page.items; max.value = page.max }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '合集没有加载出来。' }
  finally { loading.value = false }
}
watch(() => props.open, open => { if (open) { chosen.value = [...props.selected]; name.value = ''; void load() } }, { immediate: true })

const suggestions = computed(() => collections.value.length ? [] : COLLECTION_SUGGESTIONS)
const full = computed(() => collections.value.length >= max.value)

async function toggle(id: string, on: boolean) {
  busy.value = id
  try {
    if (on) { await collectionApi.add(id, props.kind, props.refId); chosen.value = [...new Set([...chosen.value, id])]; track('collection_item_added', { kind: props.kind === 'OUTFIT' ? 'outfit' : 'inspiration' }) }
    else { await collectionApi.removeItem(id, props.kind, props.refId); chosen.value = chosen.value.filter(item => item !== id) }
    emit('changed', chosen.value)
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有放进去，请重试。') }
  finally { busy.value = '' }
}

async function create(raw = name.value) {
  const value = raw.trim()
  if (!value) return
  busy.value = 'new'
  try {
    const created = await collectionApi.create(value)
    track('collection_created', {})
    collections.value = [...collections.value, created]
    name.value = ''
    busy.value = ''
    await toggle(created.id, true)
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '合集没有建好，请重试。') }
  finally { busy.value = '' }
}
</script>

<template>
  <a-modal :open="open" title="放进合集" :footer="null" width="400px" destroy-on-close @cancel="emit('close')">
    <a-alert v-if="error" type="warning" :message="error" show-icon class="cp-alert"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-skeleton v-if="loading && !collections.length" active :paragraph="{ rows: 3 }" />
    <div v-else class="cp-list">
      <a-checkbox v-for="item in collections" :key="item.id" class="cp-row" :checked="chosen.includes(item.id)" :disabled="busy === item.id" @change="(event: { target: { checked: boolean } }) => toggle(item.id, event.target.checked)">
        <b>{{ item.name }}</b><small>{{ item.outfitCount + item.inspirationCount }}</small>
      </a-checkbox>
      <p v-if="!collections.length && !loading" class="cp-empty">还没有合集，起个名字吧</p>
    </div>
    <div v-if="suggestions.length" class="cp-suggest">
      <a-button v-for="word in suggestions" :key="word" size="small" :disabled="busy === 'new'" @click="create(word)">{{ word }}</a-button>
    </div>
    <a-space-compact v-if="!full" block class="cp-new">
      <a-input v-model:value="name" :maxlength="MAX_COLLECTION_NAME" placeholder="新合集" aria-label="新合集名称" @press-enter="create()" />
      <a-button type="primary" :loading="busy === 'new'" :disabled="!name.trim()" aria-label="新建合集" @click="create()"><PlusOutlined /></a-button>
    </a-space-compact>
    <p v-else class="cp-empty">最多 {{ max }} 个合集</p>
  </a-modal>
</template>

<style scoped>
.cp-alert { margin-bottom: 12px; }
.cp-list { display: grid; gap: 2px; max-height: 320px; overflow-y: auto; margin: 0 -4px 12px; }
.cp-row { display: flex; align-items: center; margin: 0; padding: 10px 4px; border-radius: 10px; }
.cp-row :deep(.ant-checkbox + span) { display: flex; flex: 1; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
.cp-row b { overflow: hidden; font-weight: 500; color: var(--ink); text-overflow: ellipsis; white-space: nowrap; }
.cp-row small { color: var(--muted-subtle); font-size: 12px; }
.cp-empty { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
.cp-suggest { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.cp-new { display: flex; }
.cp-new :deep(.ant-input) { flex: 1; }
</style>
