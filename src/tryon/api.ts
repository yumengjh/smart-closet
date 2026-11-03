import { request, currentCsrfToken } from '../services/api'
import { apiUrl } from '../services/urls'
import { accountHeaders } from '../domain/accountSession'
import type { Outfit } from '../domain/outfit'
import type { ConnectionDiagnostic } from './diagnostic'

export type Limits = { dailySeconds: number; sessionSeconds: number; startupSeconds: number; firstFrameSeconds: number; queueSeconds: number; offerSeconds: number; recordingSeconds: number; recordingBytes: number; storageBytes: number }
export type Capabilities = { enabled: boolean; ready: boolean; reason: string; quota: { limit: number; used: number; reserved: number; remaining: number }; limits: Limits; hasHistory: boolean }
/** role：用户从固定列表里选的穿戴位置，不填则按衣物分类自动判断。 */
export type Selection = { type: 'GARMENT' | 'TEMPORARY'; id: string; revision?: number; assetId?: string; role?: string }
export type Item = Selection & { assetId: string; hash: string; name: string; wearingRole?: string | null }
export type Prepared = { id: string; revision: number; items: Item[]; previewUrl: string; referencePath?: string; expiresAtMs: number }
export type Candidate = { id: string; revision: number; name: string; ready: boolean; reason: string; imageUrl: string; assetId?: string; wearingRole?: string | null }
export type Session = { id: string; state: string; preparationId: string; reservedPoints: number; consumedPoints: number; userSeconds: number; firstFrame: boolean; createdAtMs: number; connectedAtMs: number | null; deadlineAtMs: number; remainingSeconds: number; reason: string | null; environment: 'china' | 'global'; rtcConnectedAtMs?: number | null; diagnostic?: ConnectionDiagnostic | null }
export type Media = { id: string; type: 'PHOTO' | 'VIDEO'; state: string; mimeType: string; sessionId: string; hasAudio: boolean; durationMs: number; bytes: number; createdAtMs: number; url: string; downloadUrl: string }
const post = <T>(path: string, body: unknown = {}, init: RequestInit = {}) => request<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) })
export const tryOnApi = {
  capabilities: () => request<Capabilities>('/api/tryon/capabilities'),
  garments: (page = 1, query = '') => request<Candidate[]>(`/api/tryon/garments?page=${page}&size=60&query=${encodeURIComponent(query)}`),
  garment: (id: string) => request<Candidate>(`/api/tryon/garments/${encodeURIComponent(id)}`),
  outfits: () => request<Outfit[]>('/api/outfits'),
  prepare: (items: Selection[], outfitId?: string, allowLatest = false) => post<Prepared>('/api/tryon/preparations', { items, outfitId, allowLatest }),
  start: (p: Prepared, key: string) => post<Session>('/api/tryon/sessions', { preparationId: p.id, revision: p.revision }, { headers: { 'Idempotency-Key': key } }),
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
