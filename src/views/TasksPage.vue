<script setup lang="ts">
import RenderTasksOverview from '../components/RenderTasksOverview.vue'
import ExecutionTasks from '../components/ExecutionTasks.vue'
import { mediaUrl } from '../services/urls'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { App as AntApp } from 'ant-design-vue'
import { ArrowRightOutlined, HistoryOutlined, PictureOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, StopOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { closetApi, type ClosetTask } from '../services/api'
import { taskLabels, isProcessing } from '../domain/workflow'
const { modal } = AntApp.useApp()
const tasks = ref<ClosetTask[]>([]); const loading = ref(true); const error = ref(''); const cancelling = ref(''); const filter = ref('全部')
let timer = 0; let alive = false; let delay = 2000
const runningCount = computed(() => tasks.value.filter(task => isProcessing(task.status)).length)
const filtered = computed(() => tasks.value.filter(task => filter.value === '全部' || (filter.value === '处理中' ? isProcessing(task.status) : filter.value === '需检查' ? ['FAILED', 'UNKNOWN', 'NEEDS_REVIEW'].includes(task.status) : !isProcessing(task.status))))
async function load() { try { const response = await closetApi.tasks(); if (!alive) return; tasks.value = response; error.value = ''; delay = 2000 } catch (cause) { error.value = cause instanceof Error ? cause.message : '任务暂时无法加载。'; delay = Math.min(delay * 2, 30000) } finally { loading.value = false } }
function cancel(task: ClosetTask) { modal.confirm({ title: '取消这次处理？', content: '原图与已完成步骤的图片会保留，需要等待服务端终止任务。', okText: '取消处理', cancelText: '继续等待', onOk: async () => { cancelling.value = task.id; try { await closetApi.cancel(task.id); await load() } catch (cause) { error.value = String(cause) } finally { cancelling.value = ''; poll() } } }) }
function poll() { window.clearTimeout(timer); if (alive && (runningCount.value || error.value)) timer = window.setTimeout(async () => { await load(); poll() }, delay) }
onMounted(async () => { alive = true; await load(); poll() }); onUnmounted(() => { alive = false; window.clearTimeout(timer) })
</script>
<template>
  <header class="page-heading"><div><h1>任务记录</h1><p class="page-subtitle">查看每次真实处理的步骤和结果。快录会自动入柜，其他整理工具仍可逐件确认。</p></div><span v-if="runningCount" class="state-badge running"><LoadingOutlined spin /> {{ runningCount }} 项处理中</span></header>
  <ExecutionTasks />
  <RenderTasksOverview />
  <div class="list-toolbar"><a-segmented v-model:value="filter" :options="['全部', '处理中', '已结束', '需检查']" /><span class="muted">最近 50 项</span></div>
  <a-alert v-if="error" type="warning" :message="`无法更新任务状态：${error}，正在重新连接。`" show-icon class="page-alert" />
  <a-skeleton v-if="loading" active :paragraph="{ rows: 6 }" />
  <section v-else-if="filtered.length" class="task-list" aria-label="任务列表"><article v-for="task in filtered" :key="task.id" class="task-card"><div class="task-thumbnail"><img v-if="task.outputUrl || task.inputUrl" :src="mediaUrl(task.outputUrl || task.inputUrl)" alt="任务图片" /><PictureOutlined v-else /><span>{{ task.outputUrl && task.outputUrl !== task.inputUrl ? '结果' : '原图' }}</span></div><div class="task-main"><div class="task-title-row"><h2>{{ task.title }}</h2><span class="state-badge" :class="task.status.toLowerCase()">{{ taskLabels[task.status] }}</span></div><p class="task-meta">{{ task.mode }} · {{ new Date(task.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }} · {{ task.id.slice(0, 8) }}</p><div class="task-steps"><span v-for="(step, index) in task.steps" :key="index" :class="step.status"><CheckCircleOutlined v-if="step.status === 'completed'" /><LoadingOutlined v-else-if="step.status === 'running'" spin /><CloseCircleOutlined v-else-if="step.status === 'failed'" /><ExclamationCircleOutlined v-else-if="step.status === 'review'" /><ClockCircleOutlined v-else />{{ step.name }}<span v-if="step.status === 'skipped'">（{{ step.name === '制作贴纸' ? '尚未制作' : '已跳过' }}）</span><span v-if="step.status === 'review'">（需检查）</span></span></div><p v-if="task.note" class="task-note">{{ task.note }}</p></div><div class="task-actions"><RouterLink v-if="task.garmentId" :to="{ path: `/garment/${task.garmentId}`, query: { task: task.id } }" class="task-action">{{ isProcessing(task.status) ? '查看进度' : '查看图片与结果' }}<ArrowRightOutlined /></RouterLink><a-button v-if="isProcessing(task.status)" :disabled="task.status === 'CANCEL_REQUESTED' || Boolean(cancelling)" :loading="cancelling === task.id" @click="cancel(task)"><StopOutlined /> 取消</a-button></div></article></section>
  <section v-else class="empty-wardrobe compact-empty"><span class="empty-spark"><HistoryOutlined /></span><h2>没有{{ filter === '全部' ? '' : filter }}任务</h2><p>上传衣物后，服务端保存的处理记录会显示在这里。</p><RouterLink to="/add" class="outline-button">添加衣物</RouterLink></section>
</template>
