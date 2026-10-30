import { request } from './api'
import { apiUrl } from './urls'
import { accountHeaders, captureAccount } from '../domain/accountSession'
export type IntakeStrategy = 'SMART' | 'FULL' | 'MANUAL'
export type IntakeChannel = 'SINGLE' | 'MULTIPLE'
export type Marker = { sourceId: string; x: number; y: number }
export type BatchSource = { id: string; name: string; originalUrl: string; previewUrl: string; bytes: number; width: number; height: number }
export type BatchTarget = { id: string; sourceId: string; garmentId: string; jobId?: string; visibleFraction: number; keyDetailsVisible: boolean; completion: boolean; confirmed: boolean; reason: string; status: string; outputUrl?: string; slot: number; recognition: { target: { description: string; worn: boolean; bounds: { x: number; y: number; width: number; height: number } }; attributes: Record<string, { values: string[] }> } }
export type BatchCall = { id: string; type: string; status: string; model: string; startedAtMs: number; finishedAtMs?: number; usage: unknown; costUsd: number | null; error?: string; targetIds: string[]; referenceUrl?: string; atlasUrl?: string; size?: string; quality?: string; referenceSide: number }
export type IntakeBatch = { id: string; channel: IntakeChannel; strategy: IntakeStrategy; status: string; metrics?: {uploaded:number; recognized:number; skipped:number; generated:number; confirmed:number}; error?: string; createdAtMs: number; sources: BatchSource[]; targets: BatchTarget[]; calls: BatchCall[] }
export type GenerateOptions = { targetIds: string[]; groupSize: number; referenceSide: number; sizePolicy: 'FIXED' | 'PER_ITEM'; provider?: string; model?: string; quality: string }
async function upload(path: string, key: string, form: FormData, progress: (percent: number) => void): Promise<IntakeBatch> {
  const stillSameAccount = captureAccount()
  const csrf = await request<{ token: string }>('/api/auth/csrf')
  stillSameAccount()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl(path))
    xhr.withCredentials = true
    xhr.setRequestHeader('Idempotency-Key', key)
    xhr.setRequestHeader('X-XSRF-TOKEN', csrf.token)
    for (const [name, value] of Object.entries(accountHeaders(path))) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)) }
    xhr.onerror = () => reject(new Error('上传连接中断，照片仍保留；重试会复用本次上传编号。'))
    xhr.onload = () => {
      let data: IntakeBatch & { message?: string; detail?: string }
      try { data = JSON.parse(xhr.responseText) } catch { reject(new Error(`服务器无法接收照片 (${xhr.status})，请检查上传大小限制。`)); return }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else { if (xhr.status === 401) window.dispatchEvent(new Event('closet-session-expired')); if (xhr.status === 409 && (data as { code?: string }).code === 'ACCOUNT_MISMATCH') window.dispatchEvent(new Event('closet-account-mismatch')); reject(new Error(data.message || data.detail || `上传失败 (${xhr.status})`)) }
    }
    xhr.send(form)
  })
}
export const batchApi = {
  provenance: (id: string) => request<{batchId?: string; originalUrl?: string; previewUrl?: string; completion?: boolean}>(`/api/closet/batches/garments/${id}/source`),
  resumeLocal: (id: string, callId: string) => request<IntakeBatch>(`/api/closet/batches/${id}/calls/${callId}/resume-local`,{method:'POST'}),
  get: (id: string) => request<IntakeBatch>(`/api/closet/batches/${id}`),
  history: () => request<IntakeBatch[]>('/api/closet/batches'),
  create(file: File, key: string, channel: IntakeChannel, strategy: IntakeStrategy, progress: (percent: number) => void) {
    const form = new FormData(); form.append('file', file); form.append('options', new Blob([JSON.stringify({ channel, strategy })], { type: 'application/json' }))
    return upload('/api/closet/batches', key, form, progress)
  },
  append(file: File, id: string, key: string, progress: (percent: number) => void) {
    const form = new FormData(); form.append('file', file)
    return upload(`/api/closet/batches/${id}/sources`, key, form, progress)
  },
  start: (id: string, key: string, markers: Marker[], recognition: { provider?: string; model?: string }, generation: { provider?: string; model?: string }, reviewBeforeGeneration = false) => request<IntakeBatch>(`/api/closet/batches/${id}/start`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ recognition: { markers, ...recognition }, generationProvider: generation.provider, generationModel: generation.model, reviewBeforeGeneration }) }),
  detect: (id: string, key: string, markers: Marker[], model: { provider?: string; model?: string }) => request<IntakeBatch>(`/api/closet/batches/${id}/recognize`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ markers, ...model }) }),
  generate: (id: string, key: string, options: GenerateOptions) => request<IntakeBatch>(`/api/closet/batches/${id}/generate`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(options) }),
}
