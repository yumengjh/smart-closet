import type { ClosetTask } from '../services/api'
import type { IntakeBatch } from '../services/batches'

export type WaitingEntry = {
  key: string; kind: 'task' | 'batch'; id: string; title: string; startedAt: number
  state: 'processing' | 'ready' | 'attention' | 'cancelled'; stage: string; note: string
  href: string; read: boolean; childIds: string[]
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
