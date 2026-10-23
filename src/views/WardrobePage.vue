<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { App as AntApp } from 'ant-design-vue'
import { ExclamationCircleOutlined, SearchOutlined, SlidersOutlined, PlusOutlined, QuestionCircleOutlined, CheckSquareOutlined, ThunderboltOutlined, CameraOutlined, CloseOutlined, AppstoreAddOutlined, MoreOutlined } from '@ant-design/icons-vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { closetApi, type Garment, type ListQuery, type SearchResult } from '../services/api'
import { quickApi } from '../services/quickIntake'
import { loadPictureChecks, loadReviewCount, pictureChecks, reviewCount } from '../wardrobe/pictureChecks'
import { createUuid } from '../domain/id'
import { useClosetStore } from '../stores/closet'
import GarmentCard from '../components/GarmentCard.vue'
import FloatingPager from '../components/FloatingPager.vue'
import GarmentCardSkeleton from '../components/GarmentCardSkeleton.vue'
import PresetPicker from '../presets/PresetPicker.vue'
import PresetOnboarding from '../presets/PresetOnboarding.vue'
import { isProcessing } from '../domain/workflow'
import { DEFAULT_SORT, SORT_OPTIONS, readSort, saveSort, sortLabel } from '../wardrobe/sort'
import { readView, saveView } from '../wardrobe/viewMemory'
import pageLocale from 'ant-design-vue/es/vc-pagination/locale/zh_CN'
import { PAGE_SIZES, pageAfterSizeChange, readPageSize, savePageSize } from '../wardrobe/pageSize'
import { buildTags, combineQuery, imageModelNotice, removeWords, IMAGE_STYLE_LABELS, SEARCH_EXAMPLES, type SearchTag } from '../wardrobe/search'

const router = useRouter()
const closet = useClosetStore()
const query = reactive<ListQuery>({ status: 'ACTIVE', q: '', category: '', color: '', season: '', page: 1, size: readPageSize(), sort: readSort() })
const items = ref<Garment[]>([])
const total = ref(0)
const loading = ref(false)
// Phones: the five filters took four rows above the first garment; they now open from one button.
const filtersOpen = ref(false)
const error = ref('')
// Hybrid search (colour/category filters + keywords + local semantics) whenever there is text or an image-style choice.
const imageStyle = ref('')
// Issue #3: coming back from a garment restores the filters, page and scroll position (this tab only, 30 minutes).
// Applied before the filter watcher below exists, so restoring does not reset the page to 1.
const remembered = readView()
if (remembered) { Object.assign(query, { q: remembered.q, category: remembered.category, color: remembered.color, season: remembered.season, page: remembered.page }); imageStyle.value = remembered.imageStyle }
function rememberView() { saveView({ q: query.q, category: query.category, color: query.color, season: query.season, imageStyle: imageStyle.value, page: query.page, scrollY: Math.round(window.scrollY), ids: items.value.map(item => item.id) }) }
onBeforeRouteLeave(() => { rememberView() })
const searchResult = ref<SearchResult | null>(null)
// 超级搜索 (design 模型内存与图像向量 §9): a picture can join the words in the same box (camera button, paste or drop).
const queryImage = ref<File | null>(null)
const queryPreview = ref('')
const picker = ref<HTMLInputElement | null>(null)
const searching = computed(() => Boolean(query.q.trim() || imageStyle.value || queryImage.value))
const modelNotice = computed(() => imageModelNotice(searchResult.value?.imageModel, Boolean(queryImage.value)))
const pageSize = computed(() => searching.value ? 20 : query.size)
const showFloat = computed(() => !selecting.value && total.value > pageSize.value && items.value.length > 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const tags = computed(() => searching.value && searchResult.value ? buildTags(searchResult.value.parsed, searchResult.value.imageStyle) : [])
const hasFilters = computed(() => Boolean(query.q || query.category || query.color || query.season || imageStyle.value || queryImage.value))
const imageStyleOptions = [{ value: '', label: '图片风格：默认' }, ...Object.entries(IMAGE_STYLE_LABELS).filter(([k]) => k !== 'OTHER').map(([value, label]) => ({ value, label }))]
const options = ref<Record<string, string[]>>({})
const categories = computed(() => options.value.category || [])
const colors = computed(() => options.value.primaryColor || [])
const seasons = computed(() => options.value.seasons || [])
let searchTimer: number | undefined
const { modal, message } = AntApp.useApp()
const selecting = ref(false)
const selected = ref(new Set<string>())
const batchBusy = ref<'' | 'recognize' | 'reprocess' | 'enhance'>('')
const batchProgress = ref({ done: 0, total: 0 })
const batchResult = ref<{ type: 'success' | 'warning' | 'error'; message: string; description: string } | null>(null)
const allSelected = computed(() => items.value.length > 0 && items.value.every(item => selected.value.has(item.id)))
function toggle(id: string) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(items.value.map(item => item.id)) }
function exitSelecting() { selecting.value = false; selected.value = new Set() }
const batchLabels = { recognize: '重新识别资料', reprocess: '重新增强图片', enhance: 'AI 增强图片' } as const
type BatchMode = keyof typeof batchLabels
async function confirmBatch(mode: BatchMode) {
  const targets = items.value.filter(item => selected.value.has(item.id))
  const runnable = targets.filter(item => !isProcessing(item.taskStatus))
  if (!runnable.length) { batchResult.value = { type: 'warning', message: '没有可提交的衣物', description: '所选衣物都在处理中，请等当前任务结束后再试。' }; return }
  const unit = mode === 'reprocess' ? 2 : 1
  let quotaLine = ''
  try { const quota = await closetApi.quota(); const left = Math.max(0, quota.limit - quota.used); quotaLine = `今日剩余 ${left} 次。${left < runnable.length * unit ? '额度不够时，后面的衣物不会提交。' : ''}` } catch { quotaLine = '' }
  const skipped = targets.length - runnable.length
  modal.confirm({
    title: `${batchLabels[mode]}（${runnable.length} 件）？`,
    content: `${mode === 'recognize' ? '每件调用一次识别模型，使用 1 次 AI 额度。' : mode === 'enhance' ? '按快速入柜的增强规则重新整理图片（例如丝袜只保留袜子本身），每件使用 1 次 AI 额度；不是快速入柜的衣物会跳过。' : '每件分别调用识别和整理模型，使用 2 次 AI 额度。'}共需 ${runnable.length * unit} 次。${quotaLine}${skipped ? `另有 ${skipped} 件正在处理，将跳过。` : ''}已有人工修改和图片会保留。`,
    okText: '提交真实任务', cancelText: '取消',
    onOk: () => { void runBatch(mode, runnable, skipped) },
  })
}
// Issue #77: 'enhance' re-runs the quick-intake enhancement (its prompt carries rules such as tights without legs).
async function enhanceOne(item: Garment) {
  const { intakeId } = await quickApi.provenance(item.id)
  if (!intakeId) throw new Error('不是快速入柜的衣物，请在详情里重新处理')
  await quickApi.enhance(intakeId, createUuid(), '')
}
async function runBatch(mode: BatchMode, targets: Garment[], skipped: number) {
  batchBusy.value = mode; batchResult.value = null; batchProgress.value = { done: 0, total: targets.length }
  const failures: string[] = []; let submitted = 0, stoppedByQuota = 0
  for (const [index, item] of targets.entries()) {
    try { if (mode === 'enhance') await enhanceOne(item); else await closetApi[mode](item.id); submitted++ }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : '提交失败'
      if (message.includes('额度')) { stoppedByQuota = targets.length - index; break }
      failures.push(`${item.name || item.category[0] || '未命名衣物'}：${message}`)
    } finally { batchProgress.value = { done: index + 1, total: targets.length } }
  }
  const notes = [stoppedByQuota ? `额度不足，${stoppedByQuota} 件未提交。` : '', skipped ? `${skipped} 件处理中已跳过。` : '', ...failures].filter(Boolean)
  batchResult.value = { type: submitted === 0 ? 'error' : notes.length ? 'warning' : 'success', message: `${batchLabels[mode]}：已提交 ${submitted} / ${targets.length + skipped} 件，可在任务页查看进度。`, description: notes.join('\n') }
  batchBusy.value = ''
  if (submitted) { exitSelecting(); await Promise.all([load(), closet.refreshCounts()]) }
}

// Quick clicks on page numbers start several requests; only the newest one may fill the list.
let latestLoad = 0
async function load() {
  const mine = ++latestLoad
  loading.value = true
  error.value = ''
  try {
    if (queryImage.value) {
      const result = await closetApi.superSearch(queryImage.value, combineQuery(query.q, query.category, query.color, query.season), query.page)
      searchResult.value = result; items.value = result.items; total.value = result.total
    } else if (searching.value) {
      const result = await closetApi.search(combineQuery(query.q, query.category, query.color, query.season), query.page, imageStyle.value || undefined)
      searchResult.value = result; items.value = result.items; total.value = result.total
    } else {
      const page = await closetApi.list(query)
      searchResult.value = null; items.value = page.items; total.value = page.total
    }
  } catch (cause) { if (mine === latestLoad) error.value = cause instanceof Error ? cause.message : '衣柜暂时无法加载。' }
  finally { if (mine === latestLoad) loading.value = false }
}
// Paging: the old garments stay (dimmed) until the new page arrives, then the view returns to the top of the list.
const listTop = ref<HTMLElement | null>(null)
const narrow = ref(false)
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
function scrollToList() {
  const top = listTop.value; if (!top) return
  const gap = top.getBoundingClientRect().top
  // Sticky bars sit above the list; only scroll when the list start is not already comfortably in view.
  if (gap < 0 || gap > window.innerHeight * .6) window.scrollTo({ top: Math.max(0, window.scrollY + gap - 72), behavior: reduceMotion() ? 'instant' : 'smooth' })
}
async function goPage(page: number, size: number) {
  if (selecting.value && selected.value.size) selected.value = new Set()
  if (!searching.value && size !== query.size) { query.page = pageAfterSizeChange(query.page, query.size, size); query.size = size; savePageSize(size) }
  else query.page = page
  await load(); await nextTick(); scrollToList()
}
function stepPage(delta: number) { const page = query.page + delta; if (page >= 1 && page <= pageCount.value) void goPage(page, pageSize.value) }
// ← / → turn pages unless typing, a dialog is open or a modifier key is held.
function pageKeys(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"], .ant-select, .ant-slider, .ant-pagination-simple-pager')) return
  if (document.querySelector('.ant-modal-wrap, .ant-drawer-open, .ant-popover:not(.ant-popover-hidden)')) return
  stepPage(event.key === 'ArrowLeft' ? -1 : 1)
}
let narrowQuery: MediaQueryList | undefined
const onNarrow = () => { narrow.value = Boolean(narrowQuery?.matches) }
function debounceLoad() {
  window.clearTimeout(searchTimer)
  query.page = 1
  searchTimer = window.setTimeout(load, 220)
}
function attach(file: File | undefined | null) {
  if (!file) return
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { message.error('请选择 JPEG、PNG 或 WebP 图片。'); return }
  if (file.size > 15 * 1024 * 1024) { message.error('图片不能超过 15 MB。'); return }
  if (queryPreview.value) URL.revokeObjectURL(queryPreview.value)
  queryImage.value = file; queryPreview.value = URL.createObjectURL(file); query.page = 1; void load()
}
function detach() { if (queryPreview.value) URL.revokeObjectURL(queryPreview.value); queryImage.value = null; queryPreview.value = ''; debounceLoad() }
function picked(event: Event) { const input = event.target as HTMLInputElement; attach(input.files?.[0]); input.value = '' }
function pasted(event: ClipboardEvent) { const file = [...(event.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (file) { event.preventDefault(); attach(file) } }
function dropped(event: DragEvent) { const file = [...(event.dataTransfer?.files || [])].find(f => f.type.startsWith('image/')); if (file) attach(file) }
const helpOpen = ref(false)
function tryExample(example: string) { query.q = example; helpOpen.value = false; debounceLoad() }
function clearFilters() { query.q = ''; query.category = ''; query.color = ''; query.season = ''; imageStyle.value = ''; if (queryImage.value) detach(); else debounceLoad() }
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
onMounted(async () => {
  void loadPictureChecks(); void loadReviewCount()
  window.scrollTo({ top: 0, behavior: 'instant' })
  window.addEventListener('pagehide', rememberView); window.addEventListener('keydown', pageKeys)
  narrowQuery = window.matchMedia('(max-width: 767px)'); onNarrow(); narrowQuery.addEventListener('change', onNarrow)
  await Promise.all([load(), closet.refreshCounts(), closetApi.metadataOptions().then(values => { options.value = values }).catch(cause => { error.value = String(cause) })])
  // The remembered page may no longer exist (garments were removed meanwhile): fall back to the last page.
  if (remembered && !items.value.length && query.page > 1 && total.value > 0) { query.page = pageCount.value; await load() }
  if (remembered?.scrollY) { await nextTick(); window.scrollTo({ top: Math.min(remembered.scrollY, document.documentElement.scrollHeight), behavior: 'instant' }) }
})
onUnmounted(() => { window.removeEventListener('pagehide', rememberView); window.removeEventListener('keydown', pageKeys); narrowQuery?.removeEventListener('change', onNarrow); window.clearTimeout(searchTimer); if (queryPreview.value) URL.revokeObjectURL(queryPreview.value) })
// Choosing an order is remembered on this browser; searching ranks by relevance, so the order only applies when browsing.
function chooseSort(value: string) { query.sort = value; saveSort(value); query.page = 1; void load() }
watch(() => [query.category, query.color, query.season, imageStyle.value], debounceLoad)
// 从常见单品添加（预设衣物库设计 6.1）：勾选后复制进衣柜并标“预设”。
const presetsOpen = ref(false)
function presetsImported() { presetsOpen.value = false; void load() }
// 新用户引导：衣柜为空且本机没关过时弹出一次（预设衣物库设计 6.1）。
const ONBOARDING_KEY = 'yuda.preset-onboarding.v1'
const onboardingOpen = ref(false)
const onboardingSeen = () => { try { return localStorage.getItem(ONBOARDING_KEY) === 'done' } catch { return true } }
// 演示：地址带 ?guide=1 时手动打开引导，不要求衣柜为空，也不记录为已看过。
const route = useRoute()
const demoGuide = computed(() => route.query.guide === '1')
watch(demoGuide, on => { if (on) onboardingOpen.value = true }, { immediate: true })
watch([total, loading], ([count, busy]) => { if (!busy && count === 0 && !error.value && !hasFilters.value && !onboardingSeen()) onboardingOpen.value = true })
// 新手指引 (issue #81): asked once the first load settles, unless the preset picker took the screen; then it asks on close.
const guideAsked = ref(false)
watch(loading, busy => { if (busy || guideAsked.value) return; guideAsked.value = true; window.setTimeout(() => { if (!onboardingOpen.value) window.dispatchEvent(new CustomEvent('closet-guide-first-visit')) }, 800) })
function onboardingDone(imported: number) { window.setTimeout(() => window.dispatchEvent(new CustomEvent('closet-guide-first-visit')), 600); if (demoGuide.value) void router.replace({ query: { ...route.query, guide: undefined } }); else try { localStorage.setItem(ONBOARDING_KEY, 'done') } catch { /* private mode */ } if (imported) void load() }
// 底部添加菜单的“从常见单品挑”带 ?presets=1 进来：打开抽屉后去掉参数，返回时不重复打开。
watch(() => route.query.presets, value => { if (value !== '1') return; presetsOpen.value = true; void router.replace({ query: { ...route.query, presets: undefined } }) }, { immediate: true })
</script>

<template>
  <div class="page-heading wardrobe-heading">
    <div class="wardrobe-title"><h1>我的衣柜</h1><span class="wardrobe-count" :title="searching ? '搜索结果按相关度排序' : `按“${sortLabel(query.sort || DEFAULT_SORT)}”排序`"><strong>{{ total }}</strong>{{ searching ? ' 件符合' : ' 件' }}</span></div>
    <div v-if="!selecting" class="wardrobe-heading-side">
      <a-button class="wardrobe-wide-action" @click="presetsOpen = true"><AppstoreAddOutlined /> 从常见单品添加</a-button>
      <a-button v-if="reviewCount" class="wardrobe-wide-action" @click="router.push('/review')"><ExclamationCircleOutlined /> 待核对 {{ reviewCount }}</a-button>
      <a-button v-if="items.length" class="wardrobe-wide-action" @click="selecting = true; batchResult = null"><CheckSquareOutlined /> 批量处理</a-button>
      <a-dropdown :trigger="['click']" placement="bottomRight">
        <a-button class="wardrobe-more" type="text" aria-label="更多衣柜操作"><MoreOutlined /></a-button>
        <template #overlay><a-menu>
          <a-menu-item @click="presetsOpen = true"><AppstoreAddOutlined /> 从常见单品添加</a-menu-item>
          <a-menu-item @click="picker?.click()"><CameraOutlined /> 用图片搜</a-menu-item>
          <a-menu-item v-if="reviewCount" @click="router.push('/review')"><ExclamationCircleOutlined /> 待核对 {{ reviewCount }}</a-menu-item>
          <a-menu-item :disabled="!items.length" @click="selecting = true; batchResult = null"><CheckSquareOutlined /> 批量处理</a-menu-item>
        </a-menu></template>
      </a-dropdown>
    </div>
  </div>
  <section class="wardrobe-tools" aria-label="搜索和筛选衣物" @dragover.prevent @drop.prevent="dropped">
    <input ref="picker" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="picked" />
    <a-input v-model:value="query.q" class="search-input" allow-clear :placeholder="queryImage ? '可再加文字，例如：红色、上衣' : '搜颜色、品类、描述，或点相机用图片搜'" @input="debounceLoad" @paste="pasted"><template #prefix><SearchOutlined /><span v-if="queryPreview" class="query-image"><img :src="queryPreview" alt="用来搜索的图片" /><a-button type="text" size="small" class="query-image-remove" aria-label="去掉图片" @click="detach"><CloseOutlined /></a-button></span></template>
      <template #suffix>
        <a-tooltip title="用图片搜（也可以直接粘贴或拖入图片）"><a-button type="text" size="small" class="search-camera" aria-label="用图片搜" @click="picker?.click()"><CameraOutlined /></a-button></a-tooltip>
        <a-popover v-model:open="helpOpen" trigger="click" placement="bottomLeft" overlay-class-name="search-help">
          <template #content>
            <div class="search-help-body">
              <p><strong>可以这样搜</strong>：颜色和品类会精确筛选（问红色不会给粉色），风格词会按衣柜的风格标签筛选（“可爱”≈甜美，聊天里学会的新词也能用），其余描述按本机语义理解，没有就直说没有。</p>
              <p>默认只看衣柜里最多的图片风格，可在右侧“图片风格”切换。全部在本机计算，不消耗额度。</p>
              <p><strong>用图片搜</strong>：点相机、粘贴或拖入一张图（商品图、截图、别人的穿搭），找衣柜里像的；再加文字可以限定，例如“红色”“上衣”。装了本地图文模型时，文字描述也会直接和衣物图片比对（如“带小熊图案”）。</p>
              <div class="search-help-examples"><a-tag v-for="example in SEARCH_EXAMPLES" :key="example" class="search-help-example" @click="tryExample(example)">{{ example }}</a-tag></div>
            </div>
          </template>
          <a-button type="text" size="small" class="search-help-trigger" aria-label="搜索说明"><QuestionCircleOutlined /></a-button>
        </a-popover>
      </template>
    </a-input>
    <a-button v-if="total || hasFilters" class="filter-toggle" :class="{ active: filtersOpen || hasFilters }" @click="filtersOpen = !filtersOpen"><SlidersOutlined /> 筛选<span v-if="hasFilters" class="filter-dot"></span></a-button>
    <div v-if="total || hasFilters" class="filter-row" :class="{ open: filtersOpen }"><span class="filter-label"><SlidersOutlined /> 筛选</span>
      <a-select :value="query.category || undefined" @update:value="query.category = $event || ''" allow-clear placeholder="全部品类" class="filter-select"><a-select-option v-for="category in categories" :key="category" :value="category">{{ category }}</a-select-option></a-select>
      <a-select :value="query.color || undefined" @update:value="query.color = $event || ''" allow-clear placeholder="全部颜色" class="filter-select"><a-select-option v-for="color in colors" :key="color" :value="color">{{ color }}</a-select-option></a-select>
      <a-select :value="query.season || undefined" @update:value="query.season = $event || ''" allow-clear placeholder="全部季节" class="filter-select"><a-select-option v-for="season in seasons" :key="season" :value="season">{{ season }}</a-select-option></a-select>
      <a-select v-model:value="imageStyle" :options="imageStyleOptions" class="filter-select image-style-select" aria-label="图片风格" />
      <a-select :value="query.sort" :options="[...SORT_OPTIONS]" :disabled="searching" class="filter-select sort-select" aria-label="排序方式" @update:value="chooseSort($event as string)" />
      <a-button v-if="hasFilters" type="text" class="clear-filters" @click="clearFilters">清除筛选</a-button>
    </div>
  </section>
  <div v-if="tags.length" class="search-tags" aria-label="已理解的搜索条件">
    <a-tag v-for="tag in tags" :key="tag.key" closable @close.prevent="closeTag(tag)">{{ tag.label }}</a-tag>
  </div>
  <a-alert v-if="searching && searchResult?.notice" type="info" :message="searchResult.notice" show-icon class="search-notice" />
  <a-alert v-if="searching && modelNotice && modelNotice !== searchResult?.notice" type="warning" :message="modelNotice" show-icon class="search-notice" />
  <p v-if="queryImage && searchResult?.note" class="search-image-note">{{ searchResult.note }}</p>
  <section v-if="selecting" class="batch-bar" aria-label="批量处理">
    <a-checkbox :checked="allSelected" :indeterminate="selected.size > 0 && !allSelected" :disabled="Boolean(batchBusy)" @change="toggleAll">全选本页</a-checkbox>
    <span class="batch-count">已选 {{ selected.size }} 件</span>
    <a-tooltip v-if="selected.size" :trigger="['hover', 'focus', 'click']" title="AI 额度每天 0 点重置；处理中的衣物会自动跳过，额度不足时剩余衣物不提交。"><span class="batch-cost" tabindex="0"><ThunderboltOutlined /> 识别约 {{ selected.size }} 次 · 增强约 {{ selected.size * 2 }} 次</span></a-tooltip>
    <span v-if="batchBusy" class="batch-count">正在提交 {{ batchProgress.done }} / {{ batchProgress.total }}</span>
    <a-space wrap class="batch-actions">
      <span class="batch-mode">
        <a-button :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'recognize'" @click="confirmBatch('recognize')">重新识别资料</a-button>
        <a-tooltip :trigger="['hover', 'focus', 'click']" placement="bottom"><template #title><strong>重新识别资料</strong><br />用识别模型重新读取品类、颜色、季节、图案等资料。<br />不改动图片，已手动改过的字段会保留。<br />耗费：每件 1 次 AI 额度。</template><span class="batch-tip" tabindex="0" role="img" aria-label="重新识别资料说明"><QuestionCircleOutlined /></span></a-tooltip>
      </span>
      <span class="batch-mode">
        <a-button :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'enhance'" @click="confirmBatch('enhance')">AI 增强图片</a-button>
        <a-tooltip :trigger="['hover', 'focus', 'click']" placement="bottom"><template #title><strong>AI 增强图片</strong><br />按快速入柜的增强规则重新整理展示图：去掉残留背景、人物和腿部（丝袜、裤袜只保留袜子本身）。<br />原图和历史图片保留。只对快速入柜的衣物有效。<br />耗费：每件 1 次 AI 额度。</template><span class="batch-tip" tabindex="0" role="img" aria-label="AI 增强图片说明"><QuestionCircleOutlined /></span></a-tooltip>
      </span>
      <span class="batch-mode">
        <a-button type="primary" :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'reprocess'" @click="confirmBatch('reprocess')">重新增强图片</a-button>
        <a-tooltip :trigger="['hover', 'focus', 'click']" placement="bottom"><template #title><strong>重新增强图片</strong><br />先重新识别，再用生图模型把衣物摆正、减轻褶皱、去背景，生成新的展示图。<br />原图和历史图片保留，可在详情页切回。AI 生成可能含推测细节。<br />耗费：每件 2 次 AI 额度（识别 1 + 生图 1）。</template><span class="batch-tip" tabindex="0" role="img" aria-label="重新增强图片说明"><QuestionCircleOutlined /></span></a-tooltip>
      </span>
      <a-button :disabled="Boolean(batchBusy)" @click="exitSelecting">完成</a-button>
    </a-space>
  </section>
  <a-alert v-if="batchResult" :type="batchResult.type" :message="batchResult.message" :description="batchResult.description || undefined" show-icon closable class="page-alert batch-result" @close="batchResult = null"><template #action><a-button size="small" @click="router.push('/tasks')">查看任务</a-button></template></a-alert>
  <a-alert v-if="error" type="error" :message="error" show-icon closable class="page-alert" />
  <div ref="listTop" class="list-top"></div>
  <GarmentCardSkeleton v-if="loading && !items.length" label="正在加载衣柜…" />
  <section v-else-if="items.length" class="garment-grid" :class="{ 'has-float': showFloat }" aria-label="衣物列表" :aria-busy="loading">
    <div v-for="item in items" :key="item.id" class="search-hit">
      <GarmentCard :review="pictureChecks[item.id]?.message" :garment="item" :selectable="selecting" :selected="selected.has(item.id)" @toggle="toggle(item.id)" />
      <p v-if="searching && searchResult?.reasons[item.id]?.length" class="search-reasons" :title="searchResult.reasons[item.id].join(' · ')">{{ searchResult.reasons[item.id].join(' · ') }}</p>
    </div>
    <button v-if="!selecting" class="add-card" @click="router.push('/add')"><span class="add-card-icon"><PlusOutlined /></span><strong>添加衣物</strong><small>上传 → 处理 → 核对入柜</small></button>
  </section>
  <section v-else class="empty-wardrobe">
    <span class="empty-spark"><PlusOutlined /></span><p class="eyebrow">从一件衣服开始</p><h2>{{ hasFilters ? '没有找到这件衣物' : '你的衣柜还没有衣物' }}</h2><p>{{ hasFilters ? (searchResult?.emptyHint || '试试换一个关键词，或清除筛选条件。') : '上传单件衣物照片，处理后核对并确认，它就会出现在这里。' }}</p>
    <a-button v-if="hasFilters" class="outline-button" @click="clearFilters">清除筛选</a-button><button v-else class="outline-button" @click="router.push('/add')"><PlusOutlined /> 添加第一件衣物</button><a-button v-if="!hasFilters" type="link" @click="presetsOpen = true"><AppstoreAddOutlined /> 先从常见单品里挑几件</a-button>
  </section>
  <PresetOnboarding v-model:open="onboardingOpen" @done="onboardingDone" />
  <a-drawer v-model:open="presetsOpen" title="从常见单品添加" :width="narrow ? '100%' : 720" placement="right" destroy-on-close>
    <p class="muted">勾选你有类似的单品，加入后会标“预设”并参与推荐；之后随时可以在衣物详情里换成自己的照片。</p>
    <PresetPicker @imported="presetsImported" />
  </a-drawer>
  <FloatingPager v-if="showFloat" :label="`${query.page} / ${pageCount}`" :hint="narrow ? '' : `共 ${total} 件`" :has-previous="query.page > 1" :has-next="query.page < pageCount" previous-text="上一页" next-text="下一页" :busy="loading" @previous="stepPage(-1)" @next="stepPage(1)" />
  <footer v-if="items.length && (total > pageSize || (!searching && total > PAGE_SIZES[0]))" class="pager-bottom">
    <a-pagination :current="query.page" :page-size="pageSize" :total="total" :disabled="loading" :simple="narrow" :show-size-changer="!searching && !narrow"
      :locale="pageLocale" :page-size-options="PAGE_SIZES.map(String)" :show-quick-jumper="!narrow && pageCount > 7" :show-total="(count: number) => `共 ${count} 件`" @change="goPage" />
    <small class="pager-hint">可用键盘 ← → 翻页</small>
  </footer>
</template>

<style scoped>
.list-top{height:0;scroll-margin-top:72px}
.garment-grid.has-float{padding-bottom:8px}
.pager-bottom{display:flex;flex-direction:column;align-items:center;gap:8px;margin:28px 0 84px}
.pager-hint{color:var(--muted-copy);font-size:12px}
.garment-grid[aria-busy="true"]{opacity:.5;pointer-events:none;transition:opacity .15s}
@media(prefers-reduced-motion:reduce){.garment-grid[aria-busy="true"]{transition:none}}
@media(max-width:767px){.pager-hint{display:none}.pager-bottom{margin-bottom:56px}}
.wardrobe-heading{align-items:flex-end;margin-bottom:18px}
.wardrobe-title{display:flex;align-items:baseline;gap:12px;min-width:0}
.wardrobe-title h1{margin:0}
.wardrobe-count{flex:none;color:var(--muted-copy);font-size:13px;white-space:nowrap}
.wardrobe-count strong{color:var(--ink);font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}
.wardrobe-heading-side{display:flex;align-items:center;gap:10px}
.wardrobe-more{display:none}
.batch-bar{position:sticky;top:8px;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;margin-bottom:18px;padding:12px 16px;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);box-shadow:0 6px 18px #0000000f}
.batch-count{color:var(--muted)}
.batch-cost{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent-strong);font-size:12px;cursor:default}
.batch-mode{display:inline-flex;align-items:center;gap:4px}
.batch-tip{display:grid;place-items:center;width:22px;height:22px;color:var(--muted);cursor:help}
.batch-tip:hover,.batch-tip:focus-visible{color:var(--accent)}
.batch-actions{margin-left:auto}
.batch-result :deep(.ant-alert-description){white-space:pre-line}
.query-image{position:relative;display:inline-flex;margin-left:6px}
.query-image img{width:28px;height:28px;object-fit:cover;border-radius:6px;border:1px solid var(--line)}
.query-image-remove.ant-btn.ant-btn-text{position:absolute;top:-7px;right:-7px;display:grid;place-items:center;width:16px;min-width:16px;height:16px;padding:0;border-radius:50%;background:var(--ink);color:var(--canvas);font-size:9px;line-height:1}
.query-image-remove.ant-btn.ant-btn-text:hover{background:var(--ink);color:var(--canvas);opacity:.85}
.search-camera.ant-btn{color:var(--muted-strong)}
.search-image-note{margin:-8px 2px 16px;font-size:12px;color:var(--muted-copy)}
.filter-toggle{display:none}
.filter-dot{display:inline-block;width:6px;height:6px;margin-left:4px;border-radius:50%;background:var(--accent);vertical-align:middle}
@media(max-width:767px){.wardrobe-heading.page-heading{flex-direction:row;align-items:center;justify-content:space-between;margin:2px 0 12px}.wardrobe-title h1{font-size:22px}.wardrobe-count strong{font-size:16px}.wardrobe-wide-action{display:none!important}.wardrobe-more{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;font-size:18px}.wardrobe-heading .wardrobe-heading-side{display:flex!important}.wardrobe-tools{flex-direction:row;flex-wrap:wrap;gap:8px;margin-bottom:14px}.wardrobe-tools .search-input{flex:1;min-width:0}.filter-toggle{display:inline-flex;align-items:center;gap:4px;height:auto}.filter-toggle.active{border-color:var(--ink)}.filter-row{display:none!important}.filter-row.open{display:flex!important;flex-wrap:wrap;width:100%;padding:10px;border-radius:var(--radius-md);background:var(--surface-alt)}.filter-row.open .filter-select{flex:1 1 calc(50% - 8px);width:auto}.search-image-note{margin-top:-4px}.batch-actions{margin-left:0;width:100%}}
</style>
