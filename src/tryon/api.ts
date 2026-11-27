import { request, currentCsrfToken } from '../services/api'
import { apiUrl } from '../services/urls'
import { accountHeaders } from '../domain/accountSession'
import type { Outfit } from '../domain/outfit'
import type { ConnectionDiagnostic } from './diagnostic'
import type { Tier } from '../services/modelTiers'
import type { DecartCredential } from './decart'

export type Limits = { dailySeconds: number; sessionSeconds: number; startupSeconds: number; firstFrameSeconds: number; queueSeconds: number; offerSeconds: number; recordingSeconds: number; recordingBytes: number; storageBytes: number }
export type RealtimeTier = { tier: Tier; available: boolean; reason?: string | null; quota: { limit: number; used: number; reserved: number; remaining: number } }
export type Capabilities = { enabled: boolean; ready: boolean; reason: string; quota: { limit: number; used: number; reserved: number; remaining: number }; points?: { paidSeconds: number; milliPointsPerSecond: number }; limits: Limits; hasHistory: boolean; tiers?: RealtimeTier[]; selectedTier?: Tier }
export function realtimeTierNotice(tiers: RealtimeTier[], selected: Tier): string {
  if (!tiers.length) return ''
  const item = tiers.find(entry => entry.tier === selected)
  if (!item) return '当前档位暂不可用，请选择其他档位。'
  if (!item.available) return item.reason === 'QUOTA' ? '今天这个档位的时长已用完，请选择其他档位。' : item.reason === 'DISABLED' ? '这个档位暂未开放，请选择其他档位。' : '这个档位暂时不可用，请选择其他档位。'
  return ''
}
export function sessionStartBody(p: Prepared, tier?: Tier) { return { preparationId: p.id, revision: p.revision, ...(tier ? { tier } : {}) } }
/** role：用户从固定列表里选的穿戴位置，不填则按衣物分类自动判断。LOOK 是精选整套，只能单独试，不传 role。 */
export type Selection = { type: 'GARMENT' | 'TEMPORARY' | 'LOOK'; id: string; revision?: number; assetId?: string; role?: string }
export type Item = Selection & { assetId: string; hash: string; name: string; wearingRole?: string | null }
export type Prepared = { id: string; revision: number; items: Item[]; previewUrl: string; referencePath?: string; referenceBlob?: Blob; expiresAtMs: number }
export type Candidate = { id: string; revision: number; name: string; ready: boolean; reason: string; imageUrl: string; assetId?: string; wearingRole?: string | null; wanted?: boolean }
export type Session = { id: string; state: string; preparationId: string; reservedPoints: number; consumedPoints: number; userSeconds: number; firstFrame: boolean; createdAtMs: number; connectedAtMs: number | null; deadlineAtMs: number; remainingSeconds: number; reason: string | null; environment: 'china' | 'global'; rtcConnectedAtMs?: number | null; diagnostic?: ConnectionDiagnostic | null; tier?: Tier | null; vendor?: 'XMAX' | 'DECART' | null }
export type Media = { id: string; type: 'PHOTO' | 'VIDEO'; state: string; mimeType: string; sessionId: string; hasAudio: boolean; durationMs: number; bytes: number; createdAtMs: number; url: string; downloadUrl: string }
/** 精选整套（server 设计 2026-11-22 3.3）：管理员维护的整套平铺图；preview 只出现在管理员账号上，表示未上架。 */
export type LookCoverage = 'FULL' | 'UPPER' | 'LOWER'
export type Look = { id: string; name: string; category: string; tags: string[]; coverage: LookCoverage; imageUrl: string; thumbUrl: string; preview?: boolean }
export type LookCategory = { key: string; name: string }
export type LookPage = { categories: LookCategory[]; items: Look[]; total: number }
export type LookQuery = { category?: string; page?: number; size?: number }
function lookQuery(params: LookQuery) {
  const query = new URLSearchParams()
  if (params.category) query.set('category', params.category)
  if (params.page && params.page > 1) query.set('page', String(params.page))
  if (params.size) query.set('size', String(Math.min(60, Math.max(1, params.size))))
  const text = query.toString()
  return text ? `?${text}` : ''
}
const post = <T>(path: string, body: unknown = {}, init: RequestInit = {}) => request<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) })
export const tryOnApi = {
  capabilities: () => request<Capabilities>('/api/tryon/capabilities'),
  garments: (page = 1, query = '') => request<Candidate[]>(`/api/tryon/garments?page=${page}&size=60&query=${encodeURIComponent(query)}`),
  garment: (id: string) => request<Candidate>(`/api/tryon/garments/${encodeURIComponent(id)}`),
  outfits: () => request<Outfit[]>('/api/outfits'),
  looks: (params: LookQuery = {}) => request<LookPage>(`/api/tryon/looks${lookQuery(params)}`),
  prepare: (items: Selection[], outfitId?: string, allowLatest = false) => post<Prepared>('/api/tryon/preparations', { items, outfitId, allowLatest }),
  start: (p: Prepared, key: string, tier?: Tier) => post<Session>('/api/tryon/sessions', sessionStartBody(p, tier), { headers: { 'Idempotency-Key': key } }),
  decartToken: (id: string) => request<DecartCredential>(`/api/tryon/sessions/${encodeURIComponent(id)}/decart/token`, { method: 'POST' }),
  session: (id: string) => request<Session>(`/api/tryon/sessions/${id}`),
  accept: (id: string) => post<Session>(`/api/tryon/sessions/${id}/accept`),
  pulse: (id: string, firstFrame = false, diagnostic?: ConnectionDiagnostic) => post<Session>(`/api/tryon/sessions/${id}/heartbeat`, { firstFrame, diagnostic }),
  stop: (id: string) => post<Session>(`/api/tryon/sessions/${id}/stop`),
  upstreamReference: (id: string, p: Prepared) => post<{ referencePath: string }>(`/api/tryon/sessions/${id}/upstream-reference`, { preparationId: p.id, revision: p.revision }),
  reference: (id: string, p: Prepared) => post<Session>(`/api/tryon/sessions/${id}/reference`, { preparationId: p.id, revision: p.revision }),
  history: (page = 1) => request<{ media: Media[]; sessions: Session[] }>(`/api/tryon/history?page=${page}&size=30`),
  remove: (id: string) => request(`/api/tryon/media/${id}`, { method: 'DELETE' }),
  repeat: (id: string) => post<Prepared>(`/api/tryon/history/${id}/prepare`),
  repeatItems: (id: string) => request<Item[]>(`/api/tryon/history/${id}/items`),
  upload: async (file: File) => { const data = new FormData(); data.append('file', file); return postForm<{ id: string; imageUrl: string; expiresAtMs: number }>('/api/tryon/temporary-garments', data) },
  photo: (session: string, file: Blob) => { const form = new FormData(); form.append('file', file, 'tryon.png'); return postForm<Media>(`/api/tryon/media/photos?sessionId=${encodeURIComponent(session)}`, form) },
  recording: (sessionId: string, mimeType: string, hasAudio: boolean) => post<Media>('/api/tryon/recordings', { sessionId, mimeType, hasAudio }),
  chunk: (id: string, sequence: number, offset: number, bytes: Uint8Array<ArrayBuffer>) => { const form = new FormData(); form.append('file', new Blob([bytes]), 'chunk.bin'); return request<Media>(`/api/tryon/recordings/${id}/chunks/${sequence}?offset=${offset}`, { method: 'PUT', body: form }) },
  complete: (id: string, lastSequence: number, durationMs: number, interrupted = false) => post<Media>(`/api/tryon/recordings/${id}/complete`, { lastSequence, durationMs, interrupted }),
}
function postForm<T>(path: string, form: FormData) { return request<T>(path, { method: 'POST', body: form }) }
/** Best effort only. Server leases are the guarantee when mobile browsers never run this callback. */
export function emergencyStop(id: string) {
  const token = currentCsrfToken()
  const path = `/api/tryon/sessions/${id}/stop`
  void fetch(apiUrl(path), { method: 'POST', credentials: 'include', keepalive: true, headers: { ...accountHeaders(path), 'Content-Type': 'application/json', ...(token ? { 'X-XSRF-TOKEN': token } : {}) }, body: '{}' }).catch(() => {})
}
export const mediaUrl = (path: string) => apiUrl(path)
export const finished = (s: Session | null) => !s || ['CLOSED', 'FAILED', 'CANCELLED'].includes(s.state)
export function duration(seconds: number) { const n = Math.max(0, Math.ceil(seconds)); return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}` }
