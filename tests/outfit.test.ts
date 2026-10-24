import assert from 'node:assert/strict'
import test from 'node:test'
import { arrangeOutfit, orderOutfitLayers } from '../src/domain/outfit-layout.ts'
import { dropOutfitLayer, copySticker, stickerLimit, elementKey, normalizeScene, nextElementPosition, outfitDropPosition, reorderOutfitElements, restoreOutfitDraft, roleFromGarment, sceneWrite, type Outfit, type OutfitElement, type OutfitScene } from '../src/domain/outfit.ts'

const minimal = (overrides: Partial<OutfitElement> = {}): OutfitElement => ({
  garmentId: 'garment-1', assetId: 'asset-1', role: 'TOP', x: 420, y: 320, width: 440, height: 580,
  rotation: 0, zIndex: 0, garmentLabel: '白色 衬衫', cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1,
  assetUrl: '/private/asset.png', imageWidth: 600, imageHeight: 800, assetKind: 'SEGMENT', ...overrides,
})

test('plain top, bottom and shoes retain their original layout coordinates', () => {
  const result = arrangeOutfit({ version: 2, elements: [
    minimal({ garmentId: 'top', imageWidth: 500, imageHeight: 400 }),
    minimal({ garmentId: 'bottom', role: 'BOTTOM', imageWidth: 400, imageHeight: 500 }),
    minimal({ garmentId: 'shoes', role: 'SHOES', imageWidth: 240, imageHeight: 120 }),
  ] })
  assert.deepEqual(result.elements.map(({ garmentId, x, y, width, height, zIndex }) => ({ garmentId, x, y, width, height, zIndex })), [
    { garmentId: 'bottom', x: 540, y: 799, width: 400, height: 500, zIndex: 0 },
    { garmentId: 'top', x: 540, y: 371, width: 500, height: 400, zIndex: 1 },
    { garmentId: 'shoes', x: 540, y: 1119, width: 240, height: 120, zIndex: 2 },
  ])
})

test('one-piece and shoes retain their original layout coordinates', () => {
  const result = arrangeOutfit({ version: 2, elements: [
    minimal({ garmentId: 'dress', role: 'ONE_PIECE', imageWidth: 510, imageHeight: 800 }),
    minimal({ garmentId: 'shoes', role: 'SHOES', imageWidth: 240, imageHeight: 120 }),
  ] })
  assert.deepEqual(result.elements.map(({ garmentId, x, y, width, height, zIndex }) => ({ garmentId, x, y, width, height, zIndex })), [
    { garmentId: 'dress', x: 540, y: 610, width: 510, height: 800, zIndex: 0 },
    { garmentId: 'shoes', x: 540, y: 1080, width: 240, height: 120, zIndex: 1 },
  ])
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
    ['针织开衫', 'OUTER'], ['西装裤', 'BOTTOM'], ['连帽卫衣', 'TOP'], ['背心裙', 'ONE_PIECE'],
    ['衬衫连衣裙', 'ONE_PIECE'], ['连体裤', 'ONE_PIECE'], ['裙装', 'OTHER'], ['马甲裙', 'ONE_PIECE'],
    ['马甲', 'OUTER'], ['牛仔背心', 'OUTER'], ['针织背心', 'OUTER'], ['背心', 'TOP'], ['吊带背心', 'TOP'],
    ['cardigan', 'OUTER'], ['skirt', 'BOTTOM'], ['hoodie', 'TOP'], ['dress', 'ONE_PIECE'],
    // Full-body enhancement (D43): tights are not trousers; pinafores sit in the one-piece slot; hair accessories on the head.
    ['连裤袜', 'ACCESSORY'], ['过膝袜', 'ACCESSORY'], ['袜靴', 'SHOES'], ['小黑裙', 'ONE_PIECE'], ['礼服裙', 'ONE_PIECE'],
    ['洛丽塔OP', 'ONE_PIECE'], ['洛丽塔SK', 'BOTTOM'], ['洛丽塔JSK', 'ONE_PIECE'], ['背带裙', 'ONE_PIECE'], ['水手服套装', 'ONE_PIECE'],
    ['伞裙', 'BOTTOM'], ['发箍', 'HAT'], ['KC', 'HAT'], ['小熊玩偶', 'ACCESSORY'], ['娃娃领衬衫', 'TOP'], ['手拿包', 'BAG'],
  ] as const) assert.equal(roleFromGarment({ category: [category] }), role, category)
})

const intersectionWidth = (a: OutfitElement, b: OutfitElement) => Math.max(0, Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2))
const intersectionArea = (a: OutfitElement, b: OutfitElement) => intersectionWidth(a, b) * Math.max(0, Math.min(a.y + a.height / 2, b.y + b.height / 2) - Math.max(a.y - a.height / 2, b.y - b.height / 2))
function assertInsideCanvas(item: OutfitElement) {
  assert.ok(item.x - item.width / 2 >= 16 - 1e-9)
  assert.ok(item.x + item.width / 2 <= 1064 + 1e-9)
  assert.ok(item.y - item.height / 2 >= 16 - 1e-9)
  assert.ok(item.y + item.height / 2 <= 1334 + 1e-9)
}

test('overalls and tops lie side by side inside the canvas, with shoes centered below', () => {
  for (const category of ['背带裤', '牛仔背带裤', '背带裙', '洛丽塔JSK', 'overalls']) {
    for (const topRatio of [.15, .3, .75, 1, 2, 5]) for (const overallRatio of [.15, .3, .75, 1, 2, 5]) {
      const role = roleFromGarment({ category: [category] })
      assert.equal(role, 'ONE_PIECE', 'board roles retain the existing API contract')
      const scene: OutfitScene = { version: 2, elements: [
        minimal({ garmentId: 'overall', role, imageWidth: 600, imageHeight: 600 / overallRatio }),
        minimal({ garmentId: 'top', zIndex: 1, imageWidth: 600, imageHeight: 600 / topRatio }),
        minimal({ garmentId: 'shoes', role: 'SHOES', imageWidth: 240, imageHeight: 120 }),
      ] }
      const before = structuredClone(scene)
      const arranged = arrangeOutfit(scene).elements
      const [top, overall, shoes] = arranged
      assert.deepEqual(arranged.map(item => item.garmentId), ['top', 'overall', 'shoes'])
      assert.ok(top.x + top.width / 2 < overall.x - overall.width / 2)
      assert.equal(intersectionArea(top, overall), 0)
      assert.ok(Math.abs(top.width / overall.width - 500 / 510) < 1e-9, 'comparable widths')
      assert.equal(shoes.x, 540)
      assert.ok(shoes.y - shoes.height / 2 > Math.max(top.y + top.height / 2, overall.y + overall.height / 2))
      for (const item of arranged) assertInsideCanvas(item)
      assert.deepEqual(scene, before)
    }
  }
})

test('lower pieces never overlap more than fifteen percent of the top area', () => {
  for (const lowerRole of ['BOTTOM', 'ONE_PIECE'] as const) {
    for (const topRatio of [.15, .75, 1, 5]) for (const lowerRatio of [.15, .75, 1, 5]) {
      const arranged = arrangeOutfit({ version: 2, elements: [
        minimal({ garmentId: 'top', imageWidth: 500, imageHeight: 500 / topRatio }),
        minimal({ garmentId: 'lower', role: lowerRole, imageWidth: 400, imageHeight: 400 / lowerRatio }),
      ] }).elements
      const top = arranged.find(item => item.garmentId === 'top')!, lower = arranged.find(item => item.garmentId === 'lower')!
      assert.ok(intersectionArea(top, lower) <= .15 * top.width * top.height + 1e-9)
    }
  }
})

test('flat lays retain cropped aspect ratios, accessory slots and person-part geometry', () => {
  const person = minimal({ garmentId: 'person', kind: 'PERSON_PART', x: 700, y: 800, rotation: 15, freeStretch: true })
  const scene: OutfitScene = { version: 2, elements: [
    person, minimal({ garmentId: 'top', cropWidth: .6, cropHeight: .8 }),
    minimal({ garmentId: 'overall', role: roleFromGarment({ category: ['背带裙'] }) }),
    minimal({ garmentId: 'bag', role: 'BAG' }), minimal({ garmentId: 'scarf', role: 'ACCESSORY' }),
  ] }
  const arranged = arrangeOutfit(scene).elements
  const top = arranged.find(item => item.garmentId === 'top')!
  assert.ok(Math.abs(top.width / top.height - 600 * .6 / (800 * .8)) < 1e-9)
  assert.deepEqual(arranged[0], { ...person, elementId: 'person', flipX: false })
  assert.deepEqual(arranged.filter(item => ['bag', 'scarf'].includes(item.garmentId)).map(({ x, y }) => [x, y]), [[190, 350], [875, 350]])
})

test('AI layouts keep outerwear above tops and dresses regardless of selection order', () => {
  for (const bodyRole of ['TOP', 'ONE_PIECE'] as const) {
    const scene: OutfitScene = { version: 2, elements: [minimal({ garmentId: 'outer', role: 'OUTER' }), minimal({ garmentId: 'body', role: bodyRole, zIndex: 1 })] }
    const before = structuredClone(scene)
    const ordered = orderOutfitLayers(scene)
    assert.deepEqual(ordered.elements.map(item => item.garmentId), ['body', 'outer'])
    assert.equal(ordered.elements[1].x, scene.elements[0].x)
    assert.deepEqual(arrangeOutfit(scene).elements.map(item => item.garmentId), ['body', 'outer'])
    assert.deepEqual(scene, before)
  }
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


test('legacy scenes upgrade without moving garments or changing layer order', () => {
  const source = { version: 1, elements: [minimal({ x: 250, zIndex: 1 }), minimal({ garmentId: 'other', y: 810, zIndex: 0 })] }
  const upgraded = normalizeScene(source)
  assert.equal(upgraded.version, 2)
  assert.deepEqual(upgraded.elements.map(item => [elementKey(item), item.x, item.y]), [['other', 420, 810], ['garment-1', 250, 320]])
  assert.ok(upgraded.elements.every(item => item.kind === 'GARMENT' && !item.flipX && !item.freeStretch))
  assert.equal(source.version, 1)
})
test('copies and layers address instances even when they share one source', () => {
  const item = minimal({ elementId: 'instance-1', kind: 'PERSON_PART', stickerId: 'chibi/head', flipX: true, freeStretch: true, cropWidth: .8 })
  const copy = copySticker(item, 1)
  assert.notEqual(copy.elementId, item.elementId)
  assert.equal(copy.stickerId, item.stickerId)
  assert.deepEqual([copy.flipX, copy.freeStretch, copy.cropWidth, copy.x, copy.y], [true, true, .8, 450, 350])
  const ordered = reorderOutfitElements([item, copy], elementKey(copy), 'back')
  assert.deepEqual(ordered.map(elementKey), [elementKey(copy), elementKey(item)])
  assert.equal(item.zIndex, 0)
})
test('v2 person writes contain a versioned source but no garment reference or image URL', () => {
  const person = minimal({ elementId: 'person-1', kind: 'PERSON_PART', stickerId: 'sketch/head', stickerVersion: 1, flipX: true })
  const payload = sceneWrite({ version: 2, elements: [person] }).elements[0]
  assert.equal(payload.kind, 'PERSON_PART')
  assert.equal(payload.stickerVersion, 1)
  assert.ok(!('garmentId' in payload) && !('assetId' in payload) && !('assetUrl' in payload))
  assert.equal(payload.flipX, true)
})
test('total and garment limits apply independently to mixed collages', () => {
  const garments = Array.from({ length: 32 }, () => minimal({ kind: 'GARMENT' }))
  assert.ok(stickerLimit(garments, 'GARMENT'))
  assert.equal(stickerLimit(garments, 'PERSON_PART'), null)
  const mixed = [...garments, ...Array.from({ length: 32 }, () => minimal({ kind: 'PERSON_PART' }))]
  assert.ok(stickerLimit(mixed, 'PERSON_PART'))
  assert.equal(stickerLimit(mixed.slice(1), 'GARMENT'), null)
})


test('dragged layers insert above or below targets without changing geometry or the undo source', () => {
  const items = [minimal({ elementId: 'a' }), minimal({ elementId: 'b', zIndex: 1 }), minimal({ elementId: 'c', zIndex: 2 })]
  const before = structuredClone(items)
  const above = dropOutfitLayer(items, 'a', 'c', true)
  assert.deepEqual(above.map(elementKey), ['b', 'c', 'a'])
  assert.deepEqual(above.map(item => item.zIndex), [0, 1, 2])
  assert.deepEqual(dropOutfitLayer(items, 'c', 'b', false).map(elementKey), ['a', 'c', 'b'])
  assert.deepEqual(above[2], { ...items[0], zIndex: 2 })
  assert.deepEqual(items, before)
  assert.strictEqual(dropOutfitLayer(items, 'a', 'a', true), items)
  assert.strictEqual(dropOutfitLayer(items, 'a', 'missing', true), items)
  assert.strictEqual(dropOutfitLayer(items, 'c', 'b', true), items)
})


test('collage layout exposes the body beside outerwear instead of covering it', () => {
  for (const bodyRole of ['TOP', 'ONE_PIECE'] as const) {
    for (const ratio of [.3, 1, 2]) {
      const input: OutfitScene = { version: 2, elements: [minimal({ garmentId: 'outer', role: 'OUTER', width: 600, height: 600 / ratio, imageWidth: 600, imageHeight: 600 / ratio }), minimal({ garmentId: 'body', role: bodyRole })] }
      const result = arrangeOutfit(input)
      const body = result.elements.find(e => e.garmentId === 'body')!, outer = result.elements.find(e => e.garmentId === 'outer')!
      assert.ok(body.x + body.width / 2 + 16 <= outer.x - outer.width / 2)
      assert.ok(1 - intersectionWidth(body, outer) / body.width >= .45, 'at least 45% of inner width stays uncovered')
      assert.ok(outer.zIndex > body.zIndex)
      for (const item of result.elements) { assert.ok(item.x - item.width / 2 >= 16); assert.ok(item.x + item.width / 2 <= 1064); assert.ok(item.y + item.height / 2 <= 1334) }
      assert.equal(input.elements[0]!.width, 600)
    }
  }
})

test('outerwear stays beside both garments when a top is paired with overalls', () => {
  for (const ratio of [.15, .75, 5]) {
    const arranged = arrangeOutfit({ version: 2, elements: [
      minimal({ garmentId: 'outer', role: 'OUTER', imageWidth: 600, imageHeight: 600 / ratio }),
      minimal({ garmentId: 'top' }), minimal({ garmentId: 'overall', role: 'ONE_PIECE' }),
    ] }).elements
    const outer = arranged.find(item => item.role === 'OUTER')!
    for (const inner of arranged.filter(item => item !== outer)) {
      assert.ok(1 - intersectionWidth(inner, outer) / inner.width >= .45)
      assert.ok(outer.zIndex > inner.zIndex)
    }
    for (const item of arranged) assertInsideCanvas(item)
  }
})
