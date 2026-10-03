import type { OutfitScene } from '../domain/outfit.ts'
export type TraceSummary = { requestId: string; seq: number; phase: string; status: string; label: string; createdAt: number }
export type TracePage = { available: boolean; status?: string; items: TraceSummary[]; hasMore: boolean; message?: string }
export function mergeTrace(previous: TraceSummary[], incoming: TraceSummary[]) {
  return [...new Map([...previous, ...incoming].map(e => [e.seq, e])).values()].sort((a, b) => a.seq - b.seq)
}
export function traceScene(scene: OutfitScene | undefined) {
  if (!scene) return undefined
  const keys = ['elementId','kind','garmentId','role','assetId','assetKind','garmentRevision','revision','personPartId','x','y','width','height','rotation','zIndex','flipX','cropX','cropY','cropWidth','cropHeight']
  return { version: scene.version, elements: scene.elements.map(item => Object.fromEntries(keys.filter(k => k in item).map(k => [k, (item as unknown as Record<string, unknown>)[k]]))) }
}
export function changeSource(before: OutfitScene, after: OutfitScene): string {
  const prior = new Map(before.elements.map(e => [e.elementId || e.garmentId, e]))
  if (before.elements.length !== after.elements.length) return 'manual-edit'
  for (const next of after.elements) {
    const prev = prior.get(next.elementId || next.garmentId)
    if (!prev || prev.garmentId !== next.garmentId) return 'manual-edit'
    if (prev.role !== next.role) return 'manual-role'
    if (prev.zIndex !== next.zIndex) return 'manual-layer'
    if (['width','height','rotation','flipX','cropX','cropY','cropWidth','cropHeight'].some(k => (prev as any)[k] !== (next as any)[k])) return 'manual-transform'
  }
  return 'manual-drag'
}
