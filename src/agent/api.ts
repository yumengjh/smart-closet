import { readAgentStream } from './sse'
import { usingMocks } from '../services/api'
import type { OutfitScene } from '../domain/outfit'

export type AgentContext = { route: string; workspaceId?: string; boardId?: string; contentVersion?: number; boardCount?: number; garmentId?: string; outfitId?: string; name?: string; revision?: number | null; selectedIds?: string[]; scene?: OutfitScene }
export type AgentSession = { id: string; title: string; model: string | null; updatedAt: number }
export type Memory = { id: string; content: string; category: string; updatedAt: number }
export type Candidate = { name: string; reason: string; garmentIds: string[] }
export type EditOperation = { op: 'add' | 'remove' | 'replace' | 'transform'; elementId?: string; garmentId?: string; patch?: Record<string, number | boolean> }
export type Proposal = { id: string; kind: 'OUTFITS' | 'EDIT' | 'SAVE'; payload: { candidates?: Candidate[]; summary?: string; operations?: EditOperation[] }; context: AgentContext; consumed: boolean }
export type Article = { id: string; title: string; markdown: string; href: string }
export type AgentEvent = { event: string; data: any }
export type AgentMessage = { id: string; role: string; content: string; status: string; events: AgentEvent[] }
export type Models = { defaultModel: string; models: string[]; configured: boolean }
export type Quota = { limit: number; used: number; resetAt: string }

async function response(path: string, init: RequestInit = {}) {
  if (usingMocks) throw new Error('界面演示不调用助手。请连接真实后端。')
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (init.method && !['GET', 'HEAD'].includes(init.method)) {
    const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    if (!csrf.ok) throw new Error('无法完成安全校验，请重新登录。')
    headers.set('X-XSRF-TOKEN', (await csrf.json()).token)
  }
  const result = await fetch('/api/agent' + path, { ...init, headers, credentials: 'same-origin' })
  if (!result.ok) {
    if (result.status === 401) window.dispatchEvent(new Event('closet-session-expired'))
    const error = await result.json().catch(() => ({}))
    if (error.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new Event('closet-password-change-required'))
    throw new Error(error.message || `助手请求失败 (${result.status})`)
  }
  return result
}
export async function agentRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await response(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  return r.status === 204 ? undefined as T : await r.json()
}
// POST fetch keeps the same-origin login/CSRF contract; EventSource cannot carry a message body.
export async function streamMessage(session: string, body: unknown, onEvent: (event: AgentEvent) => void, signal: AbortSignal) {
  const r = await response(`/sessions/${session}/messages`, { method: 'POST', body: JSON.stringify(body), signal })
  if (!r.body) throw new Error('浏览器不支持流式回复。')
  await readAgentStream(r.body, onEvent)
}
