<script setup lang="ts">
import RenderTasksOverview from '../components/RenderTasksOverview.vue'
import ExecutionTasks from '../components/ExecutionTasks.vue'
import { mediaUrl } from '../services/urls'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { App as AntApp } from 'ant-design-vue'
import { ArrowRightOutlined, HistoryOutlined, PictureOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, StopOutlined, ExclamationCircleOutlined, MinusCircleOutlined } from '@ant-design/icons-vue'
import { closetApi, type ClosetTask } from '../services/api'
import { taskLabels, isProcessing } from '../domain/workflow'
const { modal } = AntApp.useApp(), router = useRouter()
const tasks = ref<ClosetTask[]>([]); const loading = ref(true); const error = ref(''); const cancelling = ref(''); const filter = ref('全部')
let timer = 0; let alive = false; let delay = 2000
const runningCount = computed(() => tasks.value.filter(task => isProcessing(task.status)).length)
const needsCheck = (task: ClosetTask) => ['FAILED', 'UNKNOWN', 'NEEDS_REVIEW'].includes(task.status)
const matches = (task: ClosetTask, name: string) => name === '全部' || (name === '处理中' ? isProcessing(task.status) : name === '需检查' ? needsCheck(task) : !isProcessing(task.status))
const filtered = computed(() => tasks.value.filter(task => matches(task, filter.value)))
const filters = computed(() => ['全部', '处理中', '已结束', '需检查'].map(name => ({ value: name, label: `${name} ${tasks.value.filter(task => matches(task, name)).length}` })))
function when(value: string) {
  const date = new Date(value), time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return date.toDateString() === new Date().toDateString() ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}
const stepNote = (step: ClosetTask['steps'][number]) => step.status === 'skipped' ? step.name === '制作贴纸' ? '尚未制作' : '已跳过' : step.status === 'review' ? '需检查' : ''
async function load() { try { const response = await closetApi.tasks(); if (!alive) return; tasks.value = response; error.value = ''; delay = 2000 } catch (cause) { error.value = cause instanceof Error ? cause.message : '任务暂时无法加载。'; delay = Math.min(delay * 2, 30000) } finally { loading.value = false } }
function cancel(task: ClosetTask) { modal.confirm({ title: '取消这次处理？', content: '原图与已完成步骤的图片会保留，需要等待服务端终止任务。', okText: '取消处理', cancelText: '继续等待', onOk: async () => { cancelling.value = task.id; try { await closetApi.cancel(task.id); await load() } catch (cause) { error.value = String(cause) } finally { cancelling.value = ''; poll() } } }) }
function poll() { window.clearTimeout(timer); if (alive && (runningCount.value || error.value)) timer = window.setTimeout(async () => { await load(); poll() }, delay) }
onMounted(async () => { alive = true; await load(); poll() }); onUnmounted(() => { alive = false; window.clearTimeout(timer) })
</script>
<template>
  <header class="page-heading"><div><h1>任务记录</h1><p class="page-subtitle">每件衣物从上传到入柜的处理步骤和结果。快速入柜会自动完成，其他整理方式可以逐件核对。</p></div><span v-if="runningCount" class="state-badge running"><LoadingOutlined spin /> {{ runningCount }} 项处理中</span></header>
  <ExecutionTasks :tasks="tasks" />
  <RenderTasksOverview />
  <div class="list-toolbar tasks-toolbar"><a-segmented v-model:value="filter" :options="filters" /><span class="muted">显示最近 50 项</span></div>
  <a-alert v-if="error" type="warning" :message="`无法更新任务状态：${error}，正在重新连接。`" show-icon class="page-alert" />
  <a-skeleton v-if="loading" active :paragraph="{ rows: 6 }" />
  <section v-else-if="filtered.length" class="task-list" aria-label="任务列表">
    <article v-for="task in filtered" :key="task.id" class="task-card" :title="`任务编号 ${task.id}`">
      <div class="task-thumbnail"><img v-if="task.outputUrl || task.inputUrl" :src="mediaUrl(task.outputUrl || task.inputUrl)" alt="任务图片" loading="lazy" /><PictureOutlined v-else /><span>{{ task.outputUrl && task.outputUrl !== task.inputUrl ? '结果' : '原图' }}</span></div>
      <div class="task-main">
        <div class="task-title-row"><h2>{{ task.title }}</h2><span class="state-badge" :class="task.status.toLowerCase()">{{ taskLabels[task.status] }}</span></div>
        <p class="task-meta">{{ task.mode }}<i aria-hidden="true">·</i><time :datetime="task.createdAt">{{ when(task.createdAt) }}</time></p>
        <ol class="task-steps" aria-label="处理步骤">
          <li v-for="(step, index) in task.steps" :key="index" :class="step.status"><CheckCircleOutlined v-if="step.status === 'completed'" /><LoadingOutlined v-else-if="step.status === 'running'" spin /><CloseCircleOutlined v-else-if="step.status === 'failed'" /><ExclamationCircleOutlined v-else-if="step.status === 'review'" /><MinusCircleOutlined v-else-if="step.status === 'skipped'" /><ClockCircleOutlined v-else /><span>{{ step.name }}</span><small v-if="stepNote(step)">{{ stepNote(step) }}</small></li>
        </ol>
        <p v-if="task.note" class="task-note">{{ task.note }}</p>
      </div>
      <div class="task-actions">
        <a-button v-if="task.garmentId" :type="needsCheck(task) ? 'primary' : 'default'" @click="router.push({ path: `/garment/${task.garmentId}`, query: { task: task.id } })">{{ isProcessing(task.status) ? '查看进度' : needsCheck(task) ? '去检查' : '查看结果' }}<ArrowRightOutlined /></a-button>
        <a-button v-if="isProcessing(task.status)" :disabled="task.status === 'CANCEL_REQUESTED' || Boolean(cancelling)" :loading="cancelling === task.id" @click="cancel(task)"><StopOutlined /> 取消</a-button>
      </div>
    </article>
  </section>
  <section v-else class="empty-wardrobe compact-empty"><span class="empty-spark"><HistoryOutlined /></span><h2>没有{{ filter === '全部' ? '' : filter }}任务</h2><p>上传衣物后，服务端保存的处理记录会显示在这里。</p><RouterLink to="/add" class="outline-button">添加衣物</RouterLink></section>
</template>
<style scoped>
.tasks-toolbar { margin-bottom: 16px; }
.task-list { display: grid; gap: 12px; }
.task-card { display: grid; grid-template-columns: 88px minmax(0, 1fr) 148px; align-items: center; gap: 20px; padding: 16px 20px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.task-thumbnail { position: relative; display: grid; place-items: center; width: 88px; height: 96px; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-alt); color: var(--muted-subtle); font-size: 24px; }
.task-thumbnail img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
.task-thumbnail span { position: absolute; left: 4px; bottom: 4px; padding: 0 6px; border-radius: var(--radius-sm); background: var(--overlay); color: var(--muted-strong); font-size: 11px; line-height: 18px; }
.task-main { min-width: 0; }
.task-title-row { display: flex; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: 6px 10px; }
.task-title-row h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--ink); }
.task-title-row .state-badge { padding: 0 8px; line-height: 22px; border-radius: 999px; }
.task-meta { display: flex; align-items: center; gap: 6px; margin: 4px 0 10px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.task-meta i { font-style: normal; color: var(--muted-subtle); }
.task-steps { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.task-steps li { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--surface-alt); color: var(--muted-subtle); font-size: 12px; }
.task-steps li small { font-size: 11px; color: inherit; opacity: .8; }
.task-steps .completed { color: var(--success); background: var(--success-bg); }
.task-steps .running { color: var(--accent); background: var(--accent-soft); }
.task-steps .review { color: var(--warning); background: var(--warning-bg); }
.task-steps .failed { color: var(--danger); background: var(--danger-bg); }
.task-note { margin: 10px 0 0; font-size: 12px; line-height: 1.7; color: var(--warning); }
.task-actions { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.task-actions .ant-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
@media (max-width: 1023px) {
  .task-card { grid-template-columns: 80px minmax(0, 1fr); gap: 16px; }
  .task-thumbnail { width: 80px; height: 88px; }
  .task-actions { grid-column: 2; flex-direction: row; justify-content: flex-start; }
}
@media (max-width: 767px) {
  .task-card { grid-template-columns: 64px minmax(0, 1fr); gap: 12px; padding: 14px; align-items: start; }
  .task-thumbnail { width: 64px; height: 72px; }
  .task-actions { grid-column: 1 / -1; }
  .task-actions .ant-btn { flex: 1; }
}
</style>
