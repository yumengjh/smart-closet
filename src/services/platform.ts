import { apiUrl } from './urls'
import { usingMocks } from './api'
import { AccountSwitchedError, accountHeaders, captureAccount } from '../domain/accountSession'
import { signalSessionExpired } from '../domain/sessionNotice'
export class PlatformRequestError extends Error {
  readonly uncertain: boolean
  readonly status?: number
  readonly code?: string
  constructor(message: string, uncertain = false, status?: number, code?: string) {
    super(message); this.name = 'PlatformRequestError'; this.uncertain = uncertain; this.status = status; this.code = code
  }
}
export async function platformRequest<T>(path: string, method = 'GET', body?: unknown, idempotencyKey?: string, options: { timeoutMs?: number; responseType?: 'json' | 'blob'; anonymous?: boolean } = {}): Promise<T> {
  if (usingMocks) throw new Error('演示模式不提供真实个人资料或生成。')
  // Only the official showcase list is anonymous. Private reads retain their account and session guards.
  const anonymous = options.anonymous === true
  if (anonymous && (method !== 'GET' || body !== undefined || idempotencyKey !== undefined || path !== '/api/public/creations/showcases')) throw new Error('匿名请求只支持官方精选列表。')
  const headers = new Headers(), controller = new AbortController()
  const write = !['GET', 'HEAD'].includes(method), multipart = body instanceof FormData
  const stillSameAccount = anonymous ? () => {} : captureAccount()
  let sent = false, timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 30000)
  try {
    if (body !== undefined && !multipart) headers.set('Content-Type', 'application/json')
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
    if (write) {
      const csrf = await fetch(apiUrl('/api/auth/csrf'), { credentials: 'include', signal: controller.signal })
      if (!csrf.ok) throw new PlatformRequestError(csrf.status === 401 ? '登录已失效，请重新登录。' : '无法获取提交凭证，请稍后重试。', false, csrf.status)
      headers.set('X-XSRF-TOKEN', (await csrf.json()).token)
      // The shared cookie may have changed hands while the token was fetched; a stale page must not submit.
      stillSameAccount()
      for (const [name, value] of Object.entries(accountHeaders(path))) headers.set(name, value)
    }
    sent = write
    const response = await fetch(apiUrl(path), { method, headers, credentials: anonymous ? 'omit' : 'include', ...(anonymous ? { cache: 'no-store' as const } : {}), signal: controller.signal, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      if (!anonymous && response.status === 401) signalSessionExpired(error.code)
      if (!anonymous && response.status === 409 && error.code === 'ACCOUNT_MISMATCH') window.dispatchEvent(new Event('closet-account-mismatch'))
      throw new PlatformRequestError(error.message || error.detail || `请求未完成 (${response.status})`, write && (response.status >= 500 || response.status === 408), response.status, error.code)
    }
    stillSameAccount()
    if (response.status === 204) return undefined as T
    const result = options.responseType === 'blob' ? await response.blob() : await response.json()
    stillSameAccount()
    return result as T
  } catch (error) {
    if (error instanceof PlatformRequestError || error instanceof AccountSwitchedError) throw error
    throw new PlatformRequestError(timedOut ? '请求超时，请核对提交结果。' : sent ? '连接中断，尚无法确认提交结果。' : '暂时无法连接到服务，请检查连接后重试。', sent)
  } finally { clearTimeout(timer) }
}
/** 穿上身规则 composition-v2（server 设计 2026-11-21 3.1）：layer、parts、asks、blockers[].fix 只在 v2 出现；开关关闭（v1）时 parts/asks 为空、fix/layer 为 null。 */
export type Layer = 'INNER' | 'MAIN' | 'OUTER'
export type Worn = { garmentId: string; revision: number; label: string; role: string; referenceAssetId: string; position: string; layer?: Layer | null }
export type PartKey = 'FULL' | 'UPPER' | 'LOWER' | 'OUTER' | 'SHOES' | 'EXTRA'
export type PartItem = { garmentId: string; label: string; layer: Layer; position: string | null; note: string | null }
/** state：NONE 只用于鞋（不穿鞋）。 */
export type Part = { part: PartKey; label: string; state: 'OK' | 'MISSING' | 'NONE'; items: PartItem[] }
export type Ask = { code: 'CHOOSE_INNER' | 'CHOOSE_ONE' | 'CHOOSE_PART'; garmentIds: string[]; message: string }
export type ReviewFix = 'ADD_TOP' | 'ADD_BOTTOM' | 'ADD_MAIN' | 'REPLACE'
/** garmentId：与某件衣服有关的拦截（REPLACE、ROLE_CONFLICT、ACCESSORY_POSITION_CONFLICT、GARMENT_INACTIVE、REFERENCE_MISSING）才有。 */
export type ReviewBlocker = { code: string; message: string; action: string; fix?: ReviewFix | null; garmentId?: string | null }
export type Review = {
  items: Worn[]; slots: { role: string; label: string; state: string; items: Worn[] }[]; blockers: ReviewBlocker[]; warnings: { code: string; message: string }[]
  fingerprint: string; ruleVersion: string; outfitId?: string | null; revision?: number | null
  parts?: Part[]; asks?: Ask[]
}
export type Profile = { revision: number; sex: string | null; heightCm: number | null; weightKg: number | null; bodyShape: string | null; measurements: Record<string, number>; preferences: Record<string, string>; defaultBaselineId: string | null }
export type ProfileSnapshot = { sex: string; heightCm: number; weightKg: number; bodyShape: string; sources: Record<string, string>; profileRevision: number }
export type Baseline = { id: string; revision: number; status: string; mediaUrl: string | null; sourcePhotoId: string | null; profile: ProfileSnapshot; createdAt: number; currentDefault: boolean; name: string | null }
export type RenderJob = { id: string; purpose: string; status: string; mediaUrl: string | null; baselineId: string | null; planId: string | null; error: string | null; feedback: string | null; createdAt: number; parentJobId: string | null; summary: RenderSummary | null }
export type BodyAdjustments = Partial<Record<'build' | 'shoulders' | 'waist' | 'hips' | 'legs', number>>
/** outfitId / outfit / items / poseText (issue #106): what the picture was made from, for the record list only. */
export type RenderSourceItem = { garmentId: string; role: string; label: string }
export type RenderSummary = { kind?: 'OOTD' | 'ADJUST'; retryOf?: string; model?: string; pose?: string; poseText?: string; outfitId?: string; outfit?: string; items?: RenderSourceItem[]; adjustments?: BodyAdjustments }
export type PoseJoint = 'HEAD' | 'NECK' | 'L_SHOULDER' | 'R_SHOULDER' | 'L_ELBOW' | 'R_ELBOW' | 'L_WRIST' | 'R_WRIST' | 'L_HIP' | 'R_HIP' | 'L_KNEE' | 'R_KNEE' | 'L_ANKLE' | 'R_ANKLE'
export type Pose = { id: string; name: string; source: 'PRESET' | 'PHOTO' | 'TEXT'; description: string; tags: string[]; keypoints: Partial<Record<PoseJoint, [number, number]>>; viewAngle: string | null; createdAt: number }
export type PoseCatalog = { presets: Pose[]; mine: Pose[]; extractionsToday: number; dailyExtractions: number }
export type PoseChoice = { mode: 'AUTO' } | { mode: 'PRESET' | 'CUSTOM'; id: string }
export type Capability = { provider: string; model: string; purpose: string; maxReferences: number; verified: boolean; version: number; notes: string }

export type RenderSubmission = { found: boolean; job: RenderJob | null }
