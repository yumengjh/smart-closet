import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeScene, nextElementPosition, outfitDropPosition, reorderOutfitElements, restoreOutfitDraft, roleFromGarment, sceneWrite, type Outfit, type OutfitElement, type OutfitScene } from '../src/domain/outfit.ts'

const minimal = (overrides: Partial<OutfitElement> = {}): OutfitElement => ({
  garmentId: 'garment-1', assetId: 'asset-1', role: 'TOP', x: 420, y: 320, width: 440, height: 580,
  rotation: 0, zIndex: 0, garmentLabel: '白色 衬衫', cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1,
  assetUrl: '/private/asset.png', imageWidth: 600, imageHeight: 800, assetKind: 'SEGMENT', ...overrides,
})

test('drop coordinates follow the displayed canvas including its scroll offset and zoom', () => {
  const bounds = { left: 275, top: 190, width: 432, height: 540 }
  assert.deepEqual(outfitDropPosition(491, 460, bounds), { x: 540, y: 675 })
  assert.deepEqual(outfitDropPosition(275, 190, bounds), { x: 0, y: 0 })
  assert.equal(outfitDropPosition(274, 200, bounds), null)
  assert.equal(outfitDropPosition(500, 731, bounds), null)
  assert.equal(outfitDropPosition(300, 200, { ...bounds, width: 0 }), null)
})

test('layer commands retain every garment geometry and do not mutate undo snapshots', () => {
  const items = [minimal(), minimal({ garmentId: 'second', zIndex: 1 }), minimal({ garmentId: 'third', zIndex: 2 })]
  const snapshot = structuredClone(items)
  const top = reorderOutfitElements(items, 'garment-1', 'front')
  assert.deepEqual(top.map(item => item.garmentId), ['second', 'third', 'garment-1'])
  assert.deepEqual(top.map(item => item.zIndex), [0, 1, 2])
  assert.deepEqual(top[2], { ...items[0], zIndex: 2 })
  assert.deepEqual(reorderOutfitElements(top, 'garment-1', 'back').map(item => item.garmentId), ['garment-1', 'second', 'third'])
  assert.deepEqual(reorderOutfitElements(items, 'second', 'backward').map(item => item.garmentId), ['second', 'garment-1', 'third'])
  assert.strictEqual(reorderOutfitElements(items, 'third', 'forward'), items)
  assert.strictEqual(reorderOutfitElements(items, 'missing', 'front'), items)
  assert.deepEqual(items, snapshot)
})

test('maps familiar and open category names to editable outfit roles', () => {
  for (const [category, role] of [
    ['衬衫', 'TOP'], ['西装外套', 'OUTER'], ['牛仔裤', 'BOTTOM'], ['连衣裙', 'ONE_PIECE'],
    ['运动鞋', 'SHOES'], ['棒球帽', 'HAT'], ['斜挎包', 'BAG'], ['围巾', 'ACCESSORY'], ['古着', 'OTHER'],
  ] as const) assert.equal(roleFromGarment({ category: [category] }), role)
})

test('new garments receive deterministic category positions without mutating earlier items', () => {
  const first = minimal()
  const before = structuredClone(first)
  const next = nextElementPosition('TOP', [first])
  assert.ok(Math.abs(next.x - first.x) >= 150)
  assert.ok(next.x - next.width / 2 >= 0 && next.x + next.width / 2 <= 1080)
  assert.ok(next.x >= 0 && next.x <= 1080)
  assert.ok(next.y >= 0 && next.y <= 1350)
  assert.deepEqual(first, before)
})

test('normalizes layer order and rotation without modifying the source scene', () => {
  const scene = [minimal({ rotation: -15, zIndex: 2 }), minimal({ garmentId: 'garment-2', rotation: 450, zIndex: 0 })]
  const normalized = normalizeScene({ version: 1, elements: scene })
  assert.deepEqual(normalized.elements.map((item) => [item.garmentId, item.rotation, item.zIndex]), [
    ['garment-2', 90, 0], ['garment-1', 345, 1],
  ])
  assert.deepEqual(scene.map((item) => item.zIndex), [2, 0])
})

test('only garment and layout values are sent to the outfit API', () => {
  const payload = sceneWrite({ version: 1, elements: [minimal()] })
  assert.deepEqual(Object.keys(payload.elements[0]).sort(), [
    'assetId', 'cropHeight', 'cropWidth', 'cropX', 'cropY', 'garmentId', 'garmentLabel', 'height', 'role', 'rotation', 'width', 'x', 'y', 'zIndex',
])
})

test('restores matching local drafts and flags drafts based on a different cloud revision', () => {
  const cloudScene: OutfitScene = { version: 1, elements: [minimal()] }
  const outfit = { id: 'outfit-1', name: '已保存', revision: 4, createdAtMs: 0, updatedAtMs: 0, scene: cloudScene } satisfies Outfit
  const draftScene: OutfitScene = { version: 1, elements: [minimal({ x: 520, rotation: 390, zIndex: 3 })] }
  const matching = restoreOutfitDraft(outfit, { name: '本机草稿', revision: 4, scene: draftScene })
  assert.equal(matching.name, '本机草稿')
  assert.equal(matching.restored, true)
  assert.equal(matching.conflict, false)
  assert.deepEqual([matching.scene.elements[0].x, matching.scene.elements[0].rotation, matching.scene.elements[0].zIndex], [520, 30, 0])
  const conflict = restoreOutfitDraft(outfit, { name: '另一处也改过', revision: 3, scene: draftScene })
  assert.equal(conflict.name, '另一处也改过')
  assert.equal(conflict.restored, true)
  assert.equal(conflict.conflict, true)
  const obsolete = restoreOutfitDraft(outfit, { name: '旧版草稿', revision: 4, scene: { version: 99, elements: [] } })
  assert.equal(obsolete.name, outfit.name)
  assert.equal(obsolete.restored, false)
})
