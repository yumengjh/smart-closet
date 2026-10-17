import { apiUrl } from './urls'
import { usingMocks } from './api'
export class PlatformRequestError extends Error {
  readonly uncertain: boolean
  readonly status?: number
  readonly code?: string
  constructor(message: string, uncertain = false, status?: number, code?: string) {
    super(message); this.name = 'PlatformRequestError'; this.uncertain = uncertain; this.status = status; this.code = code
  }
}
export async function platformRequest<T>(path: string, method = 'GET', body?: unknown, idempotencyKey?: string, options: { timeoutMs?: number } = {}): Promise<T> {
  if (usingMocks) throw new Error('演示模式不提供真实个人资料或生成。')
  const headers = new Headers(), controller = new AbortController()
  const write = !['GET', 'HEAD'].includes(method), multipart = body instanceof FormData
  let sent = false, timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 30000)
  try {
    if (body !== undefined && !multipart) headers.set('Content-Type', 'application/json')
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
    if (write) {
      const csrf = await fetch(apiUrl('/api/auth/csrf'), { credentials: 'include', signal: controller.signal })
      if (!csrf.ok) throw new PlatformRequestError(csrf.status === 401 ? '登录已失效，请重新登录。' : '无法获取提交凭证，请稍后重试。', false, csrf.status)
      headers.set('X-XSRF-TOKEN', (await csrf.json()).token)
    }
    sent = write
    const response = await fetch(apiUrl(path), { method, headers, credentials: 'include', signal: controller.signal, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) })
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new Event('closet-session-expired'))
      const error = await response.json().catch(() => ({}))
      throw new PlatformRequestError(error.message || `请求未完成 (${response.status})`, write && (response.status >= 500 || response.status === 408), response.status, error.code)
    }
    return response.status === 204 ? undefined as T : await response.json()
  } catch (error) {
    if (error instanceof PlatformRequestError) throw error
    throw new PlatformRequestError(timedOut ? '请求超时，请核对提交结果。' : sent ? '连接中断，尚无法确认提交结果。' : '暂时无法连接到服务，请检查连接后重试。', sent)
  } finally { clearTimeout(timer) }
}
export type Worn = { garmentId: string; revision: number; label: string; role: string; referenceAssetId: string; position: string }
export type Review = { items: Worn[]; slots: { role: string; label: string; state: string; items: Worn[] }[]; blockers: { code: string; message: string; action: string }[]; warnings: { code: string; message: string }[]; fingerprint: string; ruleVersion: string }
export type Profile = { revision: number; sex: string | null; heightCm: number | null; weightKg: number | null; bodyShape: string | null; measurements: Record<string, number>; preferences: Record<string, string>; defaultBaselineId: string | null }
export type ProfileSnapshot = { sex: string; heightCm: number; weightKg: number; bodyShape: string; sources: Record<string, string>; profileRevision: number }
export type Baseline = { id: string; revision: number; status: string; mediaUrl: string | null; sourcePhotoId: string | null; profile: ProfileSnapshot; createdAt: number; currentDefault: boolean; name: string | null }
export type RenderJob = { id: string; purpose: string; status: string; mediaUrl: string | null; baselineId: string | null; planId: string | null; error: string | null; feedback: string | null; createdAt: number; parentJobId: string | null; summary: RenderSummary | null }
export type BodyAdjustments = Partial<Record<'build' | 'shoulders' | 'waist' | 'hips' | 'legs', number>>
export type RenderSummary = { kind?: 'OOTD' | 'ADJUST'; retryOf?: string; model?: string; pose?: string; adjustments?: BodyAdjustments }
export type PoseJoint = 'HEAD' | 'NECK' | 'L_SHOULDER' | 'R_SHOULDER' | 'L_ELBOW' | 'R_ELBOW' | 'L_WRIST' | 'R_WRIST' | 'L_HIP' | 'R_HIP' | 'L_KNEE' | 'R_KNEE' | 'L_ANKLE' | 'R_ANKLE'
export type Pose = { id: string; name: string; source: 'PRESET' | 'PHOTO' | 'TEXT'; description: string; tags: string[]; keypoints: Partial<Record<PoseJoint, [number, number]>>; viewAngle: string | null; createdAt: number }
export type PoseCatalog = { presets: Pose[]; mine: Pose[]; extractionsToday: number; dailyExtractions: number }
export type PoseChoice = { mode: 'AUTO' } | { mode: 'PRESET' | 'CUSTOM'; id: string }
export type Capability = { provider: string; model: string; purpose: string; maxReferences: number; verified: boolean; version: number; notes: string }

export type RenderSubmission = { found: boolean; job: RenderJob | null }
