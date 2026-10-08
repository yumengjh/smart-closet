<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { SearchOutlined, SlidersOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import { closetApi, type Garment, type ListQuery, type SearchResult } from '../services/api'
import { useClosetStore } from '../stores/closet'
import GarmentCard from '../components/GarmentCard.vue'
import GarmentCardSkeleton from '../components/GarmentCardSkeleton.vue'
import { buildTags, combineQuery, removeWords, IMAGE_STYLE_LABELS, SEARCH_EXAMPLES, type SearchTag } from '../wardrobe/search'

const router = useRouter()
const closet = useClosetStore()
const query = reactive<ListQuery>({ status: 'ACTIVE', q: '', category: '', color: '', season: '', page: 1, size: 24 })
const items = ref<Garment[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
// Hybrid search (colour/category filters + keywords + local semantics) whenever there is text or an image-style choice.
const imageStyle = ref('')
const searchResult = ref<SearchResult | null>(null)
const searching = computed(() => Boolean(query.q.trim() || imageStyle.value))
const pageSize = computed(() => searching.value ? 20 : query.size)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const tags = computed(() => searching.value && searchResult.value ? buildTags(searchResult.value.parsed, searchResult.value.imageStyle) : [])
const hasFilters = computed(() => Boolean(query.q || query.category || query.color || query.season || imageStyle.value))
const imageStyleOptions = [{ value: '', label: '图片风格：默认' }, ...Object.entries(IMAGE_STYLE_LABELS).filter(([k]) => k !== 'OTHER').map(([value, label]) => ({ value, label }))]
const options = ref<Record<string, string[]>>({})
const categories = computed(() => options.value.category || [])
const colors = computed(() => options.value.primaryColor || [])
const seasons = computed(() => options.value.seasons || [])
let searchTimer: number | undefined

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (searching.value) {
      const result = await closetApi.search(combineQuery(query.q, query.category, query.color, query.season), query.page, imageStyle.value || undefined)
      searchResult.value = result; items.value = result.items; total.value = result.total
    } else {
      const page = await closetApi.list(query)
      searchResult.value = null; items.value = page.items; total.value = page.total
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '衣柜暂时无法加载。' }
  finally { loading.value = false }
}
function debounceLoad() {
  window.clearTimeout(searchTimer)
  query.page = 1
  searchTimer = window.setTimeout(load, 220)
}
const helpOpen = ref(false)
function tryExample(example: string) { query.q = example; helpOpen.value = false; debounceLoad() }
function clearFilters() { query.q = ''; query.category = ''; query.color = ''; query.season = ''; imageStyle.value = ''; debounceLoad() }
function closeTag(tag: SearchTag) {
  // A style typed in the box ("卡通的") is removed from the text; the closet default is turned off by choosing "全部风格".
  if (tag.imageStyle) { if (tag.words.some(w => query.q.includes(w))) query.q = removeWords(query.q, tag.words); else imageStyle.value = 'ALL' }
  else {
    query.q = removeWords(query.q, tag.words)
    if (tag.words.includes(query.category)) query.category = ''
    if (tag.words.some(w => w && query.color.startsWith(w))) query.color = ''
    if (tag.words.includes(query.season)) query.season = ''
  }
  debounceLoad()
}
onMounted(async () => { await Promise.all([load(), closet.refreshCounts(), closetApi.metadataOptions().then(values => { options.value = values }).catch(cause => { error.value = String(cause) })]) })
onUnmounted(() => window.clearTimeout(searchTimer))
watch(() => [query.category, query.color, query.season, imageStyle.value], debounceLoad)
</script>

<template>
  <div class="page-heading wardrobe-heading">
    <div><p class="eyebrow">衣橱空间</p><h1>我的衣柜</h1><p class="page-subtitle">已经核对并确认入柜的衣物，按最近更新排序。</p></div>
    <div class="wardrobe-stats"><strong>{{ total.toString().padStart(2, '0') }}</strong><span>{{ searching ? '件符合' : '件已入柜' }}</span></div>
  </div>
  <section class="wardrobe-tools" aria-label="搜索和筛选衣物">
    <a-input v-model:value="query.q" class="search-input" allow-clear placeholder="搜颜色、品类，或描述：适合海边的白色上衣" @input="debounceLoad"><template #prefix><SearchOutlined /></template>
      <template #suffix>
        <a-popover v-model:open="helpOpen" trigger="click" placement="bottomLeft" overlay-class-name="search-help">
          <template #content>
            <div class="search-help-body">
              <p><strong>可以这样搜</strong>：颜色和品类会精确筛选（问红色不会给粉色），风格词会按衣柜的风格标签筛选（“可爱”≈甜美，聊天里学会的新词也能用），其余描述按本机语义理解，没有就直说没有。</p>
              <p>默认只看衣柜里最多的图片风格，可在右侧“图片风格”切换。全部在本机计算，不消耗额度。</p>
              <div class="search-help-examples"><a-tag v-for="example in SEARCH_EXAMPLES" :key="example" class="search-help-example" @click="tryExample(example)">{{ example }}</a-tag></div>
            </div>
          </template>
          <a-button type="text" size="small" class="search-help-trigger" aria-label="搜索说明"><QuestionCircleOutlined /></a-button>
        </a-popover>
      </template>
    </a-input>
    <div class="filter-row"><span class="filter-label"><SlidersOutlined /> 筛选</span>
      <a-select :value="query.category || undefined" @update:value="query.category = $event || ''" allow-clear placeholder="全部品类" class="filter-select"><a-select-option v-for="category in categories" :key="category" :value="category">{{ category }}</a-select-option></a-select>
      <a-select :value="query.color || undefined" @update:value="query.color = $event || ''" allow-clear placeholder="全部颜色" class="filter-select"><a-select-option v-for="color in colors" :key="color" :value="color">{{ color }}</a-select-option></a-select>
      <a-select :value="query.season || undefined" @update:value="query.season = $event || ''" allow-clear placeholder="全部季节" class="filter-select"><a-select-option v-for="season in seasons" :key="season" :value="season">{{ season }}</a-select-option></a-select>
      <a-select v-model:value="imageStyle" :options="imageStyleOptions" class="filter-select image-style-select" aria-label="图片风格" />
      <a-button v-if="hasFilters" type="text" class="clear-filters" @click="clearFilters">清除筛选</a-button>
    </div>
  </section>
  <div v-if="tags.length" class="search-tags" aria-label="已理解的搜索条件">
    <a-tag v-for="tag in tags" :key="tag.key" closable @close.prevent="closeTag(tag)">{{ tag.label }}</a-tag>
  </div>
  <a-alert v-if="searching && searchResult?.notice" type="info" :message="searchResult.notice" show-icon class="search-notice" />
  <a-alert v-if="error" type="error" :message="error" show-icon closable class="page-alert" />
  <GarmentCardSkeleton v-if="loading && !items.length" label="正在加载衣柜…" />
  <section v-else-if="items.length" class="garment-grid" aria-label="衣物列表" :aria-busy="loading">
    <div v-for="item in items" :key="item.id" class="search-hit">
      <GarmentCard :garment="item" />
      <p v-if="searching && searchResult?.reasons[item.id]?.length" class="search-reasons" :title="searchResult.reasons[item.id].join(' · ')">{{ searchResult.reasons[item.id].join(' · ') }}</p>
    </div>
    <button class="add-card" @click="router.push('/add')"><span class="add-card-icon"><PlusOutlined /></span><strong>添加衣物</strong><small>上传 → 处理 → 核对入柜</small></button>
  </section>
  <section v-else class="empty-wardrobe">
    <span class="empty-spark"><PlusOutlined /></span><p class="eyebrow">从一件衣服开始</p><h2>{{ hasFilters ? '没有找到这件衣物' : '你的衣柜还没有衣物' }}</h2><p>{{ hasFilters ? (searchResult?.emptyHint || '试试换一个关键词，或清除筛选条件。') : '上传单件衣物照片，处理后核对并确认，它就会出现在这里。' }}</p>
    <a-button v-if="hasFilters" class="outline-button" @click="clearFilters">清除筛选</a-button><button v-else class="outline-button" @click="router.push('/add')"><PlusOutlined /> 添加第一件衣物</button>
  </section>
  <footer v-if="total > pageSize" class="pagination-row"><span>第 {{ query.page }} / {{ pageCount }} 页</span><div><a-button :disabled="query.page <= 1 || loading" @click="query.page--; load()">上一页</a-button><a-button :disabled="query.page >= pageCount || loading" @click="query.page++; load()">下一页</a-button></div></footer>
</template>
