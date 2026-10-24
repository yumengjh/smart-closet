import type { ClosetTask } from '../services/api'
import type { IntakeBatch } from '../services/batches'
import type { RenderJob } from '../services/platform'
import type { BatchRecognize } from '../services/api'

export type WaitingEntry = {
  key: string; kind: 'task' | 'batch' | 'render' | 'bulk'; id: string; title: string; startedAt: number
  state: 'processing' | 'ready' | 'attention' | 'cancelled'; stage: string; note: string
  href: string; read: boolean; childIds: string[]
  /** Finished image shown beside the result (generated pictures only). */
  thumb?: string
  /** 0..1 when the work can say how far it is (bulk re-recognition). */
  progress?: number
}
const running = (status: string) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(status)
export const batchIsProcessing = (batch: IntakeBatch) =>
  batch.calls.some(call => running(call.status)) || batch.targets.some(target => running(target.status))

export function taskEntry(task: ClosetTask): WaitingEntry {
  const state = running(task.status) ? 'processing' : task.status === 'CANCELLED' ? 'cancelled'
    : ['FAILED', 'UNKNOWN', 'NEEDS_REVIEW'].includes(task.status) ? 'attention' : 'ready'
  const stage = state === 'processing'
    ? task.status === 'CANCEL_REQUESTED' ? '正在取消处理' : task.steps.filter(step => step.status === 'running').map(step => step.name).join(' · ') || '等待处理'
    : task.status === 'FAILED' ? '处理未完成，请检查' : task.status === 'UNKNOWN' ? '调用结果待核实'
    : task.status === 'CANCELLED' ? '已取消，原图保留' : task.status === 'NEEDS_REVIEW' ? '结果需要检查' : '处理完成，可以核对'
  return { key: `task:${task.id}`, kind: 'task', id: task.id, title: task.title || '新上传衣物',
    startedAt: Date.parse(task.createdAt), state, stage, note: task.note || '', read: false, childIds: [],
    href: task.garmentId ? `/garment/${task.garmentId}?task=${task.id}` : '/tasks' }
}

export function batchEntry(batch: IntakeBatch): WaitingEntry {
  const active = batchIsProcessing(batch)
  const completed = batch.targets.filter(target => target.outputUrl && ['SUCCEEDED', 'NEEDS_REVIEW'].includes(target.status)).length
  const failed = Boolean(batch.error) || batch.targets.some(target => ['FAILED', 'UNKNOWN', 'INTERRUPTED'].includes(target.status)) || !batch.targets.length && ['FAILED', 'UNKNOWN'].includes(batch.calls.at(-1)?.status || '')
  const review = batch.targets.some(target => target.status === 'NEEDS_REVIEW')
  const cancelled = !active && !completed && batch.targets.length > 0 && batch.targets.every(target => ['CANCELLED', 'SKIPPED'].includes(target.status))
  const recognizing = batch.calls.some(call => call.type === 'RECOGNIZE' && running(call.status))
  const stage = active ? recognizing ? '正在识别衣物' : `正在整理 · ${completed} / ${batch.targets.length} 件已有结果`
    : failed ? '部分处理未完成，请检查' : cancelled ? '处理已结束，需检查照片'
    : review ? `${completed} 件已有结果，部分需要检查` : completed ? `${completed} 件已有结果，可以核对` : '识别已结束，可以继续整理'
  const startedAt = Math.max(batch.createdAtMs, ...batch.calls.map(call => call.startedAtMs))
  return { key: `batch:${batch.id}`, kind: 'batch', id: batch.id, title: '多件衣物整理', startedAt,
    state: active ? 'processing' : failed || cancelled || review ? 'attention' : 'ready', stage, note: batch.error || '', read: false,
    href: `/batches/${batch.id}`, childIds: batch.targets.flatMap(target => target.jobId ? [target.jobId] : []) }
}

export function elapsedLabel(start: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - start) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

const renderRunning = ['QUEUED', 'WAITING_RESOURCE', 'RUNNING', 'CANCEL_REQUESTED']
const renderStages: Record<string, string> = { QUEUED: '排队中，马上开始', WAITING_RESOURCE: '等待生成资源', RUNNING: '正在上身绘制', CANCEL_REQUESTED: '正在停止' }
/** Generated pictures (model, OOTD, body adjustment) share the processing centre with garment tasks. */
export function renderEntry(job: RenderJob): WaitingEntry {
  const state = renderRunning.includes(job.status) ? 'processing' : job.status === 'SUCCEEDED' ? 'ready'
    : ['CANCELLED', 'DELETED', 'DELETE_PENDING'].includes(job.status) ? 'cancelled' : 'attention'
  const title = job.purpose === 'BASELINE' ? '模特形象' : job.summary?.kind === 'ADJUST' ? '身材调整图'
    : ['OOTD 穿搭图', job.summary?.pose].filter(Boolean).join(' · ')
  const stage = state === 'processing' ? renderStages[job.status] || '正在生成'
    : state === 'ready' ? (job.purpose === 'BASELINE' ? '模特画好了，去确认' : '穿搭图好了，去看看')
    : state === 'cancelled' ? '已停止生成' : job.status === 'UNKNOWN' ? '结果待核实，不会自动重发' : '生成未完成'
  return { key: `render:${job.id}`, kind: 'render', id: job.id, title, startedAt: job.createdAt, state, stage,
    note: state === 'processing' ? '通常 1 分钟左右，好了会提醒你' : job.error || '', read: false, childIds: [],
    href: job.purpose === 'BASELINE' ? '/settings?section=personal' : `/ootd?job=${job.id}`,
    thumb: state === 'ready' && job.mediaUrl ? job.mediaUrl : undefined }
}

/** One entry for a whole batch of re-recognitions, so hundreds of tasks do not flood the centre (the tasks are its children). */
export function bulkEntry(batch: BatchRecognize): WaitingEntry {
  const submitting = !batch.finished
  const working = submitting || batch.completed < batch.submitted
  const failedTasks = batch.completed - batch.succeeded
  const stage = submitting ? `正在提交 ${batch.submitted + batch.failed} / ${batch.total} 件，已完成 ${batch.completed} 件`
    : working ? `已提交 ${batch.submitted} 件，已完成 ${batch.completed} / ${batch.submitted}`
    : batch.failed || failedTasks ? `完成 ${batch.succeeded} 件，${batch.failed + failedTasks} 件未成功，请检查`
    : `${batch.succeeded} 件都识别完了`
  const note = batch.failures.slice(0, 3).map(item => item.message).join('；')
  return { key: `bulk:${batch.id}`, kind: 'bulk', id: batch.id, title: `批量重新识别资料（${batch.total} 件）`, startedAt: batch.createdAtMs,
    state: working ? 'processing' : batch.failed || failedTasks ? 'attention' : 'ready', stage, note, read: false,
    href: '/tasks', childIds: batch.jobIds, progress: batch.total ? Math.min(1, (batch.completed + batch.failed) / batch.total) : 1 }
}
