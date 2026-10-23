<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { App as AntApp } from 'ant-design-vue'
import { CheckCircleOutlined, CheckSquareOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { closetApi, type Garment } from '../services/api'
import { isProcessing } from '../domain/workflow'
import { useClosetStore } from '../stores/closet'
import GarmentCard from '../components/GarmentCard.vue'
import GarmentCardSkeleton from '../components/GarmentCardSkeleton.vue'
import { similarApi, type SimilarItem } from '../similar/api'
const closet = useClosetStore(); const items = ref<Garment[]>([]); const loading = ref(true); const error = ref(''); const filter = ref('全部')
const duplicates = ref<Record<string, SimilarItem>>({})
const page = ref(1); const total = ref(0); let timer = 0; let alive = false; let delay = 2000
const needsAction = (item: Garment) => !isProcessing(item.taskStatus) && (Boolean(item.imageProcessing?.stickerRequired && !item.imageProcessing.stickerReady) || ['FAILED', 'UNKNOWN', 'CANCELLED', 'NEEDS_REVIEW'].includes(item.taskStatus || ''))
const filtered = computed(() => items.value.filter(item => filter.value === '全部' || (filter.value === '处理中' ? isProcessing(item.taskStatus) : filter.value === '需处理' ? needsAction(item) : !isProcessing(item.taskStatus) && !needsAction(item))))
async function load() {
  try { const response = await closetApi.list({ status: 'DRAFT', q: '', category: '', color: '', season: '', page: page.value, size: 24 }); if (!alive) return; items.value = response.items; total.value = response.total; error.value = ''; delay = 2000
    // Hint only (design 相似衣物 S2): drafts that look like something already in the closet.
    similarApi.flags(response.items.filter(i => !isProcessing(i.taskStatus)).map(i => i.id)).then(r => { if (alive) duplicates.value = r.flags }).catch(() => {}) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '未入柜衣物暂时无法加载。'; delay = Math.min(30000, delay * 2) }
  finally { loading.value = false }
}
// Issue #84: act on several drafts at once (admit, re-recognise, trash). Each garment is submitted on its own, so one
// refusal (a sticker not finished, a newer revision) never stops the rest; the summary lists what did not go through.
const { modal } = AntApp.useApp()
const selecting = ref(false), selected = ref(new Set<string>()), batchBusy = ref<'' | BatchMode>(''), batchProgress = ref({ done: 0, total: 0 })
const batchResult = ref<{ type: 'success' | 'warning' | 'error'; message: string; description: string } | null>(null)
type BatchMode = 'confirm' | 'recognize' | 'trash'
const batchLabels: Record<BatchMode, string> = { confirm: '确认入柜', recognize: '重新识别资料', trash: '移入回收站' }
const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every(item => selected.value.has(item.id)))
function toggle(id: string) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(filtered.value.map(item => item.id)) }
function exitSelecting() { selecting.value = false; selected.value = new Set() }
function startBatch(mode: BatchMode) {
  const targets = items.value.filter(item => selected.value.has(item.id))
  const runnable = mode === 'trash' ? targets : targets.filter(item => !isProcessing(item.taskStatus))
  const skipped = targets.length - runnable.length
  if (!runnable.length) { batchResult.value = { type: 'warning', message: '没有可提交的衣物', description: '所选衣物都在处理中，请等处理结束后再试。' }; return }
  const content = { confirm: '按当前展示图和资料直接入柜，之后仍可在衣物详情里修改。贴纸没做完或资料需要核对的衣物会被退回，请逐件处理。', recognize: '每件调用一次识别模型，使用 1 次 AI 额度；已手动改过的字段会保留。', trash: '移入回收站后不再显示在这里，可在回收站恢复。' }[mode]
  modal.confirm({ title: `${batchLabels[mode]}（${runnable.length} 件）？`, content: content + (skipped ? `另有 ${skipped} 件正在处理，将跳过。` : ''), okText: batchLabels[mode], cancelText: '取消', okButtonProps: { danger: mode === 'trash' }, onOk: () => { void runBatch(mode, runnable, skipped) } })
}
async function runBatch(mode: BatchMode, targets: Garment[], skipped: number) {
  batchBusy.value = mode; batchResult.value = null; batchProgress.value = { done: 0, total: targets.length }
  const failures: string[] = []; let done = 0, stoppedByQuota = 0
  for (const [index, item] of targets.entries()) {
    try {
      if (mode === 'confirm') await closetApi.confirm(item.id, { revision: item.revision })
      else if (mode === 'recognize') await closetApi.recognize(item.id)
      else await closetApi.trash(item.id, item.revision)
      done++
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '提交失败'
      if (mode === 'recognize' && message.includes('额度')) { stoppedByQuota = targets.length - index; break }
      failures.push(`${item.name || item.category[0] || '未命名衣物'}：${message}`)
    } finally { batchProgress.value = { done: index + 1, total: targets.length } }
  }
  const notes = [stoppedByQuota ? `额度不足，${stoppedByQuota} 件未提交。` : '', skipped ? `${skipped} 件处理中已跳过。` : '', ...failures].filter(Boolean)
  batchResult.value = { type: done === 0 ? 'error' : notes.length ? 'warning' : 'success', message: `${batchLabels[mode]}：完成 ${done} / ${targets.length + skipped} 件${mode === 'recognize' && done ? '，可在任务页查看进度' : ''}。`, description: notes.join('\n') }
  batchBusy.value = ''
  if (done) { exitSelecting(); loading.value = true; await load(); await closet.refreshCounts(); poll() }
}
function poll() { window.clearTimeout(timer); if (alive && (error.value || items.value.some(item => isProcessing(item.taskStatus)))) timer = window.setTimeout(async () => { await load(); poll() }, delay) }
async function turnPage(change: number) { page.value += change; loading.value = true; await load(); poll() }
onMounted(async () => { alive = true; await load(); await closet.refreshCounts(); poll() }); onUnmounted(() => { alive = false; window.clearTimeout(timer) })
</script>
<template>
  <header class="page-heading"><div><h1>未入柜</h1><p class="page-subtitle">处理中的照片和待核对结果都在这里。确认入柜后，它们会移到“我的衣柜”。</p></div><span class="heading-count">{{ total }} 件</span></header>
  <div class="list-toolbar"><a-segmented v-model:value="filter" :options="['全部', '处理中', '待核对', '需处理']" /><span class="muted">状态筛选当前页</span><a-button v-if="items.length && !selecting" class="pending-batch" @click="selecting = true; batchResult = null"><CheckSquareOutlined /> 批量处理</a-button></div>
  <section v-if="selecting" class="batch-bar" aria-label="批量处理">
    <a-checkbox :checked="allSelected" :indeterminate="selected.size > 0 && !allSelected" :disabled="Boolean(batchBusy)" @change="toggleAll">全选</a-checkbox>
    <span class="batch-count">已选 {{ selected.size }} 件<template v-if="batchBusy"> · 正在处理 {{ batchProgress.done }} / {{ batchProgress.total }}</template></span>
    <a-space wrap class="batch-actions">
      <a-button type="primary" :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'confirm'" @click="startBatch('confirm')">确认入柜</a-button>
      <a-button :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'recognize'" @click="startBatch('recognize')">重新识别资料</a-button>
      <a-button danger :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'trash'" @click="startBatch('trash')">移入回收站</a-button>
      <a-button :disabled="Boolean(batchBusy)" @click="exitSelecting">完成</a-button>
    </a-space>
  </section>
  <a-alert v-if="batchResult" :type="batchResult.type" :message="batchResult.message" :description="batchResult.description || undefined" show-icon closable class="page-alert batch-result" @close="batchResult = null" />
  <a-alert v-if="error" type="error" :message="error" show-icon class="page-alert" />
  <GarmentCardSkeleton v-if="loading" label="正在加载未入柜衣物…" />
  <section v-else-if="filtered.length" class="garment-grid"><div v-for="item in filtered" :key="item.id" class="pending-card"><GarmentCard :garment="item" pending :selectable="selecting" :selected="selected.has(item.id)" @toggle="toggle(item.id)" /><RouterLink v-if="duplicates[item.id]" :to="`/garment/${item.id}`" class="pending-duplicate"><a-tag color="orange">可能重复：{{ duplicates[item.id].name }}</a-tag></RouterLink></div></section>
  <section v-else class="empty-wardrobe compact-empty"><span class="empty-spark"><CheckCircleOutlined /></span><h2>{{ total ? '当前页没有此状态的衣物' : '没有未入柜的衣物' }}</h2><p>上传后可查看处理进度，处理结束后在工作台核对结果。</p><RouterLink to="/add" class="outline-button"><PlusOutlined /> 添加衣物</RouterLink></section>
  <footer v-if="total > 24" class="pagination-row"><span>第 {{ page }} / {{ Math.ceil(total / 24) }} 页</span><div><a-button :disabled="page === 1" @click="turnPage(-1)">上一页</a-button><a-button :disabled="page * 24 >= total" @click="turnPage(1)">下一页</a-button></div></footer>
</template>
<style scoped>
.pending-card { display: grid; gap: 6px; align-content: start; }
.pending-duplicate { justify-self: start; }
.pending-batch { margin-left: auto; }
.batch-bar { position: sticky; top: 8px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-bottom: 18px; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius-lg, 14px); background: var(--surface); }
.batch-count { color: var(--muted); }
.batch-actions { margin-left: auto; }
.batch-result :deep(.ant-alert-description) { white-space: pre-line; }
@media (max-width: 767px) { .batch-actions { margin-left: 0; } }
</style>
