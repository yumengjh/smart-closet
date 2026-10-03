import assert from 'node:assert/strict'
import test from 'node:test'
import { changeSource, mergeTrace, traceScene } from '../src/agent/trace-data.ts'
import type { OutfitScene } from '../src/domain/outfit.ts'
const scene = { version: 2, elements: [{ elementId: 'e', garmentId: 'g', role: 'OUTER', x: 540, y: 300, width: 500, height: 700, zIndex: 1, rotation: 0, flipX: false, assetId: 'asset', assetUrl: 'private-image-url' }] } as OutfitScene
test('trace snapshots preserve geometry and asset identity without retaining image URLs', () => {
  const snapshot = traceScene(scene)!
  assert.equal(snapshot.elements[0]!.x, 540); assert.equal(snapshot.elements[0]!.assetId, 'asset')
  assert.equal('assetUrl' in snapshot.elements[0]!, false)
  scene.elements[0]!.x = 570; assert.equal(snapshot.elements[0]!.x, 540); scene.elements[0]!.x = 540
})
test('trace distinguishes role, layer, transform and position changes', () => {
  for (const [patch, expected] of [[{ x: 570 }, 'manual-drag'], [{ role: 'TOP' }, 'manual-role'], [{ zIndex: 2 }, 'manual-layer'], [{ width: 550 }, 'manual-transform']] as const) {
    const after = structuredClone(scene); Object.assign(after.elements[0]!, patch)
    assert.equal(changeSource(scene, after), expected)
  }
})
test('live trace summaries and paged reload deduplicate by sequence in order', () => {
  const event = (seq: number) => ({ requestId: 'r', seq, phase: 'canvas', status: 'COMPLETE', label: 'layout', createdAt: seq })
  assert.deepEqual(mergeTrace([event(3), event(1)], [event(2), event(3)]).map(e => e.seq), [1, 2, 3])
})
