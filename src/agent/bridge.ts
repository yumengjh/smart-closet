import { shallowRef } from 'vue'
import { arrangeOutfit, orderOutfitLayers } from '../domain/outfit-layout'
import { closetApi } from '../services/api'
import { artworkForGarment, createOutfitElement, layoutImageUrl, loadOutfitImage } from '../domain/outfit-images'
import { elementKey, normalizeScene, OUTFIT_VERSION, stickerLimit, type OutfitElement, type OutfitScene } from '../domain/outfit'
import type { AgentContext, Candidate, Proposal } from './api'

export const canvasBridge = shallowRef<null | {
  context: () => AgentContext;
  apply: (scene: OutfitScene, name?: string) => void;
  save: (choice?: import('./save').SaveChoice) => Promise<void>;
}>(null)
export function pageContext(route: string): AgentContext {
  const canvas = canvasBridge.value?.context()
  if (canvas?.route === route) return JSON.parse(JSON.stringify(canvas))
  if (route.startsWith('/garment/')) return { route, garmentId: route.slice(9) }
  return { route }
}
// Several recommendation cards ask for the same garments at once; share one request each for a short while.
const DETAIL_TTL_MS = 30_000
const details = new Map<string, { at: number; promise: ReturnType<typeof closetApi.detail> }>()
function garmentDetail(id: string) {
  const hit = details.get(id)
  if (hit && Date.now() - hit.at < DETAIL_TTL_MS) return hit.promise
  const promise = closetApi.detail(id); details.set(id, { at: Date.now(), promise }); promise.catch(() => details.delete(id))
  return promise
}
export async function candidateScene(candidate: Candidate, people: OutfitElement[] = []): Promise<OutfitScene> {
  const elements = people.map(item => ({ ...item }))
  // Fetch every garment and start loading its picture at once; only the layout below needs to go one by one.
  // Candidates are previews: they are measured from scaled copies, never the multi-megabyte originals.
  const garments = await Promise.all(candidate.garmentIds.map(garmentDetail))
  await Promise.all(garments.map(garment => loadOutfitImage(layoutImageUrl(artworkForGarment(garment), true)).catch(() => undefined)))
  for (const garment of garments) {
    if (garment.status !== 'ACTIVE') throw new Error('候选衣物已不在衣柜中，请重新生成。')
    const limit = stickerLimit(elements, 'GARMENT'); if (limit) throw new Error(limit)
    elements.push(await createOutfitElement(garment, elements, true))
  }
  return arrangeOutfit(normalizeScene({ version: OUTFIT_VERSION, elements }))
}
export async function editedScene(proposal: Proposal): Promise<OutfitScene> {
  let elements = proposal.context.scene?.elements.map(item => ({ ...item })) || []
  let selectionChanged = false
  for (const op of proposal.payload.operations || []) {
    if (op.op !== 'transform') selectionChanged = true
    const index = elements.findIndex(item => elementKey(item) === op.elementId)
    if (op.op !== 'add' && index < 0) throw new Error('这张贴纸已不存在，请重新生成建议。')
    if (op.op === 'remove') elements.splice(index, 1)
    else if (op.op === 'transform') elements[index] = { ...elements[index], ...op.patch }
    else {
      const garment = await closetApi.detail(op.garmentId!)
      if (garment.status !== 'ACTIVE') throw new Error('衣物已不在衣柜中。')
      const limit = op.op === 'add' ? stickerLimit(elements, 'GARMENT') : null; if (limit) throw new Error(limit)
      const item = await createOutfitElement(garment, elements, true)
      if (op.op === 'replace') elements[index] = { ...item, elementId: elements[index].elementId, x: elements[index].x, y: elements[index].y, zIndex: elements[index].zIndex }
      else elements.push(item)
    }
  }
  const scene = normalizeScene({ version: OUTFIT_VERSION, elements: elements.sort((a, b) => a.zIndex - b.zIndex).map((item, zIndex) => ({ ...item, zIndex })) })
  return selectionChanged ? orderOutfitLayers(scene) : scene
}
