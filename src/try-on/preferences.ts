import { DEFAULT_FIT, type Anchors, type Fit, type SleeveKind } from './geometry.ts'

/**
 * Per-browser conveniences only: fine-tuning for each garment and the result of checking which wardrobe items can be
 * tried on. Losing them just means re-tuning or re-checking, so every access tolerates blocked storage.
 */
const FIT_KEY = 'yuda.tryon.fit.v1:'
const VERDICT_KEY = 'yuda.tryon.verdicts.v1'

export type Saved = { fit: Fit; anchors?: Anchors }
export type Verdict = { signature: string; ok: boolean; kind?: SleeveKind; url?: string; reason?: string }

export function loadSaved(key: string): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(FIT_KEY + key) || 'null') as Partial<Saved> | null
    // Older saves lack newer adjustments; fill them from the defaults.
    return { fit: { ...DEFAULT_FIT, ...(raw?.fit || {}) }, anchors: raw?.anchors }
  } catch { return { fit: { ...DEFAULT_FIT } } }
}
export function storeSaved(key: string, saved: Saved | null) {
  try { if (saved) localStorage.setItem(FIT_KEY + key, JSON.stringify(saved)); else localStorage.removeItem(FIT_KEY + key) } catch { /* storage unavailable */ }
}
export function isDefaultFit(fit: Fit) { return (Object.keys(DEFAULT_FIT) as (keyof Fit)[]).every(k => Math.abs(fit[k] - DEFAULT_FIT[k]) < 1e-6) }

export function loadVerdicts(): Record<string, Verdict> {
  try { return JSON.parse(localStorage.getItem(VERDICT_KEY) || '{}') } catch { return {} }
}
export function storeVerdicts(verdicts: Record<string, Verdict>) {
  try { localStorage.setItem(VERDICT_KEY, JSON.stringify(verdicts)) } catch { /* storage unavailable */ }
}
