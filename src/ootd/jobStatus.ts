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

const ENDED = new Set(['UNKNOWN', 'FAILED', 'CANCELLED'])
/** Ended without a picture: the jobs the failure area collects (issue #106). */
export function isFailure(job: Pick<RenderJob, 'status' | 'mediaUrl'>) { return !job.mediaUrl && ENDED.has(job.status) }

/** One short, plain reason for a failure card; the full text stays in the status dialog. */
export function failureReason(job: Pick<RenderJob, 'status' | 'error'>): string {
  if (job.status === 'UNKNOWN') return '生成中断，结果待核实'
  if (job.status === 'CANCELLED') return '已取消，没有出图'
  const error = (job.error || '').trim()
  if (!error) return '模型没有返回可用的图片'
  if (/超时|timeout/i.test(error)) return '服务商响应超时'
  if (/审核|安全策略|违规|policy|safety|moderation/i.test(error)) return '被服务商的内容审核拦下，可换动作或衣物再试'
  if (/额度|quota/i.test(error)) return '图像额度不足'
  if (/连接|网络|connect|network/i.test(error)) return '连接服务商失败'
  if (/变化|已改变|已删除|已清理/.test(error)) return '原资料已变化，请回到上方重新准备'
  if (/[一-鿿]/.test(error)) return error.split(/[；。\n]/)[0].slice(0, 40)
  return '模型没有返回可用的图片'
}

export type RetryState = 'open' | 'retrying' | 'replaced'
export type RecordGroups = { running: RenderJob[]; done: RenderJob[]; failed: RenderJob[]; replaced: RenderJob[]; retryState: Map<string, RetryState>; replacedBy: Map<string, string> }
/**
 * Splits the OOTD records (issue #106): pictures by time, running jobs, and failures. A failure whose retry chain (retryOf,
 * also through failed retries) produced a picture is "replaced" and folded away; one with a retry still running is "retrying".
 */
export function groupRecords(jobs: RenderJob[]): RecordGroups {
  const byTime = [...jobs].sort((a, b) => b.createdAt - a.createdAt)
  const children = new Map<string, RenderJob[]>()
  for (const j of byTime) { const parent = j.summary?.retryOf; if (parent) children.set(parent, [...(children.get(parent) || []), j]) }
  const retryState = new Map<string, RetryState>(), replacedBy = new Map<string, string>()
  const walk = (id: string, seen: Set<string>): { state: RetryState; by?: string } => {
    let state: RetryState = 'open'; let by: string | undefined
    for (const child of children.get(id) || []) {
      if (seen.has(child.id)) continue; seen.add(child.id)
      if (child.mediaUrl) return { state: 'replaced', by: child.id }
      if (RUNNING.has(child.status)) state = 'retrying'
      const deeper = walk(child.id, seen)
      if (deeper.state === 'replaced') return deeper
      if (deeper.state === 'retrying') state = 'retrying'
    }
    return { state, by }
  }
  const running: RenderJob[] = [], done: RenderJob[] = [], failed: RenderJob[] = [], replaced: RenderJob[] = []
  for (const j of byTime) {
    if (j.mediaUrl) { done.push(j); continue }
    if (!isFailure(j)) { running.push(j); continue }
    const r = walk(j.id, new Set([j.id])); retryState.set(j.id, r.state); if (r.by) replacedBy.set(j.id, r.by)
    ;(r.state === 'replaced' ? replaced : failed).push(j)
  }
  return { running, done, failed, replaced, retryState, replacedBy }
}
