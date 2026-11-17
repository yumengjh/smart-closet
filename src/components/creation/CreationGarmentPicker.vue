<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { CheckOutlined } from '@ant-design/icons-vue'
import { closetApi, type Garment } from '../../services/api'
import { eligibleGarment } from '../../creation/eligible'
import { formatGarmentLabel } from '../../domain/outfit'
import { artworkForGarment } from '../../domain/outfit-images'
import { thumbUrl } from '../../services/urls'

const props = defineProps<{ open: boolean; selectedIds: string[]; max: number; locked?: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean]; toggle: [Garment] }>()
const { message } = App.useApp()
const compact = ref(window.matchMedia('(max-width: 767px)').matches)
const media = window.matchMedia('(max-width: 767px)'), onMedia = () => { compact.value = media.matches }
media.addEventListener('change', onMedia); onUnmounted(() => media.removeEventListener('change', onMedia))
const search = ref(''), category = ref(''), page = ref(1), total = ref(0), items = ref<Garment[]>([]), loading = ref(false), categories = ref<string[]>([])
let ticket = 0, started = false, timer: number | undefined
const picked = computed(() => new Set(props.selectedIds))
const filters = computed(() => [{ value: '', label: '全部' }, ...categories.value.map(value => ({ value, label: value }))])

async function load() {
  const mine = ++ticket
  loading.value = true
  try {
    const result = await closetApi.list({ status: 'ACTIVE', q: search.value.trim(), category: category.value, color: '', season: '', page: page.value, size: 24 })
    if (mine !== ticket) return
    items.value = result.items.filter(eligibleGarment); total.value = result.total
  } catch (cause) { if (mine === ticket) message.error(cause instanceof Error ? cause.message : '暂时未能加载衣物。') }
  finally { if (mine === ticket) loading.value = false }
}
watch(() => props.open, open => {
  if (!open) return
  if (!started) { started = true; void closetApi.metadataOptions().then(values => { categories.value = values.category || [] }).catch(() => { /* 筛选不可用时仍可搜索。 */ }) }
  void load()
})
watch([search, category], () => { page.value = 1; clearTimeout(timer); timer = window.setTimeout(load, 250) })
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <a-drawer :open="open" :placement="compact ? 'bottom' : 'right'" :height="compact ? '88%' : undefined" :width="compact ? undefined : 460" title="从衣柜挑" class="creation-picker-drawer" destroy-on-close @update:open="emit('update:open', $event)">
    <template #extra><span class="creation-picker-count">已选 {{ selectedIds.length }} / 最多 {{ max }}</span></template>
    <a-input-search v-model:value="search" placeholder="搜索衣服" allow-clear aria-label="搜索衣服" />
    <div v-if="categories.length" class="creation-picker-filters"><a-segmented v-model:value="category" :options="filters" aria-label="按品类筛选" /></div>
    <a-spin :spinning="loading">
      <div v-if="items.length" class="creation-picker-grid">
        <a-button v-for="g in items" :key="g.id" type="text" class="creation-picker-item" :class="{ on: picked.has(g.id) }" :aria-pressed="picked.has(g.id)" :disabled="locked" @click="emit('toggle', g)">
          <img :src="thumbUrl(artworkForGarment(g).url, 220)" :alt="formatGarmentLabel(g)" loading="lazy" />
          <span class="creation-picker-name">{{ formatGarmentLabel(g) }}</span>
          <span v-if="picked.has(g.id)" class="creation-picker-check"><CheckOutlined /></span>
        </a-button>
      </div>
      <a-empty v-else-if="!loading" :image="null" description="没有找到可以选的衣服" />
    </a-spin>
    <a-pagination v-if="total > 24" v-model:current="page" :total="total" :page-size="24" :show-size-changer="false" simple class="creation-picker-pages" @change="load" />
    <template #footer><a-button type="primary" block size="large" @click="emit('update:open', false)">完成{{ selectedIds.length ? ` · ${selectedIds.length} 件` : '' }}</a-button></template>
  </a-drawer>
</template>

<style scoped>
.creation-picker-count { font-size: 13px; color: var(--muted-strong); font-variant-numeric: tabular-nums; }
.creation-picker-filters { margin: 12px -4px 0; padding: 0 4px; overflow-x: auto; }
.creation-picker-filters :deep(.ant-segmented) { white-space: nowrap; }
.creation-picker-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.creation-picker-item.ant-btn { position: relative; display: flex; flex-direction: column; gap: 4px; height: auto; min-width: 0; padding: 6px; white-space: normal; border: 1px solid var(--line); background: var(--surface-alt); border-radius: 8px; color: var(--ink); }
.creation-picker-item img { width: 100%; aspect-ratio: 1; object-fit: contain; }
.creation-picker-name { width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; }
.creation-picker-item.on { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
.creation-picker-check { position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; background: var(--action-bg); color: var(--action-fg); font-size: 11px; }
.creation-picker-pages { margin-top: 14px; text-align: center; }
@media (min-width: 768px) { .creation-picker-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
