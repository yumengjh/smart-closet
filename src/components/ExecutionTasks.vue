<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { QuestionCircleOutlined, PictureOutlined } from '@ant-design/icons-vue'
import { processingApi, poolLabels, type ExecutionTask } from '../services/processing'
import type { ClosetTask } from '../services/api'
import { thumbUrl } from '../services/urls'
import { quickApi } from '../services/quickIntake'
import { createUuid } from '../domain/id'
import { isAccountSwitched, mayPoll } from '../domain/accountSession'
import { useClosetStore } from '../stores/closet'

/**
 * Background queue in plain words: only the steps that are waiting, running or need a decision. Each garment is
 * processed step by step (local cut-out, recognition, picture clean-up); finished steps and index upkeep stay hidden.
 */
const props = defineProps<{ tasks: ClosetTask[] }>()
const items = ref<ExecutionTask[]>([]); const error = ref(''); const busy = ref(''); const expanded = ref(false)
let timer = 0; let alive = true
const router = useRouter(), closet = useClosetStore()
// Failed steps the user chose to ignore stay hidden in this browser; the garment page still shows them.
const ignoredKey = () => `yuda.queue.ignored.v1:${closet.user?.username || ''}`
const ignored = ref<string[]>(readIgnored())
function readIgnored() { try { const list = JSON.parse(localStorage.getItem(ignoredKey()) || '[]'); return Array.isArray(list) ? list.filter((id: unknown) => typeof id === 'string') : [] } catch { return [] } }
function ignore(task: ExecutionTask) { ignored.value = [...ignored.value, task.id].slice(-200); try { localStorage.setItem(ignoredKey(), JSON.stringify(ignored.value)) } catch { /* Optional convenience. */ } }
const open = new Set(['QUEUED', 'WAITING_QUOTA', 'RUNNING', 'CANCEL_REQUESTED', 'FAILED', 'UNKNOWN'])
const userKinds = new Set(['WORKFLOW', 'QUICK', 'BATCH'])
const failed = (task: ExecutionTask) => ['FAILED', 'UNKNOWN'].includes(task.status)
// A failure already followed by a newer job for the same garment (a redo) is history, not something to act on.
const visible = computed(() => items.value.filter(task => userKinds.has(task.kind) && open.has(task.status) && !(failed(task) && (task.superseded || ignored.value.includes(task.id)))))
const shown = computed(() => expanded.value ? visible.value : visible.value.slice(0, 5))
// Index upkeep (similar garments, colours, search) runs on its own; only a count is worth showing.
const upkeep = computed(() => items.value.filter(task => !userKinds.has(task.kind) && task.kind !== 'RENDER' && ['QUEUED', 'RUNNING'].includes(task.status)).length)
const counts = computed(() => ({
  waiting: visible.value.filter(task => ['QUEUED', 'WAITING_QUOTA'].includes(task.status)).length,
  running: visible.value.filter(task => ['RUNNING', 'CANCEL_REQUESTED'].includes(task.status)).length,
  attention: visible.value.filter(task => ['FAILED', 'UNKNOWN'].includes(task.status)).length,
}))
const summary = computed(() => [counts.value.running && `${counts.value.running} 步处理中`, counts.value.waiting && `${counts.value.waiting} 步在排队`, counts.value.attention && `${counts.value.attention} 步需要你看看`].filter(Boolean).join(' · '))
const byId = computed(() => new Map(props.tasks.map(task => [task.id, task])))
const owner = (task: ExecutionTask) => byId.value.get(task.businessId)
const thumb = (task: ExecutionTask) => owner(task)?.outputUrl || owner(task)?.inputUrl || ''
const kindLabel = (task: ExecutionTask) => task.kind === 'BATCH' ? '多件整理' : task.kind === 'QUICK' ? '快速入柜' : '单件处理'
const stateView: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: '排队中', tone: 'waiting' }, WAITING_QUOTA: { label: '等额度', tone: 'quota' }, RUNNING: { label: '处理中', tone: 'running' },
  CANCEL_REQUESTED: { label: '正在取消', tone: 'running' }, FAILED: { label: '未完成', tone: 'failed' }, UNKNOWN: { label: '结果待核实', tone: 'quota' },
}
function explain(task: ExecutionTask) {
  if (task.status === 'WAITING_QUOTA') return '今天的 AI 额度用完了，明天会自动继续；额度调整后也可以立即重试。'
  if (task.status === 'QUEUED') return task.waitReason?.includes('暂停') ? '管理员暂停了这类处理，恢复后自动继续。' : task.waitReason?.includes('容量') ? '前面还有别的衣物在处理，轮到后自动开始。' : '轮到后自动开始，不用一直开着页面。'
  if (task.status === 'RUNNING') return '正在处理，完成后右上角会提醒你。'
  if (task.status === 'CANCEL_REQUESTED') return '正在停止，已完成的步骤会保留。'
  if (task.status === 'UNKNOWN') return '已经发给模型，但没收到明确结果；为免重复扣额度，不会自动重发。'
  const reason = task.error || task.waitReason || '这一步没有完成。'
  return `${reason}${task.reconcilable ? '' : task.garmentId ? ' 已保存的照片不受影响，可以重新发起或进衣物详情处理。' : ''}`
}
const canCancel = (task: ExecutionTask) => ['RUNNING', 'QUEUED', 'WAITING_QUOTA'].includes(task.status)
// Only offered when the server can really do it: a local step, or a cloud result that already came back and was kept.
const canRetry = (task: ExecutionTask) => failed(task) && Boolean(task.reconcilable)
// A quick-intake enhancement that failed in the cloud is redone as a new, explicit request (one AI quota).
const canEnhance = (task: ExecutionTask) => failed(task) && !task.reconcilable && task.kind === 'QUICK' && task.pool === 'GENERATION'
const garmentLink = (task: ExecutionTask) => task.garmentId ? { path: `/garment/${task.garmentId}`, query: { task: task.businessId } } : null
const rejected = (task: ExecutionTask) => /HTTP 4\d\d/.test(task.error || '')
function enhanceHint(task: ExecutionTask) { return `使用 1 次 AI 额度重新增强这件衣物；原图和基础图保留。${rejected(task) ? '上次被服务商拒绝，原样重试可能仍失败，也可以进详情描述问题后再增强。' : ''}` }
async function enhance(task: ExecutionTask) {
  busy.value = task.id
  try { await quickApi.enhance(task.businessId, createUuid(), ''); message.success('已重新发起增强，完成后右上角会提醒你'); await load() }
  catch (cause) { if (!isAccountSwitched(cause)) message.error(cause instanceof Error ? cause.message : '重新增强没有发起成功') }
  finally { busy.value = '' }
}
function when(ms: number) {
  const date = new Date(ms), time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return date.toDateString() === new Date().toDateString() ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}
async function load() { if (!mayPoll()) return; try { items.value = (await processingApi.list(1)).items; error.value = '' } catch (cause) { if (!isAccountSwitched(cause)) error.value = cause instanceof Error ? cause.message : String(cause) } }
async function poll() { await load(); if (alive && mayPoll()) timer = window.setTimeout(poll, visible.value.length ? 3000 : 15000) }
async function act(id: string, action: () => Promise<unknown>) { busy.value = id; try { await action(); await load() } catch (cause) { if (!isAccountSwitched(cause)) message.error(cause instanceof Error ? cause.message : String(cause)) } finally { busy.value = '' } }
onMounted(poll); onBeforeUnmount(() => { alive = false; clearTimeout(timer) })
</script>
<template>
  <section v-if="visible.length || error" class="queue-card" aria-label="排队与等待">
    <header class="queue-head">
      <div><h2>排队与等待</h2><p>{{ summary || '暂时无法读取后台排队' }}<template v-if="upkeep"> · 另有 {{ upkeep }} 项衣柜索引在后台更新，无需操作</template></p></div>
      <a-popover trigger="click" placement="bottomRight" title="这里显示什么">
        <template #content><p class="queue-help">每件衣物按步骤依次处理：本地去背景、识别资料、整理图片。这里只列出还在排队、在等额度或需要你决定的步骤；完成的步骤直接看下方任务记录。</p></template>
        <a-button type="text" size="small" aria-label="排队与等待说明"><QuestionCircleOutlined /></a-button>
      </a-popover>
    </header>
    <a-alert v-if="error" type="warning" :message="`排队状态暂时无法更新：${error}`" show-icon class="queue-alert" />
    <ul class="queue-list">
      <li v-for="task in shown" :key="task.id" class="queue-row">
        <component :is="garmentLink(task) ? RouterLink : 'span'" :to="garmentLink(task) || undefined" class="queue-thumb" :aria-label="garmentLink(task) ? '打开这件衣物' : undefined"><img v-if="thumb(task)" :src="thumbUrl(thumb(task), 320)" alt="" loading="lazy" decoding="async" /><PictureOutlined v-else /></component>
        <div class="queue-copy">
          <div class="queue-title"><RouterLink v-if="garmentLink(task)" :to="garmentLink(task)!" class="queue-name">{{ owner(task)?.title || '这件衣物' }}</RouterLink><strong v-else>{{ owner(task)?.title || kindLabel(task) }}</strong><span class="queue-step">{{ poolLabels[task.pool] || '处理' }}</span><span class="queue-state" :class="stateView[task.status]?.tone">{{ stateView[task.status]?.label || task.status }}</span></div>
          <p>{{ explain(task) }}</p>
          <small>{{ kindLabel(task) }} · 加入于 {{ when(task.createdAt) }}</small>
        </div>
        <div class="queue-actions">
          <a-button v-if="task.status === 'WAITING_QUOTA'" size="small" type="primary" :loading="busy === task.id" @click="act(task.id, () => processingApi.resume(task.id))">立即重试</a-button>
          <a-button v-if="canRetry(task)" size="small" type="primary" :loading="busy === task.id" @click="act(task.id, () => processingApi.retry(task.id))">{{ task.pool === 'CPU' ? '恢复本地处理' : '采用已返回结果' }}</a-button>
          <a-popconfirm v-if="canEnhance(task)" :title="enhanceHint(task)" ok-text="重新增强" cancel-text="先不" :overlay-style="{ maxWidth: '300px' }" @confirm="enhance(task)"><a-button size="small" type="primary" :loading="busy === task.id">重新增强</a-button></a-popconfirm>
          <a-button v-if="failed(task) && garmentLink(task)" size="small" @click="router.push(garmentLink(task)!)">{{ canRetry(task) || canEnhance(task) ? '查看衣物' : '去详情重做' }}</a-button>
          <a-button v-if="failed(task)" size="small" type="text" class="queue-ignore" @click="ignore(task)">忽略</a-button>
          <a-popconfirm v-if="canCancel(task)" title="取消这件衣物后面的处理？已完成的步骤会保留。" ok-text="取消处理" cancel-text="继续等待" @confirm="act(task.id, () => processingApi.cancel(task.id))"><a-button size="small" :disabled="busy === task.id">取消处理</a-button></a-popconfirm>
        </div>
      </li>
    </ul>
    <a-button v-if="visible.length > 5" type="link" size="small" class="queue-more" @click="expanded = !expanded">{{ expanded ? '收起' : `展开其余 ${visible.length - 5} 步` }}</a-button>
  </section>
</template>
<style scoped>
.queue-card { margin: 0 0 20px; padding: 18px 20px 8px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.queue-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; }
.queue-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
.queue-head p { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
.queue-help { max-width: 280px; margin: 0; font-size: 13px; line-height: 1.7; }
.queue-alert { margin-bottom: 12px; }
.queue-list { margin: 0; padding: 0; list-style: none; }
.queue-row { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--line); }
.queue-thumb { display: grid; place-items: center; width: 48px; height: 48px; border-radius: var(--radius-sm); overflow: hidden; background: var(--surface-alt); color: var(--muted-subtle); font-size: 18px; }
.queue-thumb img { width: 100%; height: 100%; object-fit: contain; }
.queue-copy { min-width: 0; }
.queue-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.queue-name { font-size: 14px; font-weight: 500; color: var(--ink); }
.queue-name:hover { color: var(--accent); text-decoration: underline; }
a.queue-thumb { cursor: pointer; }
.queue-ignore.ant-btn { color: var(--muted); }
.queue-title strong { font-size: 14px; font-weight: 500; color: var(--ink); }
.queue-step { font-size: 12px; color: var(--muted-strong); }
.queue-state { padding: 0 8px; border-radius: 999px; font-size: 12px; line-height: 20px; background: var(--surface-alt); color: var(--muted-strong); }
.queue-state.running { background: var(--info-bg); color: var(--info); }
.queue-state.quota { background: var(--warning-bg); color: var(--warning); }
.queue-state.failed { background: var(--danger-bg); color: var(--danger); }
.queue-copy p { margin: 4px 0 0; font-size: 12px; line-height: 1.6; color: var(--muted-strong); }
.queue-copy small { display: block; margin-top: 2px; font-size: 12px; color: var(--muted-subtle); font-variant-numeric: tabular-nums; }
.queue-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.queue-actions:empty { display: none; }
.queue-more { margin: 0 0 6px -7px; }
@media (max-width: 767px) {
  .queue-card { padding: 16px 16px 6px; }
  .queue-row { grid-template-columns: 40px minmax(0, 1fr); gap: 12px; }
  .queue-thumb { width: 40px; height: 40px; }
  .queue-actions { grid-column: 2; justify-content: flex-start; }
}
</style>
