import { elementKey, type OutfitScene } from '../domain/outfit.ts'
import { arrangeOutfit, orderOutfitLayers } from '../domain/outfit-layout.ts'
import type { AgentContext } from './api'

export type EditorCanvas = { context: () => AgentContext; apply: (scene: OutfitScene) => void }
// Recheck after asynchronous image loading: user edits and draft switches invalidate the grant.
export async function applyEditorOperation(
  bridge: EditorCanvas, source: AgentContext, expectedVersion: number, kind: string, payload: any,
  makeGarment: (id: string, scene: OutfitScene) => Promise<OutfitScene['elements'][number]>,
) {
  const current = () => {
    const c = bridge.context()
    if (c.workspaceId !== source.workspaceId || c.boardId !== source.boardId || c.contentVersion !== expectedVersion || !c.scene) throw new Error('当前画布已变化，请重新发起调整。')
    return c.scene
  }
  const scene = current()
  let next = scene
  if (kind === 'add' || kind === 'replace') {
    const item = await makeGarment(payload.garmentId, scene)
    current()
    const elements = [...scene.elements]
    if (kind === 'replace') {
      const index = elements.findIndex(e => elementKey(e) === payload.elementId)
      if (index < 0) throw new Error('待替换的衣物已经变化。')
      elements[index] = { ...item, elementId: elements[index].elementId, zIndex: elements[index].zIndex }
    } else elements.push(item)
    next = orderOutfitLayers({ ...scene, elements })
  } else if (kind === 'remove' || kind === 'adjust') {
    if (!scene.elements.some(e => elementKey(e) === payload.elementId)) throw new Error('目标贴纸已经变化。')
    next = kind === 'remove' ? orderOutfitLayers({ ...scene, elements: scene.elements.filter(e => elementKey(e) !== payload.elementId) }) : { ...scene, elements: scene.elements.map(e => elementKey(e) !== payload.elementId ? e : { ...e,
      x: Math.max(0, Math.min(1080, e.x + (payload.intent === 'left' ? -30 : payload.intent === 'right' ? 30 : 0))),
      y: Math.max(0, Math.min(1350, e.y + (payload.intent === 'up' ? -30 : payload.intent === 'down' ? 30 : 0))),
      width: Math.max(24, Math.min(2160, e.width * (payload.intent === 'smaller' ? .9 : payload.intent === 'larger' ? 1.1 : 1))),
      height: Math.max(24, Math.min(2700, e.height * (payload.intent === 'smaller' ? .9 : payload.intent === 'larger' ? 1.1 : 1))), flipX: payload.intent === 'flip' ? !e.flipX : e.flipX }) }
  } else if (kind === 'layout') next = arrangeOutfit(scene)
  else if (kind !== 'begin' && kind !== 'finish') throw new Error('未开放的画布操作。')
  if (['add', 'replace', 'remove', 'adjust', 'layout'].includes(kind)) bridge.apply(next)
  return bridge.context()
}
