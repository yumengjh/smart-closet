export function eligible(visibleFraction: number, keyDetailsVisible: boolean, strategy: string): boolean {
  return strategy !== 'SMART' || visibleFraction >= .8 && keyDetailsVisible
}
export function imagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, naturalWidth: number, naturalHeight: number) {
  const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight)
  const width = naturalWidth * scale, height = naturalHeight * scale
  const x = (clientX - rect.left - (rect.width - width) / 2) / width
  const y = (clientY - rect.top - (rect.height - height) / 2) / height
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null
}
export function generationUnits(count: number, groupSize: number) { return Math.ceil(count / groupSize) }

export type SpriteTargetState = { id: string; status: string; confirmed?: boolean; outputUrl?: string }
// Batch shortcuts only select new detections. Existing results and uncertain calls require an explicit choice.
export function freshSpriteTargets<T extends SpriteTargetState>(targets: T[]): T[] {
  return targets.filter(target => !target.confirmed && target.status === 'DETECTED' && !target.outputUrl)
}
export function restoreSpriteSelection(ids: unknown, targets: SpriteTargetState[]): string[] {
  const available = new Set(freshSpriteTargets(targets).map(target => target.id))
  return Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && available.has(id)))] : []
}
export function clearSubmittedSpriteSelection(storage: Pick<Storage, 'getItem' | 'setItem'>, batchId: string, ids: string[]) {
  const key = `closet-batch:${batchId}:sprite-selection`
  const saved = JSON.parse(storage.getItem(key) || '{}')
  storage.setItem(key, JSON.stringify({ groupSize: saved.groupSize, ids: Array.isArray(saved.ids) ? saved.ids.filter((id: unknown) => typeof id === 'string' && !ids.includes(id)) : [] }))
}
export function targetPreviewSource(target: Pick<SpriteTargetState, 'outputUrl'>, source: { previewUrl: string } | undefined, processed = false) {
  return processed && target.outputUrl ? { url: target.outputUrl, cropped: false } : { url: source?.previewUrl, cropped: true }
}
