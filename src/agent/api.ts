import { readAgentStream } from './sse'
import { usingMocks } from '../services/api'
import { apiUrl } from '../services/urls'
import { fetchWithRetry } from '../domain/network'
import type { OutfitScene } from '../domain/outfit'
import type { QuestionOption } from './question'

export type AgentContext = { route: string; workspaceId?: string; boardId?: string; contentVersion?: number; boardCount?: number; garmentId?: string; outfitId?: string; sourceOutfitId?: string; sourceRevision?: number | null; name?: string; revision?: number | null; selectedIds?: string[]; scene?: OutfitScene }
export type AgentSession = { id: string; title: string; model: string | null; updatedAt: number }
export type Memory = { id: string; content: string; category: string; updatedAt: number }
export type Candidate = { name: string; reason: string; garmentIds: string[]; recommendation?: import('../recommend/types').RecommendedOutfit }
export type EditOperation = { op: 'add' | 'remove' | 'replace' | 'transform'; elementId?: string; garmentId?: string; patch?: Record<string, number | boolean> }
export type { QuestionOption }
export type SavedOutfitItem = { id: string; name: string; revision: number; updatedAtMs: number }
export type DuplicateSide = { id: string; name: string; displayUrl?: string | null }
export type DuplicatePairItem = { a: DuplicateSide; b: DuplicateSide; level: string; reasons?: string[] }
export type Proposal = { id: string; kind: 'OUTFITS' | 'RECOMMENDATION' | 'EDIT' | 'SAVE' | 'GARMENT_CHOICE' | 'GARMENT_LIST' | 'WEAR' | 'PRESET_IMPORT' | 'NOT_DUPLICATE' | 'QUESTION' | 'OUTFIT_LIST' | 'DUPLICATE_PAIRS' | (string & {}); payload: import('./save').SaveChoice & { wornOn?: string; items?: { id: string; name?: string; category?: string[]; primaryColor?: string[] }[]; truncated?: boolean; candidates?: Candidate[]; summary?: string; operations?: EditOperation[]; runId?: string; intent?: string; intentInput?: import('../recommend/types').IntentInput; limits?: string[]; notes?: string[]; query?: string; total?: number
  // QUESTION: the assistant asks the user to pick; the answer goes back as the next chat message.
  question?: string; options?: QuestionOption[]; multiple?: boolean; allowCustom?: boolean; placeholder?: string
  // OUTFIT_LIST / DUPLICATE_PAIRS: read-only lists; every action is navigation or a new chat message.
  outfits?: SavedOutfitItem[]; pairs?: DuplicatePairItem[] }; context: AgentContext; consumed: boolean }
export type Article = { id: string; title: string; markdown: string; href: string }
export type AgentEvent = { event: string; data: any }
export type AgentMessage = { id: string; role: string; content: string; status: string; events: AgentEvent[]; requestId?: string | null }
export type Models = { defaultModel: string; models: string[]; configured: boolean }
export type Quota = { limit: number; used: number; resetAt: string; tokenLimit?: number; tokensUsed?: number }

export class AgentRequestError extends Error { constructor(message: string, public status: number) { super(message) } }
async function response(path: string, init: RequestInit = {}) {
  if (usingMocks) throw new Error('界面演示不调用助手。请连接真实后端。')
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (init.method && !['GET', 'HEAD'].includes(init.method)) {
    const csrf = await fetchWithRetry(apiUrl('/api/auth/csrf'), { credentials: 'include' })
    if (!csrf.ok) throw new Error('无法完成安全校验，请重新登录。')
    headers.set('X-XSRF-TOKEN', (await csrf.json()).token)
  }
  const result = await fetchWithRetry(apiUrl('/api/agent' + path), { ...init, headers, credentials: 'include' })
  if (!result.ok) {
    if (result.status === 401) window.dispatchEvent(new Event('closet-session-expired'))
    const error = await result.json().catch(() => ({}))
    if (error.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new Event('closet-password-change-required'))
    throw new AgentRequestError(error.message || `助手请求失败 (${result.status})`, result.status)
  }
  return result
}
export async function agentRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await response(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  return r.status === 204 ? undefined as T : await r.json()
}
// POST fetch carries login cookies and CSRF; EventSource cannot carry a message body.
export async function streamMessage(session: string, body: unknown, onEvent: (event: AgentEvent) => void, signal: AbortSignal) {
  const r = await response(`/sessions/${session}/messages`, { method: 'POST', body: JSON.stringify(body), signal })
  if (!r.body) throw new Error('浏览器不支持流式回复。')
  await readAgentStream(r.body, onEvent)
}
