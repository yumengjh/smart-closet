import { request } from '../services/api'
import type { Verdict } from './types'

type Signal = { kind: 'VIEW_DETAIL' | 'OPEN_WORKSPACE' | 'SWAP_OUT'; logId?: string; garmentId?: string }

let pending: Signal[] = []
let timer: number | undefined
function flush() {
  window.clearTimeout(timer); timer = undefined
  if (!pending.length) return
  const events = pending; pending = []
  // Weak signals are best effort (design 8.8): failures are dropped silently and never retried.
  request('/api/recommendations/events', { method: 'POST', body: JSON.stringify({ events }) }).catch(() => {})
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })

export const recommendApi = {
  feedback(logId: string, verdict: Verdict, reasons: string[] = [], garmentId?: string) {
    return request<{ logId: string; verdict: Verdict; reasons: string[] }>(`/api/recommendations/logs/${logId}/feedback`, {
      method: 'POST', body: JSON.stringify({ verdict, reasons, garmentId }),
    })
  },
  signal(signal: Signal) {
    if (!signal.logId) return
    pending.push(signal)
    if (pending.length >= 10) flush()
    else if (timer === undefined) timer = window.setTimeout(flush, 5000)
  },
}
