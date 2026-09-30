<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { SearchOutlined, SlidersOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import { closetApi, type Garment, type ListQuery } from '../services/api'
import type { MetadataField } from '../domain/metadata'
import { useClosetStore } from '../stores/closet'
import GarmentCard from '../components/GarmentCard.vue'

const router = useRouter()
const closet = useClosetStore()
const query = reactive<ListQuery>({ status: 'ACTIVE', q: '', category: '', color: '', season: '', page: 1, size: 24 })
const items = ref<Garment[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / query.size)))
const schema = ref<MetadataField[]>([])
const categories = computed(() => schema.value.find(field => field.key === 'category')?.options || [])
const colors = computed(() => schema.value.find(field => field.key === 'primaryColor')?.options || [])
const seasons = computed(() => schema.value.find(field => field.key === 'seasons')?.options || [])
let searchTimer: number | undefined

async function load() {
  loading.value = true
  error.value = ''
  try {
    const page = await closetApi.list(query)
    items.value = page.items
    total.value = page.total
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '衣柜暂时无法加载。' }
  finally { loading.value = false }
}
function debounceLoad() {
  window.clearTimeout(searchTimer)
  query.page = 1
  searchTimer = window.setTimeout(load, 220)
}
function clearFilters() { query.q = ''; query.category = ''; query.color = ''; query.season = ''; debounceLoad() }
onMounted(async () => { await Promise.all([load(), closet.refreshCounts(), closetApi.metadataFields().then(fields => { schema.value = fields }).catch(cause => { error.value = String(cause) })]) })
onUnmounted(() => window.clearTimeout(searchTimer))
watch(() => [query.category, query.color, query.season], debounceLoad)
</script>

<template>
  <div class="page-heading wardrobe-heading">
    <div><p class="eyebrow">衣橱空间</p><h1>我的衣柜</h1><p class="page-subtitle">已经核对并确认入柜的衣物，按最近更新排序。</p></div>
    <div class="wardrobe-stats"><strong>{{ total.toString().padStart(2, '0') }}</strong><span>件已入柜</span></div>
  </div>
  <section class="wardrobe-tools" aria-label="搜索和筛选衣物">
    <a-input v-model:value="query.q" class="search-input" allow-clear placeholder="搜一搜颜色、品类或图案" @input="debounceLoad"><template #prefix><SearchOutlined /></template></a-input>
    <div class="filter-row"><span class="filter-label"><SlidersOutlined /> 筛选</span>
      <a-select :value="query.category || undefined" @update:value="query.category = $event || ''" allow-clear placeholder="全部品类" class="filter-select"><a-select-option v-for="category in categories" :key="category" :value="category">{{ category }}</a-select-option></a-select>
      <a-select :value="query.color || undefined" @update:value="query.color = $event || ''" allow-clear placeholder="全部颜色" class="filter-select"><a-select-option v-for="color in colors" :key="color" :value="color">{{ color }}</a-select-option></a-select>
      <a-select :value="query.season || undefined" @update:value="query.season = $event || ''" allow-clear placeholder="全部季节" class="filter-select"><a-select-option v-for="season in seasons" :key="season" :value="season">{{ season }}</a-select-option></a-select>
      <button v-if="query.q || query.category || query.color || query.season" class="clear-filters" @click="clearFilters">清除筛选</button>
    </div>
  </section>
  <a-alert v-if="error" type="error" :message="error" show-icon closable class="page-alert" />
  <div v-if="loading && !items.length" class="loading-state"><a-spin /><span>正在加载衣柜…</span></div>
  <section v-else-if="items.length" class="garment-grid" aria-label="衣物列表" :aria-busy="loading">
    <GarmentCard v-for="item in items" :key="item.id" :garment="item" />
    <button class="add-card" @click="router.push('/add')"><span class="add-card-icon"><PlusOutlined /></span><strong>添加衣物</strong><small>上传 → 处理 → 核对入柜</small></button>
  </section>
  <section v-else class="empty-wardrobe">
    <span class="empty-spark"><PlusOutlined /></span><p class="eyebrow">从一件衣服开始</p><h2>{{ query.q || query.category || query.color || query.season ? '没有找到这件衣物' : '你的衣柜还没有衣物' }}</h2><p>{{ query.q || query.category || query.color || query.season ? '试试换一个关键词，或清除筛选条件。' : '上传单件衣物照片，处理后核对并确认，它就会出现在这里。' }}</p>
    <button v-if="query.q || query.category || query.color || query.season" class="outline-button" @click="clearFilters">清除筛选</button><button v-else class="outline-button" @click="router.push('/add')"><PlusOutlined /> 添加第一件衣物</button>
  </section>
  <footer v-if="total > query.size" class="pagination-row"><span>第 {{ query.page }} / {{ pageCount }} 页</span><div><a-button :disabled="query.page <= 1 || loading" @click="query.page--; load()">上一页</a-button><a-button :disabled="query.page >= pageCount || loading" @click="query.page++; load()">下一页</a-button></div></footer>
</template>
