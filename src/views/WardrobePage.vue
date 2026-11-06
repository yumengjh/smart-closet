<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { App as AntApp } from 'ant-design-vue'
import { ExclamationCircleOutlined, SearchOutlined, SlidersOutlined, PlusOutlined, QuestionCircleOutlined, CheckSquareOutlined, CameraOutlined, CloseOutlined, AppstoreAddOutlined, MoreOutlined, SwapOutlined } from '@ant-design/icons-vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { closetApi, type Garment, type ListQuery, type SearchResult } from '../services/api'
import { quickApi } from '../services/quickIntake'
import { loadPictureChecks, loadReviewCount, pictureChecks, reviewCount } from '../wardrobe/pictureChecks'
import { createUuid } from '../domain/id'
import { useClosetStore } from '../stores/closet'
import { useProcessingStore } from '../stores/processing'
import GarmentCard from '../components/GarmentCard.vue'
import WardrobeRack from '../wardrobe/WardrobeRack.vue'
import FloatingPager from '../components/FloatingPager.vue'
import GarmentCardSkeleton from '../components/GarmentCardSkeleton.vue'
import PresetPicker from '../presets/PresetPicker.vue'
import PresetOnboarding from '../presets/PresetOnboarding.vue'
import { isProcessing } from '../domain/workflow'
import { DEFAULT_SORT, SORT_OPTIONS, readSort, saveSort, sortLabel } from '../wardrobe/sort'
import { readView, saveView } from '../wardrobe/viewMemory'
import pageLocale from 'ant-design-vue/es/vc-pagination/locale/zh_CN'
import { PAGE_SIZES, pageAfterSizeChange, readPageSize, savePageSize } from '../wardrobe/pageSize'
import { listStatus, loadWantedLabel, readOwnership, saveOwnership, wantedLabel, type Ownership } from '../wardrobe/wanted'
import { buildTags, combineQuery, imageModelNotice, removeWords, IMAGE_STYLE_LABELS, SEARCH_EXAMPLES, type SearchTag } from '../wardrobe/search'

const router = useRouter()
const closet = useClosetStore()
const processing = useProcessingStore()
// 全部 / 已拥有 / 种草（#197），本机记住；种草是网上看中、还没买的衣服。
const ownership = ref<Ownership>(readOwnership())
const wantedTotal = ref(0)
const wantedCountKnown = ref(true)
const query = reactive<ListQuery>({ status: listStatus(ownership.value), q: '', category: '', color: '', season: '', page: 1, size: readPageSize(), sort: readSort() })
// The three dropdowns take several values: words of one kind are "or" ("裤子 裙子"), different kinds are "and". query.category/color/season
// hold the value only when exactly one is chosen (the plain list API); several values go through the search, like typed words.
const sel = reactive({ category: [] as string[], color: [] as string[], season: [] as string[] })
const chosen = () => [...sel.category, ...sel.color, ...sel.season]
const multiFilter = computed(() => sel.category.length > 1 || sel.color.length > 1 || sel.season.length > 1)
function syncSingle() { query.category = sel.category.length === 1 ? sel.category[0] : ''; query.color = sel.color.length === 1 ? sel.color[0] : ''; query.season = sel.season.length === 1 ? sel.season[0] : '' }
const splitList = (value: string) => value ? value.split('|').filter(Boolean) : []
const items = ref<Garment[]>([])
// 衣架 / 平铺（清新改版 §4），本机记住。衣架只用于浏览：搜索（按相关度排）与批量勾选时回到平铺。
const LAYOUT_KEY = 'yuda.wardrobe-layout.v1'
const layout = ref<'rack' | 'grid'>((() => { try { return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'rack' } catch { return 'rack' } })())
function chooseLayout(value: 'rack' | 'grid') { layout.value = value; try { localStorage.setItem(LAYOUT_KEY, value) } catch { /* storage blocked */ } }
// 衣架松紧（清新改版 §4.4）：0 叠放 … 100 散开，本机记住。触屏没有悬停展开，默认半散开；能悬停的设备默认叠放。
const SPREAD_KEY = 'yuda.rack-spread.v1'
const touchOnly = window.matchMedia('(hover: none)').matches
const spread = ref((() => { try { const saved = Number(localStorage.getItem(SPREAD_KEY)); return localStorage.getItem(SPREAD_KEY) !== null && Number.isFinite(saved) ? Math.max(0, Math.min(100, saved)) : touchOnly ? 45 : 0 } catch { return touchOnly ? 45 : 0 } })())
function chooseSpread(value: number | [number, number]) { spread.value = Array.isArray(value) ? value[0] : value; try { localStorage.setItem(SPREAD_KEY, String(spread.value)) } catch { /* storage blocked */ } }
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
if (remembered) { Object.assign(query, { q: remembered.q, page: remembered.page }); sel.category = splitList(remembered.category); sel.color = splitList(remembered.color); sel.season = splitList(remembered.season); syncSingle(); imageStyle.value = remembered.imageStyle }
function rememberView() { saveView({ q: query.q, category: sel.category.join('|'), color: sel.color.join('|'), season: sel.season.join('|'), imageStyle: imageStyle.value, page: query.page, scrollY: Math.round(window.scrollY), ids: items.value.map(item => item.id) }) }
onBeforeRouteLeave(() => { rememberView() })
const searchResult = ref<SearchResult | null>(null)
// 超级搜索 (design 模型内存与图像向量 §9): a picture can join the words in the same box (camera button, paste or drop).
const queryImage = ref<File | null>(null)
const queryPreview = ref('')
const picker = ref<HTMLInputElement | null>(null)
const searching = computed(() => Boolean(query.q.trim() || imageStyle.value || queryImage.value || multiFilter.value))
const modelNotice = computed(() => imageModelNotice(searchResult.value?.imageModel, Boolean(queryImage.value)))
const pageSize = computed(() => searching.value ? 20 : query.size)
const showFloat = computed(() => !selecting.value && total.value > pageSize.value && items.value.length > 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const tags = computed(() => searching.value && searchResult.value ? buildTags(searchResult.value.parsed, searchResult.value.imageStyle) : [])
const hasFilters = computed(() => Boolean(query.q || chosen().length || imageStyle.value || queryImage.value))
// Chosen filters shown as soft tags under the toolbar; the 筛选 chip counts them.
type ChosenTag = { key: string; label: string; kind: 'category' | 'color' | 'season' | 'style'; value: string }
const chosenTags = computed<ChosenTag[]>(() => [
  ...sel.category.map(value => ({ key: `c:${value}`, label: value, kind: 'category' as const, value })),
  ...sel.color.map(value => ({ key: `o:${value}`, label: value, kind: 'color' as const, value })),
  ...sel.season.map(value => ({ key: `s:${value}`, label: value, kind: 'season' as const, value })),
  ...(imageStyle.value ? [{ key: 'style', label: imageStyleOptions.find(option => option.value === imageStyle.value)?.label || imageStyle.value, kind: 'style' as const, value: imageStyle.value }] : []),
])
const filterCount = computed(() => chosenTags.value.length)
function removeChosen(tag: ChosenTag) {
  if (tag.kind === 'style') imageStyle.value = ''
  else sel[tag.kind] = sel[tag.kind].filter(value => value !== tag.value)
}
const imageStyleOptions = [{ value: '', label: '图片风格：默认' }, ...Object.entries(IMAGE_STYLE_LABELS).filter(([k]) => k !== 'OTHER').map(([value, label]) => ({ value, label }))]
const options = ref<Record<string, string[]>>({})
const categories = computed(() => options.value.category || [])
const colors = computed(() => options.value.primaryColor || [])
const seasons = computed(() => options.value.seasons || [])
let searchTimer: number | undefined
const { modal, message } = AntApp.useApp()
const selecting = ref(false)
const rackView = computed(() => layout.value === 'rack' && !selecting.value && !searching.value)
// While choosing garments the bottom dock steps aside for the floating batch bar (dock.css html.closet-selecting).
watch(selecting, on => document.documentElement.classList.toggle('closet-selecting', on))
onUnmounted(() => document.documentElement.classList.remove('closet-selecting'))
// Selected garments are kept by id (with the garment itself) across pages, so a batch can span the whole result.
const selected = ref(new Map<string, Garment>())
const gathering = ref(false)
const batchBusy = ref<'' | 'recognize' | 'reprocess' | 'enhance'>('')
const batchProgress = ref({ done: 0, total: 0 })
const batchResult = ref<{ type: 'success' | 'warning' | 'error'; message: string; description: string } | null>(null)
/** One batch is capped so a mistaken "select all" cannot spend a whole day's quota. */
const MAX_BATCH = 300
const pageAllSelected = computed(() => items.value.length > 0 && items.value.every(item => selected.value.has(item.id)))
const otherPages = computed(() => selected.value.size - items.value.filter(item => selected.value.has(item.id)).length)
const everythingSelected = computed(() => total.value > 0 && selected.value.size >= Math.min(total.value, MAX_BATCH))
function toggle(item: Garment) { const next = new Map(selected.value); if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item); selected.value = next }
function togglePage() { const next = new Map(selected.value); if (pageAllSelected.value) for (const item of items.value) next.delete(item.id); else for (const item of items.value) next.set(item.id, item); selected.value = next }
function exitSelecting() { selecting.value = false; selected.value = new Map() }
/** Every garment matching the current search/filters, from all pages (the ones on screen are already known). */
async function selectEverything() {
  if (gathering.value || !total.value) return
  gathering.value = true
  try {
    const next = new Map(selected.value)
    for (const item of items.value) next.set(item.id, item)
    const pages = Math.ceil(total.value / pageSize.value)
    for (let page = 1; page <= pages && next.size < MAX_BATCH; page++) {
      if (page === query.page) continue
      for (const item of (await fetchPage(page)).items) { if (next.size >= MAX_BATCH) break; next.set(item.id, item) }
    }
    selected.value = next
    if (total.value > MAX_BATCH) message.info(`一次最多处理 ${MAX_BATCH} 件，已选前 ${MAX_BATCH} 件，处理完再选下一批。`)
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '读取全部结果失败，请重试。') }
  finally { gathering.value = false }
}
const batchLabels = { recognize: '重新识别资料', reprocess: '重新增强图片', enhance: 'AI 增强图片' } as const
type BatchMode = keyof typeof batchLabels
async function confirmBatch(mode: BatchMode) {
  const targets = [...selected.value.values()]
  const runnable = targets.filter(item => !isProcessing(item.taskStatus))
  if (!runnable.length) { batchResult.value = { type: 'warning', message: '没有可提交的衣物', description: '所选衣物都在处理中，请等当前任务结束后再试。' }; return }
  const unit = mode === 'reprocess' ? 2 : 1
  let quotaLine = ''
  try { const quota = await closetApi.quota(); const left = Math.max(0, quota.limit - quota.used); quotaLine = `今日剩余 ${left} 次。${left < runnable.length * unit ? '额度不够时，后面的衣物不会提交。' : ''}` } catch { quotaLine = '' }
  const skipped = targets.length - runnable.length
  modal.confirm({
    title: `${batchLabels[mode]}（${runnable.length} 件）？`,
    content: `${mode === 'recognize' ? '每件调用一次识别模型，使用 1 次 AI 额度。' : mode === 'enhance' ? '按快速入柜的增强规则重新整理图片（例如丝袜只保留袜子本身），每件使用 1 次 AI 额度；不是快速入柜的衣物会跳过。' : '每件分别调用识别和整理模型，使用 2 次 AI 额度。'}共需 ${runnable.length * unit} 次。${quotaLine}${mode === 'recognize' ? '提交后由服务器逐件处理，可以关闭页面，进度在右上角的处理中心。' : '提交过程中请保持页面打开。'}${skipped ? `另有 ${skipped} 件正在处理，将跳过。` : ''}已有人工修改和图片会保留。`,
    okText: '提交真实任务', cancelText: '取消',
    onOk: () => { void (mode === 'recognize' ? runServerBatch(runnable, skipped) : runBatch(mode, runnable, skipped)) },
  })
}
// Issue #77: 'enhance' re-runs the quick-intake enhancement (its prompt carries rules such as tights without legs).
async function enhanceOne(item: Garment) {
  const { intakeId } = await quickApi.provenance(item.id)
  if (!intakeId) throw new Error('不是快速入柜的衣物，请在详情里重新处理')
  await quickApi.enhance(intakeId, createUuid(), '')
}
/** Re-recognition: the server takes the whole list and submits it itself; progress is one entry in the processing centre. */
async function runServerBatch(targets: Garment[], skipped: number) {
  batchBusy.value = 'recognize'; batchResult.value = null
  try {
    const batch = await closetApi.batchRecognize(targets.map(item => item.id))
    processing.trackBulk(batch, true)
    batchResult.value = { type: 'success', message: `重新识别资料：已交给服务器处理 ${targets.length} 件，可以关闭页面。`, description: [skipped ? `${skipped} 件处理中已跳过。` : '', '进度在右上角的处理中心，每件的结果可在任务页查看。'].filter(Boolean).join('\n') }
    exitSelecting(); await Promise.all([load(), closet.refreshCounts()])
  } catch (cause) {
    batchResult.value = { type: 'error', message: '重新识别资料：提交失败', description: cause instanceof Error ? cause.message : '请稍后重试。' }
  } finally { batchBusy.value = '' }
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
/** One page of the current view (browse, words/filters, or picture search) without touching the screen state. */
async function fetchPage(page: number): Promise<{ items: Garment[]; total: number; search: SearchResult | null }> {
  const words = combineQuery(query.q, ...chosen())
  if (queryImage.value) { const result = await closetApi.superSearch(queryImage.value, words, page, ownership.value); return { items: result.items, total: result.total, search: result } }
  if (searching.value) { const result = await closetApi.search(words, page, imageStyle.value || undefined, ownership.value); return { items: result.items, total: result.total, search: result } }
  const result = await closetApi.list({ ...query, page })
  return { items: result.items, total: result.total, search: null }
}
let backgroundFrame = 0, backgroundTimer = 0, backgroundStarted = false, unmounted = false
function cancelBackground() { window.cancelAnimationFrame(backgroundFrame); window.clearTimeout(backgroundTimer) }
function loadBackground(mine: number) {
  cancelBackground()
  // A frame can show the new garments before notices, metadata and task discovery start.
  backgroundFrame = window.requestAnimationFrame(() => {
    backgroundTimer = window.setTimeout(() => {
      if (unmounted || mine !== latestLoad) return
      if (!backgroundStarted) {
        backgroundStarted = true
        void loadPictureChecks(); void loadReviewCount(); void loadWantedLabel()
        void closet.refreshCounts()
        void closetApi.metadataOptions().then(values => { if (!unmounted) options.value = values }).catch(() => { /* Filters can still use the current selection. */ })
        processing.resumeDiscovery()
      }
      if (ownership.value === 'ALL' && !searching.value) {
        void closetApi.list({ status: 'WANTED', q: '', category: '', color: '', season: '', page: 1, size: 1 })
          .then(page => { if (!unmounted && mine === latestLoad) { wantedTotal.value = page.total; wantedCountKnown.value = true } }).catch(() => { /* Keep the count until the next successful refresh. */ })
      }
    }, 0)
  })
}
async function load() {
  const mine = ++latestLoad
  cancelBackground()
  loading.value = true
  error.value = ''
  try {
    const result = await fetchPage(query.page)
    if (mine !== latestLoad || unmounted) return
    wantedTotal.value = ownership.value === 'WANTED' ? -1 : 0
    wantedCountKnown.value = ownership.value !== 'ALL' || searching.value
    searchResult.value = result.search; items.value = result.items; total.value = result.total
  } catch (cause) { if (mine === latestLoad) error.value = cause instanceof Error ? cause.message : '衣柜暂时无法加载。' }
  finally { if (mine === latestLoad && !unmounted) { loading.value = false; loadBackground(mine) } }
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
  if (document.querySelector('.ant-modal-wrap, .ant-drawer-open, .ant-popover:not(.ant-popover-hidden), .garment-quick')) return
  stepPage(event.key === 'ArrowLeft' ? -1 : 1)
}
let narrowQuery: MediaQueryList | undefined
const onNarrow = () => { narrow.value = Boolean(narrowQuery?.matches) }
function chooseOwnership(value: Ownership) { ownership.value = value; saveOwnership(value); query.status = listStatus(value); query.page = 1; void load() }
const ownershipOptions = computed(() => [{ value: 'ALL', label: '全部' }, { value: 'OWNED', label: '已拥有' }, { value: 'WANTED', label: wantedLabel.value }])
// Title count: owned garments only; 种草 shown apart (wantedTotal = -1 while only 种草 are listed).
const ownedTotal = computed(() => !wantedCountKnown.value ? '—' : wantedTotal.value > 0 ? total.value - wantedTotal.value : total.value)
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
function clearFilters() { query.q = ''; sel.category = []; sel.color = []; sel.season = []; syncSingle(); imageStyle.value = ''; if (queryImage.value) detach(); else debounceLoad() }
function closeTag(tag: SearchTag) {
  // A style typed in the box ("卡通的") is removed from the text; the closet default is turned off by choosing "全部风格".
  if (tag.imageStyle) { if (tag.words.some(w => query.q.includes(w))) query.q = removeWords(query.q, tag.words); else imageStyle.value = 'ALL' }
  else {
    query.q = removeWords(query.q, tag.words)
    sel.category = sel.category.filter(c => !tag.words.includes(c))
    sel.color = sel.color.filter(c => !tag.words.some(w => w && c.startsWith(w)))
    sel.season = sel.season.filter(c => !tag.words.includes(c))
    syncSingle()
  }
  debounceLoad()
}
onMounted(async () => {
  window.scrollTo({ top: 0, behavior: 'instant' })
  window.addEventListener('pagehide', rememberView); window.addEventListener('keydown', pageKeys)
  narrowQuery = window.matchMedia('(max-width: 767px)'); onNarrow(); narrowQuery.addEventListener('change', onNarrow)
  await load()
  if (unmounted) return
  // The remembered page may no longer exist (garments were removed meanwhile): fall back to the last page.
  if (remembered && !items.value.length && query.page > 1 && total.value > 0) { query.page = pageCount.value; await load() }
  if (unmounted) return
  if (remembered?.scrollY) { await nextTick(); window.scrollTo({ top: Math.min(remembered.scrollY, document.documentElement.scrollHeight), behavior: 'instant' }) }
})
onUnmounted(() => { unmounted = true; latestLoad++; cancelBackground(); window.removeEventListener('pagehide', rememberView); window.removeEventListener('keydown', pageKeys); narrowQuery?.removeEventListener('change', onNarrow); window.clearTimeout(searchTimer); if (queryPreview.value) URL.revokeObjectURL(queryPreview.value) })
// Choosing an order is remembered on this browser; searching ranks by relevance, so the order only applies when browsing.
function pickSort(info: { key: string | number }) { chooseSort(String(info.key)) }
function chooseSort(value: string) { query.sort = value; saveSort(value); query.page = 1; void load() }
watch(() => [sel.category.join('|'), sel.color.join('|'), sel.season.join('|'), imageStyle.value], () => { syncSingle(); debounceLoad() })
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
watch([total, loading], ([count, busy]) => { if (!busy && count === 0 && !error.value && !hasFilters.value && ownership.value === 'ALL' && !onboardingSeen()) onboardingOpen.value = true })
// 新手指引 (issue #81): asked once the first load settles, unless the preset picker took the screen; then it asks on close.
const guideAsked = ref(false)
watch(loading, busy => { if (busy || guideAsked.value) return; guideAsked.value = true; window.setTimeout(() => { if (!onboardingOpen.value) window.dispatchEvent(new CustomEvent('closet-guide-first-visit')) }, 800) })
function onboardingDone(imported: number) { window.setTimeout(() => window.dispatchEvent(new CustomEvent('closet-guide-first-visit')), 600); if (demoGuide.value) void router.replace({ query: { ...route.query, guide: undefined } }); else try { localStorage.setItem(ONBOARDING_KEY, 'done') } catch { /* private mode */ } if (imported) void load() }
// 底部添加菜单的“从常见单品挑”带 ?presets=1 进来：打开抽屉后去掉参数，返回时不重复打开。
watch(() => route.query.presets, value => { if (value !== '1') return; presetsOpen.value = true; void router.replace({ query: { ...route.query, presets: undefined } }) }, { immediate: true })
</script>

<template>
  <!-- 标题和件数放到顶栏 logo 旁边（清新改版 §4.1）；页面里留一个只给读屏用的 h1。 -->
  <Teleport defer to="#topbar-page">
    <span class="closet-title" :title="searching ? '搜索结果按相关度排序' : `按“${sortLabel(query.sort || DEFAULT_SORT)}”排序`"><b>我的衣柜</b><em>{{ searching || wantedTotal < 0 ? total : ownedTotal }}</em><small>{{ searching ? '件符合' : wantedTotal < 0 ? `件${wantedLabel}` : '件' }}</small><small v-if="!searching && wantedTotal > 0" class="closet-title-wanted">· {{ wantedLabel }} {{ wantedTotal }}</small></span>
  </Teleport>
  <h1 class="closet-h1">我的衣柜</h1>
  <section class="closet-toolbar" aria-label="搜索和筛选衣物" @dragover.prevent @drop.prevent="dropped">
    <input ref="picker" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="picked" />
    <a-input v-model:value="query.q" class="closet-search" allow-clear :placeholder="queryImage ? '可再加文字，例如：红色、上衣' : '搜颜色、品类、描述…'" @input="debounceLoad" @paste="pasted"><template #prefix><SearchOutlined /><span v-if="queryPreview" class="query-image"><img :src="queryPreview" alt="用来搜索的图片" /><a-button type="text" size="small" class="query-image-remove" aria-label="去掉图片" @click="detach"><CloseOutlined /></a-button></span></template>
      <template #suffix>
        <a-tooltip title="用图片搜（也可以直接粘贴或拖入图片）"><a-button type="text" size="small" class="search-camera" aria-label="用图片搜" @click="picker?.click()"><CameraOutlined /></a-button></a-tooltip>
        <a-popover v-model:open="helpOpen" trigger="click" placement="bottomLeft" overlay-class-name="search-help">
          <template #content>
            <div class="search-help-body">
              <p><strong>可以这样搜</strong>：颜色和品类会精确筛选（问红色不会给粉色），风格词会按衣柜的风格标签筛选（“可爱”≈甜美，聊天里学会的新词也能用），其余描述按本机语义理解，没有就直说没有。</p>
              <p><strong>多个条件</strong>：同一类的词是“或”，不同类之间是“且”。“裤子 裙子”是裤子或裙子，“黑色 白色 外套”是黑色或白色的外套；筛选里的品类、颜色、季节也可以多选。</p>
              <p>默认只看衣柜里最多的图片风格，可在筛选的“图片风格”切换。全部在本机计算，不消耗额度。</p>
              <p><strong>用图片搜</strong>：点相机、粘贴或拖入一张图（商品图、截图、别人的穿搭），找衣柜里像的；再加文字可以限定，例如“红色”“上衣”。装了本地图文模型时，文字描述也会直接和衣物图片比对（如“带小熊图案”）。</p>
              <div class="search-help-examples"><a-tag v-for="example in SEARCH_EXAMPLES" :key="example" class="search-help-example" @click="tryExample(example)">{{ example }}</a-tag></div>
            </div>
          </template>
          <a-button type="text" size="small" class="search-help-trigger" aria-label="搜索说明"><QuestionCircleOutlined /></a-button>
        </a-popover>
      </template>
    </a-input>
    <template v-if="total || hasFilters">
      <a-popover v-model:open="filtersOpen" trigger="click" placement="bottomLeft" overlay-class-name="closet-filter-pop" :arrow="false">
        <template #content>
          <div class="closet-filter-panel">
            <label>品类</label><a-select v-model:value="sel.category" mode="multiple" :max-tag-count="2" allow-clear placeholder="全部品类" :options="categories.map(value => ({ value, label: value }))" aria-label="品类，可多选" />
            <label>颜色</label><a-select v-model:value="sel.color" mode="multiple" :max-tag-count="2" allow-clear placeholder="全部颜色" :options="colors.map(value => ({ value, label: value }))" aria-label="颜色，可多选" />
            <label>季节</label><a-select v-model:value="sel.season" mode="multiple" :max-tag-count="2" allow-clear placeholder="全部季节" :options="seasons.map(value => ({ value, label: value }))" aria-label="季节，可多选" />
            <label>图片风格</label><a-select v-model:value="imageStyle" :options="imageStyleOptions" aria-label="图片风格" />
            <footer><a-button type="text" :disabled="!hasFilters" @click="clearFilters">全部清除</a-button><a-button type="primary" @click="filtersOpen = false">好了</a-button></footer>
          </div>
        </template>
        <a-button class="closet-chip" :class="{ on: filterCount }"><SlidersOutlined /><em class="closet-chip-text">筛选</em><b v-if="filterCount" class="closet-chip-count">{{ filterCount }}</b></a-button>
      </a-popover>
      <a-dropdown :trigger="['click']" :disabled="searching">
        <a-button class="closet-chip" :disabled="searching" :title="searching ? '搜索时按相关度排序' : '排序方式'"><SwapOutlined class="closet-sort-icon" /><em class="closet-chip-text">{{ searching ? '相关度' : sortLabel(query.sort || DEFAULT_SORT) }}</em></a-button>
        <template #overlay><a-menu :selected-keys="[query.sort || DEFAULT_SORT]" @click="pickSort"><a-menu-item v-for="option in SORT_OPTIONS" :key="option.value">{{ option.label }}</a-menu-item></a-menu></template>
      </a-dropdown>
    </template>
    <span class="closet-toolbar-gap"></span>
    <span class="closet-break" aria-hidden="true"></span>
    <a-segmented v-if="total || hasFilters || ownership !== 'ALL'" class="closet-ownership" :value="ownership" :options="ownershipOptions" :aria-label="`显示全部、已拥有或${wantedLabel}的衣物`" @change="chooseOwnership($event as Ownership)" />
    <a-button v-if="reviewCount" class="closet-chip warn" @click="router.push('/review')"><ExclamationCircleOutlined />待核对 {{ reviewCount }}</a-button>
    <a-segmented v-if="items.length && !selecting && !searching" class="closet-layout" :value="layout" :options="[{ value: 'rack', label: '衣架' }, { value: 'grid', label: '平铺' }]" aria-label="衣柜展示方式" @change="chooseLayout($event as 'rack' | 'grid')" />
    <div v-if="items.length && rackView" class="closet-spread" role="group" aria-label="衣架松紧">
      <svg class="closet-spread-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="9" height="14" rx="2" /><rect x="8" y="5" width="9" height="14" rx="2" /><rect x="11" y="5" width="9" height="14" rx="2" /></svg>
      <a-slider class="closet-spread-slider" :value="spread" :min="0" :max="100" :step="1" :tooltip-open="false" aria-label="衣架松紧：左边叠放，右边散开" @change="chooseSpread" />
      <svg class="closet-spread-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="6" width="6" height="12" rx="1.5" /><rect x="9" y="6" width="6" height="12" rx="1.5" /><rect x="16.5" y="6" width="6" height="12" rx="1.5" /></svg>
    </div>
    <a-tooltip title="从常见单品添加：勾选你有类似的，直接放进衣柜"><a-button class="closet-soft" @click="presetsOpen = true"><AppstoreAddOutlined /><em>常见单品</em></a-button></a-tooltip>
    <a-dropdown :trigger="['click']" placement="bottomRight">
      <a-button class="closet-round" type="text" aria-label="更多衣柜操作"><MoreOutlined /><i v-if="reviewCount" class="closet-round-dot" aria-hidden="true"></i></a-button>
      <template #overlay><a-menu>
        <a-menu-item @click="picker?.click()"><CameraOutlined /> 用图片搜</a-menu-item>
        <a-menu-item :disabled="!items.length" @click="selecting = true; batchResult = null"><CheckSquareOutlined /> 批量处理</a-menu-item>
        <a-menu-item @click="presetsOpen = true"><AppstoreAddOutlined /> 从常见单品添加</a-menu-item>
        <a-menu-item v-if="reviewCount" @click="router.push('/review')"><ExclamationCircleOutlined /> 待核对 {{ reviewCount }} 件</a-menu-item>
      </a-menu></template>
    </a-dropdown>
  </section>
  <div v-if="chosenTags.length" class="closet-chosen" aria-label="已选筛选">
    <a-tag v-for="tag in chosenTags" :key="tag.key" closable class="closet-chosen-tag" @close.prevent="removeChosen(tag)">{{ tag.label }}</a-tag>
    <a-button type="link" size="small" @click="clearFilters">清除</a-button>
  </div>
  <div v-if="tags.length" class="search-tags" aria-label="已理解的搜索条件">
    <a-tag v-for="tag in tags" :key="tag.key" closable @close.prevent="closeTag(tag)">{{ tag.label }}</a-tag>
  </div>
  <a-alert v-if="searching && searchResult?.notice" type="info" :message="searchResult.notice" show-icon class="search-notice" />
  <a-alert v-if="searching && modelNotice && modelNotice !== searchResult?.notice" type="warning" :message="modelNotice" show-icon class="search-notice" />
  <p v-if="queryImage && searchResult?.note" class="search-image-note">{{ searchResult.note }}</p>
  <p v-if="selecting" class="batch-hint">点衣物勾选，或在下方全选；选好后选择处理方式。</p>
  <!-- 批量处理（清新改版 §4.3）：底部悬浮条，替代页面顶部的长工具栏；进入时导航胶囊让位。 -->
  <Teleport to="body">
    <Transition name="batch-float">
      <section v-if="selecting" class="batch-float" aria-label="批量处理">
        <div class="batch-float-count"><b>{{ selected.size }}</b><span>件已选<small v-if="otherPages > 0">（{{ otherPages }} 件在其他页）</small><small v-if="batchBusy">正在提交 {{ batchProgress.done }} / {{ batchProgress.total }}</small></span></div>
        <div class="batch-float-pick">
          <a-checkbox :checked="pageAllSelected" :indeterminate="selected.size > 0 && !pageAllSelected" :disabled="Boolean(batchBusy)" @change="togglePage">本页全选</a-checkbox>
          <a-button v-if="total > items.length && !everythingSelected" type="link" size="small" :loading="gathering" :disabled="Boolean(batchBusy)" @click="selectEverything">选中全部 {{ Math.min(total, MAX_BATCH) }} 件{{ total > MAX_BATCH ? '（上限）' : '' }}</a-button>
          <a-button v-if="selected.size" type="link" size="small" :disabled="Boolean(batchBusy)" @click="selected = new Map()">清空</a-button>
        </div>
        <div class="batch-float-actions">
          <a-button shape="round" :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'recognize'" @click="confirmBatch('recognize')">重新识别</a-button>
          <a-button shape="round" :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'enhance'" @click="confirmBatch('enhance')">AI 增强</a-button>
          <a-button shape="round" type="primary" :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'reprocess'" @click="confirmBatch('reprocess')">重新增强图片</a-button>
          <a-popover trigger="click" placement="topRight" title="三种处理有什么不同" overlay-class-name="batch-explain">
            <template #content>
              <dl class="batch-explain-list">
                <dt>重新识别 <small>每件 1 次额度</small></dt><dd>重新读取品类、颜色、季节、图案等资料；不改图片，手动改过的字段会保留。由服务器逐件处理，可以关闭页面。</dd>
                <dt>AI 增强 <small>每件 1 次额度</small></dt><dd>按快速入柜的规则重新整理展示图：去掉残留背景、人物和腿部。只对快速入柜的衣物有效。</dd>
                <dt>重新增强图片 <small>每件 2 次额度</small></dt><dd>先重新识别，再用生图模型摆正、减轻褶皱、去背景。原图和历史图片保留，AI 生成可能含推测细节。</dd>
              </dl>
              <p class="batch-explain-note">AI 额度每天 0 点重置；处理中的衣物自动跳过，额度不足时剩下的不提交。</p>
            </template>
            <a-button type="text" shape="circle" aria-label="三种处理的说明"><QuestionCircleOutlined /></a-button>
          </a-popover>
        </div>
        <a-tooltip title="退出批量处理"><a-button class="batch-float-close" type="text" shape="circle" aria-label="退出批量处理" :disabled="Boolean(batchBusy)" @click="exitSelecting"><CloseOutlined /></a-button></a-tooltip>
      </section>
    </Transition>
  </Teleport>
  <a-alert v-if="batchResult" :type="batchResult.type" :message="batchResult.message" :description="batchResult.description || undefined" show-icon closable class="page-alert batch-result" @close="batchResult = null"><template #action><a-button size="small" @click="router.push('/tasks')">查看任务</a-button></template></a-alert>
  <a-alert v-if="error" type="error" :message="error" show-icon closable class="page-alert" />
  <div ref="listTop" class="list-top"></div>
  <GarmentCardSkeleton v-if="loading && !items.length" label="正在加载衣柜…" />
  <WardrobeRack v-else-if="items.length && rackView" :items="items" :reviews="pictureChecks" :spread="spread / 100" :aria-busy="loading" :class="{ busy: loading }" />
  <section v-else-if="items.length" class="garment-grid" :class="{ 'has-float': showFloat }" aria-label="衣物列表" :aria-busy="loading">
    <div v-for="item in items" :key="item.id" class="search-hit">
      <GarmentCard :review="pictureChecks[item.id]?.message" :garment="item" :selectable="selecting" :selected="selected.has(item.id)" @toggle="toggle(item)" />
      <p v-if="searching && searchResult?.reasons[item.id]?.length" class="search-reasons" :title="searchResult.reasons[item.id].join(' · ')">{{ searchResult.reasons[item.id].join(' · ') }}</p>
    </div>
    <button v-if="!selecting" class="add-card" @click="router.push('/add')"><span class="add-card-icon"><PlusOutlined /></span><strong>添加衣物</strong><small>上传 → 处理 → 核对入柜</small></button>
  </section>
  <section v-else class="empty-wardrobe">
    <span class="empty-spark"><PlusOutlined /></span><p class="eyebrow">从一件衣服开始</p><h2>{{ hasFilters ? '没有找到这件衣物' : ownership === 'WANTED' ? `还没有${wantedLabel}的衣服` : ownership === 'OWNED' ? '还没有已拥有的衣物' : '你的衣柜还没有衣物' }}</h2><p>{{ hasFilters ? (searchResult?.emptyHint || '试试换一个关键词，或清除筛选条件。') : ownership === 'WANTED' ? `网上看中、还没买的衣服，可以把商品图或截图上传，确认入柜时选“${wantedLabel}”。买到后在详情里标为已拥有。` : '上传单件衣物照片，处理后核对并确认，它就会出现在这里。' }}</p>
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
  </footer>
</template>

<style scoped>
.list-top{height:0;scroll-margin-top:72px}
.garment-grid.has-float{padding-bottom:8px}
.pager-bottom{display:flex;flex-direction:column;align-items:center;gap:8px;margin:36px 0 84px}
.garment-grid[aria-busy="true"]{opacity:.5;pointer-events:none;transition:opacity .15s}
.wardrobe-rack.busy{opacity:.5;pointer-events:none;transition:opacity .15s}
@media(prefers-reduced-motion:reduce){.garment-grid[aria-busy="true"],.wardrobe-rack.busy{transition:none}}
@media(max-width:767px){.pager-bottom{margin-bottom:56px}}

/* 顶栏标题（Teleport 到 #topbar-page）：我的衣柜 270 件 */
.closet-title{display:flex;align-items:baseline;gap:6px;min-width:0;white-space:nowrap;cursor:default}
.closet-title em,.closet-title small{flex:none}
.closet-title b{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:15px;font-weight:500;color:var(--ink)}
.closet-title em{margin-left:4px;font-style:normal;font-size:15px;font-weight:600;color:var(--accent-strong);font-variant-numeric:tabular-nums}
.closet-title small{font-size:12px;color:var(--muted)}
.closet-h1{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

/* 工具条：一行，胶囊搜索 + 两个小胶囊（筛选、排序），右侧展示方式、常见单品、更多。留白为主，无边框。 */
.closet-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:8px 0 18px}
.closet-search.ant-input-affix-wrapper{flex:0 1 340px;min-width:200px;height:42px;padding:0 8px 0 16px;border:0;border-radius:999px;background:var(--surface-alt);box-shadow:none;transition:background .2s,box-shadow .2s}
.closet-search.ant-input-affix-wrapper:hover{background:color-mix(in srgb,var(--surface-alt) 60%,var(--selection-bg))}
.closet-search.ant-input-affix-wrapper-focused{background:var(--surface);box-shadow:0 0 0 1.5px var(--brand),0 8px 24px -12px #0d3b3340}
.closet-search :deep(.ant-input){background:transparent}
.closet-search :deep(.ant-input-prefix){margin-right:8px;color:var(--muted)}
.closet-chip.ant-btn{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 16px;border:0;border-radius:999px;color:var(--muted-strong);background:transparent;box-shadow:inset 0 0 0 1px var(--line)}
.closet-chip.ant-btn:not(:disabled):hover{color:var(--ink);background:var(--surface-alt);box-shadow:inset 0 0 0 1px transparent}
.closet-chip.ant-btn.on{color:var(--accent-strong);background:var(--accent-soft);box-shadow:none}
.closet-chip.ant-btn.warn{color:var(--warning);background:var(--warning-bg);box-shadow:none}
.closet-chip.ant-btn:disabled{background:transparent;opacity:.55}
.closet-chip-count{min-width:18px;height:18px;padding:0 5px;border-radius:9px;font-size:11px;line-height:18px;text-align:center;color:#fff;background:var(--brand)}
.closet-sort-icon{transform:rotate(90deg)}
.closet-toolbar-gap{flex:1}
.closet-layout.ant-segmented,.closet-ownership.ant-segmented{padding:3px;border-radius:999px;background:var(--surface-alt)}
.closet-layout :deep(.ant-segmented-item),.closet-layout :deep(.ant-segmented-thumb),.closet-ownership :deep(.ant-segmented-item),.closet-ownership :deep(.ant-segmented-thumb){border-radius:999px}
.closet-layout :deep(.ant-segmented-item-label){min-height:36px;padding:0 16px;line-height:36px}
.closet-ownership :deep(.ant-segmented-item-label){min-height:36px;padding:0 14px;line-height:36px}
.closet-title-wanted{margin-left:2px}
.closet-soft.ant-btn{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 18px;border:0;border-radius:999px;color:var(--accent-strong);background:var(--accent-soft);box-shadow:none;transition:background .2s,transform .2s var(--spring)}
.closet-soft.ant-btn:hover{color:var(--accent-strong);background:color-mix(in srgb,var(--brand) 20%,var(--surface))}
.closet-soft.ant-btn:active{transform:scale(.96)}
.closet-round.ant-btn{position:relative;width:42px;height:42px;border-radius:50%;color:var(--muted-strong);font-size:18px}
.closet-round-dot{position:absolute;top:8px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--warning)}
.closet-chip-text,.closet-soft em{font-style:normal}
.closet-break{display:none}
/* 衣架松紧滑块：左边叠放图标，右边散开图标 */
.closet-spread{display:flex;align-items:center;gap:8px;height:42px;padding:0 14px;border-radius:999px;background:var(--surface-alt)}
.closet-spread-icon{flex:none;width:18px;height:18px;fill:var(--surface);stroke:var(--muted);stroke-width:1.4}
.closet-spread-slider.ant-slider{width:120px;margin:0 4px}
.closet-spread-slider :deep(.ant-slider-rail){background:var(--line)}
.closet-spread-slider :deep(.ant-slider-track){background:var(--brand)}
.closet-spread-slider :deep(.ant-slider-handle::after){box-shadow:0 0 0 2px var(--brand)}
.closet-chosen{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:-6px 0 16px}
.closet-chosen-tag.ant-tag{margin:0;padding:3px 6px 3px 12px;border:0;border-radius:999px;color:var(--accent-strong);background:var(--accent-soft);font-size:13px}
.search-tags{margin-top:-6px}

.query-image{position:relative;display:inline-flex;margin-left:6px}
.query-image img{width:28px;height:28px;object-fit:cover;border-radius:6px;border:1px solid var(--line)}
.query-image-remove.ant-btn.ant-btn-text{position:absolute;top:-7px;right:-7px;display:grid;place-items:center;width:16px;min-width:16px;height:16px;padding:0;border-radius:50%;background:var(--ink);color:var(--canvas);font-size:9px;line-height:1}
.query-image-remove.ant-btn.ant-btn-text:hover{background:var(--ink);color:var(--canvas);opacity:.85}
.search-camera.ant-btn{color:var(--muted-strong)}
.search-image-note{margin:-8px 2px 16px;font-size:12px;color:var(--muted-copy)}
.batch-hint{margin:-6px 0 16px;font-size:13px;color:var(--muted)}
.batch-result :deep(.ant-alert-description){white-space:pre-line}

.batch-explain-list{max-width:340px;margin:0}
.batch-explain-list dt{margin-top:10px;font-weight:500}
.batch-explain-list dt:first-child{margin-top:0}
.batch-explain-list dt small{margin-left:6px;font-weight:400;color:var(--accent-strong)}
.batch-explain-list dd{margin:2px 0 0;font-size:12px;line-height:1.7;color:var(--muted)}
.batch-explain-note{max-width:340px;margin:12px 0 0;padding-top:10px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}

/* 手机：两行。第一行 搜索 + 筛选 + 排序（只留图标）+ 更多；第二行 衣架/平铺 + 松紧滑块。常见单品、待核对收进“更多”。 */
@media(max-width:767px){
  .closet-title b{font-size:14px}
  .closet-toolbar{gap:8px;margin-top:2px;margin-bottom:12px}
  .closet-search.ant-input-affix-wrapper{order:1;flex:1 1 0;min-width:0;height:40px}
  .closet-toolbar > :deep(.closet-chip),.closet-chip.ant-btn{order:2;width:40px;height:40px;padding:0;justify-content:center}
  .closet-chip-text{display:none}
  .closet-chip-count{position:absolute;top:-2px;right:-2px}
  .closet-chip.ant-btn{position:relative}
  .closet-round.ant-btn{order:3;width:40px;height:40px}
  .closet-break{display:block;order:4;flex-basis:100%;height:0}
  .closet-ownership{order:5}
  .closet-ownership :deep(.ant-segmented-item-label){min-height:32px;padding:0 10px;line-height:32px}
  .closet-layout{order:5}
  .closet-layout :deep(.ant-segmented-item-label){min-height:32px;padding:0 14px;line-height:32px}
  .closet-toolbar-gap{display:block;order:6}
  .closet-spread{order:7;height:38px;padding:0 10px}
  .closet-spread-slider.ant-slider{width:96px}
  .closet-soft.ant-btn,.closet-chip.warn{display:none}
}
</style>
<style>
/* 筛选面板（a-popover 挂在 body 下，容器样式不能 scoped）。 */
.closet-filter-pop .ant-popover-inner { padding: 18px 18px 14px; border-radius: 20px; box-shadow: 0 24px 60px -20px #0d3b3340, 0 0 0 1px var(--line); }
.closet-filter-panel { display: grid; grid-template-columns: auto 260px; align-items: center; gap: 10px 14px; }
.closet-filter-panel > label { font-size: 13px; color: var(--muted); }
.closet-filter-panel > .ant-select { width: 100%; }
.closet-filter-panel > .ant-select .ant-select-selector { border-radius: 12px; }
.closet-filter-panel > footer { grid-column: 1 / -1; display: flex; justify-content: space-between; margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--line); }
.closet-filter-panel > footer .ant-btn-primary { border-radius: 999px; padding-inline: 20px; }
.batch-explain .ant-popover-inner { border-radius: 18px; }
@media (max-width: 767px) { .closet-filter-panel { grid-template-columns: 1fr; gap: 6px; width: calc(100vw - 64px); } .closet-filter-panel > label { margin-top: 6px; } }
</style>
