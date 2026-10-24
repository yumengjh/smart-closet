<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { App as AntApp } from 'ant-design-vue'
import { CheckCircleOutlined, EditOutlined, ThunderboltOutlined, UndoOutlined } from '@ant-design/icons-vue'
import { closetApi, request, type Garment } from '../services/api'
import type { MetadataField } from '../domain/metadata'
import { thumbUrl } from '../services/urls'
import { forgetPictureCheck, loadPictureChecks, loadReviewCount } from '../wardrobe/pictureChecks'
import { fromReviewLink, saveReviewIds } from '../wardrobe/origin'
import { useClosetStore } from '../stores/closet'

/**
 * 待核对：识图拿不准的衣物集中在这里，一处处理完，不必逐件打开详情。
 * 两类原因：本地图片比对与资料不一致的品类（改成建议的品类，或确认资料没错），以及识图没能确定品类的衣物（直接选一个）。
 * 能一键做的一键做（采纳全部建议），要多改几项的在侧栏里快速编辑，需要看大图再去详情，返回仍回到这一页。
 * 处理过的衣物留在原位变成一行“已处理”（可撤销），列表不会在手下跳动；处理结果都记为用户确认，不再出现。
 */
type Need = { garmentId: string; status: string; kind: 'CONFLICT' | 'MISSING_CATEGORY'; suggestion?: string; message: string }
type Row = Need & { garment: Garment | null }
type Done = { text: string; undo: boolean }
const EDIT_KEYS = ['category', 'subtype', 'primaryColor', 'seasons'] as const
const SCROLL_KEY = 'yixu.review-scroll.v1'
const { message, modal } = AntApp.useApp(); const closet = useClosetStore(); const router = useRouter()
const rows = ref<Row[]>([]); const loading = ref(true); const error = ref(''); const busy = ref(''); const bulk = ref({ running: false, done: 0, total: 0 })
const categories = ref<string[]>([]); const fields = ref<Partial<Record<string, MetadataField>>>({})
const picked = ref<Record<string, string>>({}); const done = ref<Record<string, Done>>({})
const tab = ref<'all' | 'CONFLICT' | 'MISSING_CATEGORY' | 'DRAFT'>('all')
const editing = ref<string | null>(null); const form = reactive<Record<string, string[]>>({}); const saving = ref(false)

async function load() {
  loading.value = true; error.value = ''
  try {
    const [r, schema] = await Promise.all([request<{ items: Need[] }>('/api/garments/needs-review'), closetApi.metadataFields().catch(() => [] as MetadataField[])])
    fields.value = Object.fromEntries(schema.map(f => [f.key, f])); categories.value = fields.value.category?.options || []
    rows.value = await Promise.all(r.items.map(async n => ({ ...n, garment: await closetApi.detail(n.garmentId).catch(() => null) })))
    done.value = {}
    // A local picture guess preselects the category of a garment recognition left without one.
    for (const n of r.items) if (n.kind === 'MISSING_CATEGORY' && n.suggestion && !picked.value[n.garmentId]) picked.value[n.garmentId] = n.suggestion
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '待核对列表暂时无法加载。' }
  finally { loading.value = false }
  await restoreScroll()
}
onMounted(load)

const pending = computed(() => rows.value.filter(r => !done.value[r.garmentId]))
const handled = computed(() => rows.value.length - pending.value.length)
const tabs = computed(() => [
  { value: 'all', label: `全部 ${rows.value.length}` },
  { value: 'CONFLICT', label: `品类可能不对 ${rows.value.filter(r => r.kind === 'CONFLICT').length}` },
  { value: 'MISSING_CATEGORY', label: `没有品类 ${rows.value.filter(r => r.kind === 'MISSING_CATEGORY').length}` },
  { value: 'DRAFT', label: `未入柜 ${rows.value.filter(r => r.status === 'DRAFT').length}` },
])
const visible = computed(() => rows.value.filter(r => tab.value === 'all' || (tab.value === 'DRAFT' ? r.status === 'DRAFT' : r.kind === tab.value)))
const adoptable = computed(() => pending.value.filter(r => r.suggestion && r.garment))
const title = (g: Garment | null) => g ? (g.name || `${g.primaryColor[0] && g.primaryColor[0] !== '未知颜色' ? g.primaryColor[0] : ''}${g.category[0] || '衣物'}`) : '衣物'
const nowText = (g: Garment | null) => g ? `${g.category.join('/') || '没有品类'}${g.subtype?.length ? `（${g.subtype.join('、')}）` : ''}` : '—'

function finished() { void loadReviewCount(); void loadPictureChecks(true); void closet.refreshCounts() }
/** Writes the category the person chose (or confirmed) and leaves the card in place as a one-line result. */
async function settle(row: Row, category: string[], text: string, undo = true) {
  if (!row.garment || !category.length || busy.value) return false
  busy.value = row.garmentId
  try {
    row.garment = await closetApi.update(row.garmentId, { fields: { category }, revision: row.garment.revision })
    forgetPictureCheck(row.garmentId); done.value = { ...done.value, [row.garmentId]: { text, undo } }; message.success(text)
    if (!pending.value.length) finished()
    return true
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '保存失败，请重试。'); return false }
  finally { busy.value = '' }
}
/** Back to what recognition had: only fields the person never touched are on this page, so the automatic value is the old one. */
async function undo(row: Row) {
  if (busy.value) return
  busy.value = row.garmentId
  try {
    row.garment = await closetApi.update(row.garmentId, { fields: {}, resetFields: ['category'] })
    const next = { ...done.value }; delete next[row.garmentId]; done.value = next; finished()
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '撤销失败，请重试。') }
  finally { busy.value = '' }
}
function adoptAll() {
  const list = adoptable.value
  modal.confirm({
    title: `采纳全部建议（${list.length} 件）？`,
    content: `把 ${list.filter(r => r.kind === 'CONFLICT').length} 件“品类可能不对”改成图片比对建议的品类，并把 ${list.filter(r => r.kind === 'MISSING_CATEGORY').length} 件“没有品类”设为建议的品类。不调用 AI、不消耗额度，每件之后都可以撤销。`,
    okText: '全部采纳', cancelText: '再看看',
    onOk: async () => {
      bulk.value = { running: true, done: 0, total: list.length }; let ok = 0
      for (const row of list) { if (await settle(row, [row.suggestion!], `已改为${row.suggestion}`)) ok++; bulk.value.done++ }
      bulk.value.running = false; message.success(`已处理 ${ok} / ${list.length} 件。`)
    },
  })
}

// Quick edit: the few fields worth fixing in passing, in a side panel that steps through the list.
const editRow = computed(() => rows.value.find(r => r.garmentId === editing.value) || null)
const editList = computed(() => visible.value.filter(r => !done.value[r.garmentId] || r.garmentId === editing.value))
const editAt = computed(() => editList.value.findIndex(r => r.garmentId === editing.value))
function fill(row: Row) { for (const key of EDIT_KEYS) form[key] = [...((row.garment?.[key as keyof Garment] as string[] | undefined) || [])] }
function openEdit(row: Row) { fill(row); if (row.kind === 'MISSING_CATEGORY' && !form.category.length && row.suggestion) form.category = [row.suggestion]; editing.value = row.garmentId }
function stepEdit(delta: number) { const next = editList.value[editAt.value + delta]; if (next) openEdit(next) }
async function saveEdit() {
  const row = editRow.value; if (!row?.garment || saving.value) return
  const changed: Record<string, string[]> = {}
  for (const key of EDIT_KEYS) { const before = (row.garment[key as keyof Garment] as string[] | undefined) || []; if (form[key].join('|') !== before.join('|')) changed[key] = form[key] }
  saving.value = true
  try {
    // Saving the form also settles the category question: the person has looked at it.
    changed.category ||= form.category.length ? form.category : row.garment.category
    if (!changed.category.length) { message.warning('请先选择品类。'); return }
    row.garment = await closetApi.update(row.garmentId, { fields: changed, revision: row.garment.revision })
    forgetPictureCheck(row.garmentId); done.value = { ...done.value, [row.garmentId]: { text: '资料已更新', undo: false } }; message.success('资料已保存。')
    const next = editList.value.find(r => r.garmentId !== row.garmentId && !done.value[r.garmentId])
    if (next) openEdit(next); else { editing.value = null; finished() }
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '保存失败，请重试。') }
  finally { saving.value = false }
}

// Opening a garment keeps this page as its way back (?from=review) and remembers where we were.
function openGarment(row: Row) {
  saveReviewIds(visible.value.map(r => r.garmentId))
  try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ y: Math.round(window.scrollY), at: Date.now() })) } catch { /* storage blocked */ }
  void router.push(fromReviewLink(row.garmentId))
}
async function restoreScroll() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null'); sessionStorage.removeItem(SCROLL_KEY)
    if (saved && Date.now() - saved.at < 30 * 60_000) { await nextTick(); window.scrollTo({ top: saved.y, behavior: 'instant' }) }
  } catch { /* ignore */ }
}
const isMulti = (key: string) => Boolean(fields.value[key]?.multiple) || key === 'subtype'
const options = (key: string) => (fields.value[key]?.options || []).map((value: string) => ({ value, label: value }))
</script>

<template>
  <header class="page-heading">
    <div><h1>待核对</h1><p class="page-subtitle">识图拿不准的衣物都在这里：一键采纳建议，或在侧栏里快速改几项资料，不用逐件打开详情。处理后记为你确认过的资料，不再提示。</p></div>
    <span class="heading-count">还剩 {{ pending.length }} 件<template v-if="handled"> · 已处理 {{ handled }}</template></span>
  </header>
  <a-alert v-if="error" type="error" :message="error" show-icon class="page-alert"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
  <a-skeleton v-if="loading" active />
  <section v-else-if="!rows.length && !error" class="empty-wardrobe compact-empty"><span class="empty-spark"><CheckCircleOutlined /></span><h2>没有需要核对的衣物</h2><p>识图拿不准的衣物会出现在这里。</p><RouterLink to="/wardrobe" class="outline-button">回到衣柜</RouterLink></section>
  <template v-else-if="rows.length">
    <section class="review-bar" aria-label="筛选与批量处理">
      <a-segmented v-model:value="tab" :options="tabs" class="review-tabs" />
      <a-button v-if="adoptable.length" type="primary" :loading="bulk.running" :disabled="Boolean(busy)" @click="adoptAll"><ThunderboltOutlined /> 采纳全部建议（{{ adoptable.length }}）</a-button>
      <span v-if="bulk.running" class="review-progress">正在处理 {{ bulk.done }} / {{ bulk.total }}</span>
    </section>
    <a-result v-if="!pending.length" status="success" title="全部处理完了" sub-title="这些衣物的资料已记为你确认过的，之后不会再提示。">
      <template #extra><a-button type="primary" @click="router.push('/wardrobe')">回到衣柜</a-button><a-button @click="load">再检查一遍</a-button></template>
    </a-result>
    <p v-if="!visible.length" class="review-none">这一类下没有衣物。</p>
    <div class="review-list">
      <article v-for="row in visible" :key="row.garmentId" class="review-row" :class="{ settled: done[row.garmentId] }">
        <a class="review-image" :href="`/garment/${row.garmentId}?from=review`" :aria-label="`打开${title(row.garment)}`" @click.prevent="openGarment(row)"><img v-if="row.garment?.displayUrl" :src="thumbUrl(row.garment.displayUrl, 320)" :alt="title(row.garment)" loading="lazy" /></a>
        <div v-if="done[row.garmentId]" class="review-copy">
          <strong>{{ title(row.garment) }}</strong>
          <span class="review-done"><CheckCircleOutlined /> {{ done[row.garmentId].text }}</span>
          <a-space size="small" wrap>
            <a-button v-if="done[row.garmentId].undo" size="small" :loading="busy === row.garmentId" @click="undo(row)"><UndoOutlined /> 撤销</a-button>
            <a-button size="small" type="link" @click="openGarment(row)">看详情</a-button>
          </a-space>
        </div>
        <div v-else class="review-copy">
          <strong>{{ title(row.garment) }}<a-tag v-if="row.status === 'DRAFT'" class="review-draft">未入柜</a-tag></strong>
          <small>现在：{{ nowText(row.garment) }}</small>
          <p>{{ row.message }}</p>
          <a-space wrap>
            <template v-if="row.kind === 'CONFLICT' && row.suggestion">
              <a-button type="primary" size="small" :loading="busy === row.garmentId" @click="settle(row, [row.suggestion], `已改为${row.suggestion}`)">改成{{ row.suggestion }}</a-button>
              <a-button size="small" :disabled="busy === row.garmentId" @click="settle(row, row.garment?.category || [], '已确认，不再提示', false)">资料没错</a-button>
            </template>
            <template v-else>
              <a-select v-model:value="picked[row.garmentId]" size="small" class="review-select" show-search placeholder="选择品类" :options="[...new Set([...(row.suggestion ? [row.suggestion] : []), ...categories])].map(c => ({ value: c, label: c }))" />
              <a-button type="primary" size="small" :disabled="!picked[row.garmentId]" :loading="busy === row.garmentId" @click="settle(row, [picked[row.garmentId]], `已设为${picked[row.garmentId]}`)">保存</a-button>
            </template>
            <a-button size="small" type="text" :disabled="busy === row.garmentId" @click="openEdit(row)"><EditOutlined /> 快速编辑</a-button>
          </a-space>
        </div>
      </article>
    </div>
  </template>

  <a-drawer :open="Boolean(editing)" :title="editRow ? `快速编辑 · ${title(editRow.garment)}` : '快速编辑'" placement="right" :width="420" destroy-on-close @close="editing = null">
    <template v-if="editRow">
      <img v-if="editRow.garment?.displayUrl" class="edit-image" :src="thumbUrl(editRow.garment.displayUrl, 480)" :alt="title(editRow.garment)" />
      <p class="edit-reason">{{ editRow.message }}</p>
      <a-form layout="vertical" class="edit-form">
        <a-form-item v-for="key in EDIT_KEYS" :key="key" :label="fields[key]?.label || key">
          <a-select :value="isMulti(key) ? form[key] : form[key][0]" :mode="isMulti(key) ? 'multiple' : undefined" :max-count="key === 'subtype' ? 3 : undefined" show-search allow-clear :options="options(key)" :placeholder="`选择${fields[key]?.label || key}`"
            @update:value="(v: unknown) => { form[key] = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [] }" />
        </a-form-item>
      </a-form>
      <a-button type="link" class="edit-more" @click="openGarment(editRow)">在详情里看大图、改更多资料</a-button>
    </template>
    <template #footer>
      <div class="edit-footer">
        <a-space><a-button :disabled="editAt <= 0" @click="stepEdit(-1)">上一件</a-button><a-button :disabled="editAt < 0 || editAt >= editList.length - 1" @click="stepEdit(1)">下一件</a-button></a-space>
        <a-button type="primary" :loading="saving" @click="saveEdit">保存{{ editAt >= 0 && editAt < editList.length - 1 ? '并看下一件' : '' }}</a-button>
      </div>
    </template>
  </a-drawer>
</template>

<style scoped>
.review-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 4px 0 16px; }
.review-tabs { max-width: 100%; overflow-x: auto; }
.review-progress { color: var(--muted-copy); font-size: 13px; }
.review-none { color: var(--muted-copy); }
.review-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
.review-row { display: flex; gap: 14px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.review-row.settled { background: var(--surface-alt); }
.review-row.settled .review-image { width: 72px; height: 72px; opacity: .75; }
.review-image { flex: none; width: 112px; height: 112px; border-radius: var(--radius-md); background: var(--surface-alt); overflow: hidden; cursor: pointer; }
.review-image img { width: 100%; height: 100%; object-fit: contain; }
.review-copy { display: grid; align-content: start; gap: 4px; min-width: 0; }
.review-copy strong { font-size: 14px; }
.review-copy small { color: var(--muted-copy); font-size: 12px; }
.review-copy p { margin: 2px 0 6px; font-size: 13px; line-height: 1.6; }
.review-done { color: var(--success); font-size: 13px; }
.review-draft { margin-left: 6px; }
.review-select { min-width: 140px; }
.edit-image { display: block; width: 100%; max-height: 260px; object-fit: contain; border-radius: var(--radius-md); background: var(--surface-alt); }
.edit-reason { margin: 12px 0 16px; color: var(--muted-copy); font-size: 13px; line-height: 1.6; }
.edit-more { padding-left: 0; }
.edit-footer { display: flex; justify-content: space-between; gap: 12px; }
@media (max-width: 767px) { .review-list { grid-template-columns: 1fr; } .review-image { width: 96px; height: 96px; } }
</style>
