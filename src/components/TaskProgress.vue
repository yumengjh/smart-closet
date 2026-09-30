<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircleOutlined, LoadingOutlined, ClockCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import type { ClosetTask } from '../services/api'
import { isProcessing, processingSeconds, taskLabels } from '../domain/workflow'
const props = defineProps<{ task: ClosetTask; now?: number }>()
const elapsed = computed(() => {
  const seconds = processingSeconds(props.task, props.now)
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`
})
const labels = { completed: '已结束', running: '执行中', failed: '失败', waiting: '等待', review: '需检查', skipped: '已跳过' }
const icons = { completed: CheckCircleOutlined, running: LoadingOutlined, failed: CloseCircleOutlined, waiting: ClockCircleOutlined, review: ExclamationCircleOutlined, skipped: ClockCircleOutlined }
function duration(start?: string, end?: string) { if (!start || !end) return ''; return `${Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000))} 秒` }
function stepMessage(message: string) { return message.replace('；可选用此图继续本地处理，不会重新生图。', '，贴纸步骤已暂停。') }
</script>
<template>
  <section class="progress-panel">
    <div class="panel-heading"><h2>处理进度</h2><span class="state-badge" :class="task.status.toLowerCase()">{{ taskLabels[task.status] }}</span></div>
    <p class="progress-meta">{{ task.mode }}<span>{{ isProcessing(task.status) ? '已等待' : '总耗时' }} {{ elapsed }}</span></p>
    <ol class="progress-steps"><li v-for="(step, index) in task.steps" :key="index" :class="step.status"><component :is="icons[step.status]" :spin="step.status === 'running'" /><div><strong>{{ step.name }}</strong><p v-if="step.error">{{ stepMessage(step.error) }}</p></div><span>{{ labels[step.status] }}<small v-if="duration(step.startedAt, step.finishedAt)">{{ duration(step.startedAt, step.finishedAt) }}</small></span></li></ol>
    <div v-if="task.attempts?.length" class="model-attempts"><p v-for="(attempt, index) in task.attempts" :key="index"><span>{{ attempt.model }}</span><small>{{ attempt.status === 'SUCCEEDED' ? '服务端调用结束' : ['RUNNING', 'DISPATCHING'].includes(attempt.status) ? '服务端调用中' : attempt.status === 'FAILED' ? '调用失败' : attempt.status === 'UNKNOWN' ? '调用结果待核实' : '等待服务端确认' }}</small></p></div>
    <p class="task-reference">任务 {{ task.id.slice(0, 8) }} · {{ new Date(task.createdAt).toLocaleString('zh-CN') }}</p>
  </section>
</template>
