import { shallowRef } from 'vue'
import { arrangeOutfit } from '../domain/outfit-layout'
import { closetApi } from '../services/api'
import { createOutfitElement } from '../domain/outfit-images'
import { elementKey, normalizeScene, OUTFIT_VERSION, stickerLimit, type OutfitElement, type OutfitScene } from '../domain/outfit'
import type { AgentContext, Candidate, Proposal } from './api'

export const canvasBridge = shallowRef<null | {
  context: () => AgentContext;
  apply: (scene: OutfitScene, name?: string) => void;
  save: () => Promise<void>;
}>(null)
export function pageContext(route: string): AgentContext {
  const canvas = canvasBridge.value?.context()
  if (canvas?.route === route) return JSON.parse(JSON.stringify(canvas))
  if (route.startsWith('/garment/')) return { route, garmentId: route.slice(9) }
  return { route }
}
export async function candidateScene(candidate: Candidate, people: OutfitElement[] = []): Promise<OutfitScene> {
  const elements = people.map(item => ({ ...item }))
  for (const id of candidate.garmentIds) {
    const garment = await closetApi.detail(id)
    if (garment.status !== 'ACTIVE') throw new Error('候选衣物已不在衣柜中，请重新生成。')
    const limit = stickerLimit(elements, 'GARMENT'); if (limit) throw new Error(limit)
    elements.push(await createOutfitElement(garment, elements))
  }
  return arrangeOutfit(normalizeScene({ version: OUTFIT_VERSION, elements }))
}
export async function editedScene(proposal: Proposal): Promise<OutfitScene> {
  let elements = proposal.context.scene?.elements.map(item => ({ ...item })) || []
  for (const op of proposal.payload.operations || []) {
    const index = elements.findIndex(item => elementKey(item) === op.elementId)
    if (op.op !== 'add' && index < 0) throw new Error('这张贴纸已不存在，请重新生成建议。')
    if (op.op === 'remove') elements.splice(index, 1)
    else if (op.op === 'transform') elements[index] = { ...elements[index], ...op.patch }
    else {
      const garment = await closetApi.detail(op.garmentId!)
      if (garment.status !== 'ACTIVE') throw new Error('衣物已不在衣柜中。')
      const limit = op.op === 'add' ? stickerLimit(elements, 'GARMENT') : null; if (limit) throw new Error(limit)
      const item = await createOutfitElement(garment, elements)
      if (op.op === 'replace') elements[index] = { ...item, elementId: elements[index].elementId, x: elements[index].x, y: elements[index].y, zIndex: elements[index].zIndex }
      else elements.push(item)
    }
  }
  return normalizeScene({ version: OUTFIT_VERSION, elements: elements.sort((a, b) => a.zIndex - b.zIndex).map((item, zIndex) => ({ ...item, zIndex })) })
}
