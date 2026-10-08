import { request } from '../services/api'
import type { Explanation, IntentInput, RecommendationView, RecommendedOutfit, StyleProfileView, SwapView, Verdict, WearSummary } from './types'

type Signal = { kind: 'VIEW_DETAIL' | 'OPEN_WORKSPACE' | 'SWAP_OUT'; logId?: string; garmentId?: string }

let pending: Signal[] = []
let timer: number | undefined
// Turning off "根据我的行为调整推荐" stops weak-signal reports at the source (design 8.8); unknown means allowed.
let signalsEnabled = true
function flush() {
  window.clearTimeout(timer); timer = undefined
  if (!pending.length) return
  const events = pending; pending = []
  // Weak signals are best effort (design 8.8): failures are dropped silently and never retried.
  request('/api/recommendations/events', { method: 'POST', body: JSON.stringify({ events }) }).catch(() => {})
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })

/** Last run shown on a page, so "为什么没推荐它" from a garment page can explain against it. */
const LAST_RUN = 'yixu.recommend.last-run.v1'
export function rememberRun(runId: string) { try { sessionStorage.setItem(LAST_RUN, runId) } catch { /* private mode */ } }
export function lastRun(): string | null { try { return sessionStorage.getItem(LAST_RUN) } catch { return null } }

export const recommendApi = {
  recommend(intent: IntentInput) {
    return request<RecommendationView>('/api/recommendations', { method: 'POST', body: JSON.stringify(intent) }).then(view => { rememberRun(view.runId); return view })
  },
  more(runId: string, count = 3) { return request<RecommendationView>(`/api/recommendations/${runId}/more?count=${count}`) },
  swap(runId: string, outfitKey: string, garmentId: string) {
    return request<SwapView>(`/api/recommendations/${runId}/outfits/${outfitKey}/swap?garmentId=${encodeURIComponent(garmentId)}`)
  },
  adopt(runId: string, garmentIds: string[]) {
    return request<RecommendedOutfit>(`/api/recommendations/${runId}/outfits`, { method: 'POST', body: JSON.stringify({ garmentIds }) })
  },
  explain(runId: string, target: { garmentId?: string; outfitKey?: string }) {
    const q = target.garmentId ? `garmentId=${encodeURIComponent(target.garmentId)}` : `outfitKey=${encodeURIComponent(target.outfitKey || '')}`
    return request<Explanation>(`/api/recommendations/${runId}/explain?${q}`)
  },
  feedback(logId: string, verdict: Verdict, reasons: string[] = [], garmentId?: string) {
    return request<{ logId: string; verdict: Verdict; reasons: string[] }>(`/api/recommendations/logs/${logId}/feedback`, {
      method: 'POST', body: JSON.stringify({ verdict, reasons, garmentId }),
    })
  },
  wear(input: { outfitId?: string; garmentIds?: string[] }) {
    return request<{ id: string; wornOn: string; garmentIds: string[] }>('/api/wear-logs', { method: 'POST', body: JSON.stringify(input) })
  },
  wearSummary(garmentId: string) { return request<WearSummary>(`/api/wear-logs/garments/${garmentId}`) },
  outfitWear() { return request<Record<string, string>>('/api/wear-logs/outfits') },
  profile() { return request<StyleProfileView>('/api/style-profile').then(p => { signalsEnabled = p.settings.profileEnabled; return p }) },
  updateProfile(patch: Record<string, unknown>) {
    return request<StyleProfileView['settings']>('/api/style-profile', { method: 'PATCH', body: JSON.stringify(patch) }).then(s => { signalsEnabled = s.profileEnabled; return s })
  },
  signal(signal: Signal) {
    if (!signal.logId || !signalsEnabled) return
    pending.push(signal)
    if (pending.length >= 10) flush()
    else if (timer === undefined) timer = window.setTimeout(flush, 5000)
  },
}
