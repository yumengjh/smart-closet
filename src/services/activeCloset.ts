import { CLOSET_CHANGED, closetApi, type Garment } from './api'

/**
 * Every owned garment in the closet, shared by the outfit board, 随手搭 and the recommendation previews
 * (smart-closet-server#198). The list API serves at most 50 per page; the first page tells the total and the rest
 * are asked for together instead of one after another. A load is reused for a short while, so switching tabs on
 * /outfits does not download the whole closet again.
 */
const PAGE = 50
const MAX_PAGES = 40
const REUSE_MS = 30_000

let current: { at: number; promise: Promise<Garment[]> } | null = null

async function fetchAll(): Promise<Garment[]> {
  const query = { status: 'ACTIVE', q: '', category: '', color: '', season: '', size: PAGE } as const
  const first = await closetApi.list({ ...query, page: 1 })
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE))
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => closetApi.list({ ...query, page: i + 2 })))
  return [first, ...rest].flatMap(page => page.items)
}

/** Newest-updated first, as the list API orders them. Callers get their own array and may sort it. */
export async function activeCloset(options: { fresh?: boolean } = {}): Promise<Garment[]> {
  if (options.fresh || !current || Date.now() - current.at > REUSE_MS) {
    const promise = fetchAll()
    current = { at: Date.now(), promise }
    promise.catch(() => { if (current?.promise === promise) current = null })
  }
  return [...await current.promise]
}

/** A garment from a closet load that is still fresh, without asking the server; undefined otherwise. */
export async function knownGarment(id: string): Promise<Garment | undefined> {
  if (!current || Date.now() - current.at > REUSE_MS) return undefined
  try { return (await current.promise).find(item => item.id === id) } catch { return undefined }
}

/** After a change to the closet (or a sign-out), the next load asks the server again. */
export function forgetActiveCloset() { current = null }
if (typeof window !== 'undefined') window.addEventListener(CLOSET_CHANGED, forgetActiveCloset)
