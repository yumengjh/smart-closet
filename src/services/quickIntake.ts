import { createUuid } from '../domain/id'
import { ref } from 'vue'
import { request, closetApi } from './api'
import { useProcessingStore } from '../stores/processing'
export type Hint = { kind: 'POINT' | 'BOX'; x: number; y: number; width?: number; height?: number }
export type QuickView = { intakeId: string; garmentId: string; sourceSaved: boolean; revision: number; awaitTargetHint: boolean; task: { status: string; steps: { type: string; status: string; error?: { message: string } }[] }; garment: { status: string; sourceUrl: string; displayUrl: string; displayAssetId: string; images: { id: string; kind: string; url: string; aiGenerated: boolean }[]; imageProcessing?: { stickerReady: boolean } }; quality: { needsEnhancement: boolean; reason: string } | null }
export type LocalPhoto = { id: string; owner: string; blob?: Blob; name: string; options: { admissionMode: string; captureSessionId: string; targetHint?: Hint }; created: number; state: 'PENDING' | 'UPLOADING' | 'SAVED' | 'ERROR' | 'MARKING'; nextAttemptAt?: number; leaseUntil?: number; leaseOwner?: string; error?: string; result?: QuickView }
export const uploadRows = ref<LocalPhoto[]>([])
export const uploadError = ref('')
let database: Promise<IDBDatabase> | undefined
function db() { return database ||= new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('yuda.quick-intake.v1', 1); open.onupgradeneeded = () => open.result.createObjectStore('photos', { keyPath: 'id' }); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) }) }
async function change<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, done: (value: T) => void) => void) { const database = await db(); return new Promise<T>((resolve, reject) => { const tx = database.transaction('photos', mode); let value: T; action(tx.objectStore('photos'), result => { value = result }); tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('本机保存被中断')) }) }
const tabId = createUuid()
const readAll = () => change<LocalPhoto[]>('readonly', (store, done) => { store.getAll().onsuccess = event => done((event.target as IDBRequest).result) })
export async function refreshUploads(owner: string) { uploadRows.value = (await readAll()).filter(row => row.owner === owner).sort((a, b) => b.created - a.created) }
export async function savePhoto(owner: string, file: File, mode: string, session: string, marking = false) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 50 * 1024 * 1024) throw new Error('请选择不超过 50 MB 的 JPEG 或 PNG 照片。')
  const row: LocalPhoto = { id: createUuid(), owner, blob: file, name: file.name, options: { admissionMode: mode, captureSessionId: session }, state: marking ? 'MARKING' : 'PENDING', created: Date.now() }
  try { await change<void>('readwrite', (store, done) => { store.add(row); done() }); uploadError.value = ''; await refreshUploads(owner); return row }
  catch { uploadError.value = '本机空间不足或无法保存，请停止拍摄并释放空间。此照片尚未安全保存。'; throw new Error(uploadError.value) }
}
export async function markPhoto(id: string, owner: string, hint?: Hint) { await change<void>('readwrite', (store, done) => { store.get(id).onsuccess = event => { const row = (event.target as IDBRequest).result as LocalPhoto; if (row?.owner !== owner || row.state !== 'MARKING') { done(); return }; row.options.targetHint = hint ? { kind: hint.kind, x: hint.x, y: hint.y, ...(hint.width === undefined ? {} : { width: hint.width }), ...(hint.height === undefined ? {} : { height: hint.height }) } : undefined; row.state = 'PENDING'; store.put(row); done() } }); await refreshUploads(owner) }
export async function updateSavedResult(id: string, owner: string, result: QuickView) { await change<void>('readwrite', (store, done) => { store.get(id).onsuccess = e => { const row = (e.target as IDBRequest).result as LocalPhoto; if (row?.owner === owner && row.state === 'SAVED') store.put({ ...row, blob: undefined, result }); done() } }) }
export async function checkLocalStorage(owner: string) { await refreshUploads(owner); uploadError.value = '' }
export async function retryPhoto(id: string, owner: string) { await change<void>('readwrite', (store, done) => { store.get(id).onsuccess = e => { const row = (e.target as IDBRequest).result as LocalPhoto; if (row?.owner === owner && row.state === 'ERROR') { row.state = 'PENDING'; row.error = undefined; store.put(row) }; done() } }) }
/** Removes several local records at once (never one being uploaded); the garments already saved stay in the closet. */
export async function removePhotos(ids: string[], owner: string) { const wanted = new Set(ids); await change<void>('readwrite', (store, done) => { store.getAll().onsuccess = e => { for (const row of (e.target as IDBRequest).result as LocalPhoto[]) if (wanted.has(row.id) && row.owner === owner && row.state !== 'UPLOADING') store.delete(row.id); done() } }); await refreshUploads(owner) }
export async function removePhoto(id: string, owner: string) { await change<void>('readwrite', (store, done) => { store.get(id).onsuccess = e => { const row = (e.target as IDBRequest).result as LocalPhoto; if (row?.owner === owner && row.state !== 'UPLOADING') store.delete(id); done() } }); await refreshUploads(owner) }
async function claim(owner: string) { return change<LocalPhoto | undefined>('readwrite', (store, done) => { store.getAll().onsuccess = e => { const rows = (e.target as IDBRequest).result as LocalPhoto[]; const uploading = rows.filter(r => r.state === 'UPLOADING' && (r.leaseUntil || 0) > Date.now()); if (uploading.length >= 2) { done(undefined); return }; const row = rows.filter(r => r.owner === owner && (r.nextAttemptAt || 0) <= Date.now() && (r.state === 'PENDING' || r.state === 'UPLOADING' && (r.leaseUntil || 0) <= Date.now())).sort((a, b) => a.created - b.created)[0]; if (row) { row.state = 'UPLOADING'; row.leaseOwner = tabId; row.leaseUntil = Date.now() + 30000; store.put(row) }; done(row) } }) }
async function finish(row: LocalPhoto, result?: QuickView, error?: string, retrySoon = false) { await change<void>('readwrite', (store, done) => { store.get(row.id).onsuccess = e => { const current = (e.target as IDBRequest).result as LocalPhoto; if (current?.leaseOwner === tabId) { store.put({ ...current, blob: result ? undefined : current.blob, state: result ? 'SAVED' : retrySoon ? 'PENDING' : 'ERROR', result, error, nextAttemptAt: retrySoon ? Date.now() + 5000 : 0, leaseUntil: 0 }) }; done() } }) }
async function renew(row: LocalPhoto) { await change<void>('readwrite', (store, done) => { store.get(row.id).onsuccess = e => { const current = (e.target as IDBRequest).result as LocalPhoto; if (current?.leaseOwner === tabId && current.state === 'UPLOADING') store.put({ ...current, leaseUntil: Date.now() + 30000 }); done() } }) }
let pumpBusy = false
export async function pumpUploads(getOwner: () => string | undefined) {
  if (pumpBusy || !navigator.onLine) return; pumpBusy = true
  try { const owner = getOwner(); if (!owner) return; const rows: LocalPhoto[] = []; for (let i = 0; i < 2; i++) { const row = await claim(owner); if (row) rows.push(row) }
    if (rows.length && getOwner() === owner) await refreshUploads(owner)
    await Promise.all(rows.map(async row => { if (getOwner() !== owner) { await finish(row, undefined, '账户已切换，请回到原账户重试。'); return }; const heartbeat = window.setInterval(() => void renew(row), 10000)
      try { const form = new FormData(); if (!row.blob) throw new Error('本机原图已丢失，请重新选择照片。'); form.append('file', row.blob, row.name); form.append('options', JSON.stringify(row.options)); const result = await request<QuickView>('/api/closet/quick-intakes', { method: 'POST', headers: { 'Idempotency-Key': row.id, 'X-Upload-Owner': owner }, body: form }); if (!result.sourceSaved || result.intakeId !== row.id) throw new Error('服务器尚未确认保存'); await finish(row, result)
        if (getOwner() === owner) { await refreshUploads(owner); void closetApi.task(result.intakeId).then(task => { if (getOwner() === owner) useProcessingStore().trackTask(task) }).catch(() => {}) }
      }
      catch (cause) { await finish(row, undefined, cause instanceof Error ? cause.message : '未收到保存确认，可安全重试。', cause instanceof TypeError || !navigator.onLine) } finally { clearInterval(heartbeat); if (getOwner() === owner) await refreshUploads(owner) }
    })); if (getOwner() === owner) await refreshUploads(owner)
  } catch (cause) { uploadError.value = cause instanceof Error ? cause.message : '本机照片队列无法读取。' } finally { pumpBusy = false }
}
export const quickApi = {
 get: (id: string) => request<QuickView>(`/api/closet/quick-intakes/${id}`),
 provenance: (garment: string) => request<{ intakeId?: string }>(`/api/closet/quick-intakes/garment/${garment}`),
 enhance: (id: string, key: string, feedback: string) => request<QuickView>(`/api/closet/quick-intakes/${id}/enhance`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ feedback }) }),
}
