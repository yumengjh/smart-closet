import type { RenderJob } from '../services/platform'

/** What a generation that has no picture means for the person, and what they may do about it. */
export type JobAdvice = { label: string; title: string; body: string; tone: 'running' | 'warning' | 'failed' | 'neutral'; canRetry: boolean; canCancel: boolean; canDelete: boolean }

const RUNNING = new Set(['QUEUED', 'RUNNING', 'WAITING_RESOURCE'])

export function hasPicture(job: Pick<RenderJob, 'mediaUrl'>) { return Boolean(job.mediaUrl) }

export function adviceFor(job: Pick<RenderJob, 'status' | 'error' | 'mediaUrl'>): JobAdvice {
  if (job.mediaUrl) return { label: '已完成', title: '这张图已经生成', body: '', tone: 'neutral', canRetry: false, canCancel: false, canDelete: true }
  if (RUNNING.has(job.status)) return { label: job.status === 'QUEUED' ? '排队中' : job.status === 'WAITING_RESOURCE' ? '等待资源' : '生成中',
    title: '正在生成', body: '一般需要几十秒到两三分钟，做好后会提醒你。可以先离开这个页面。', tone: 'running', canRetry: false, canCancel: true, canDelete: false }
  if (job.status === 'CANCEL_REQUESTED') return { label: '正在停止', title: '正在停止', body: '已经请求停止；已发出的请求无法保证上游停止或退还额度。', tone: 'running', canRetry: false, canCancel: false, canDelete: false }
  if (job.status === 'DELETE_PENDING') return { label: '正在清理', title: '正在清理图片', body: '清理完成后这条记录会消失。', tone: 'neutral', canRetry: false, canCancel: false, canDelete: false }
  if (job.status === 'UNKNOWN') return { label: '生成中断', title: '这次生成中断了，结果待核实',
    body: `${job.error || '请求已经发给模型，但没有收到明确结果（常见原因：服务重启或网络中断）。'}\n为避免重复扣额度，不会自动重发。你可以手动重新生成，会再用 1 个图像额度。`, tone: 'warning', canRetry: true, canCancel: false, canDelete: true }
  if (job.status === 'CANCELLED') return { label: '已取消', title: '这次生成已取消', body: '没有生成图片。想要的话可以重新生成。', tone: 'neutral', canRetry: true, canCancel: false, canDelete: true }
  if (job.status === 'FAILED') return { label: '未完成', title: '这次生成没有完成', body: `${job.error || '模型没有返回可用的图片。'}\n可以直接重新生成，会再用 1 个图像额度。`, tone: 'failed', canRetry: true, canCancel: false, canDelete: true }
  return { label: job.status, title: '状态未知', body: job.error || '', tone: 'neutral', canRetry: false, canCancel: false, canDelete: true }
}

export type RouteTarget = { action: 'view' | 'status' | 'missing' | 'wait'; job?: RenderJob }
/** Deep link /ootd?job=…: a picture opens the viewer, a job without one opens its status, an unknown id is reported. */
export function routeTarget(id: string, jobs: RenderJob[], loaded: boolean): RouteTarget {
  if (!id) return { action: 'wait' }
  const job = jobs.find(j => j.id === id)
  if (job) return { action: job.mediaUrl ? 'view' : 'status', job }
  return { action: loaded ? 'missing' : 'wait' }
}
