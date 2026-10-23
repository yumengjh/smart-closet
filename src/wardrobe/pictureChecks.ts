import { ref } from 'vue'
import { request, usingMocks } from '../services/api'

/**
 * Issue #88: garments whose category the local picture check questions ("需核对"), keyed by garment id. One request
 * covers the whole closet; the server answers from local image vectors only, so it is cheap but not free, and the list
 * is reused for a short while across the wardrobe and pending pages.
 */
export type PictureCheck = { garmentId: string; status: string; suggestion: string; message: string }
export const pictureChecks = ref<Record<string, PictureCheck>>({})
let loadedAt = 0
export async function loadPictureChecks(force = false) {
  if (usingMocks || (!force && Date.now() - loadedAt < 60_000)) return
  loadedAt = Date.now()
  try { const r = await request<{ items: PictureCheck[] }>('/api/garments/picture-checks'); pictureChecks.value = Object.fromEntries(r.items.map(i => [i.garmentId, i])) }
  catch { loadedAt = 0 /* hints only */ }
}
/** After the owner edits a category the hint for that garment is gone until the next check. */
export function forgetPictureCheck(id: string) { const next = { ...pictureChecks.value }; delete next[id]; pictureChecks.value = next }

/** How many garments wait for a person on the 待核对 page (picture-check conflicts and missing categories). */
export const reviewCount = ref(0)
export async function loadReviewCount() {
  if (usingMocks) return
  try { reviewCount.value = (await request<{ items: unknown[] }>('/api/garments/needs-review')).items.length } catch { /* entry stays hidden */ }
}
