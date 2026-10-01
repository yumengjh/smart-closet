import assert from 'node:assert/strict'
import test from 'node:test'
import { outfitViewGeometry, outfitWheelZoom } from '../src/domain/outfit-view.ts'

test('fit keeps every board edge inside the viewport without a fixed size cap', () => {
  for (const [width, height] of [[320, 600], [760, 764], [1600, 1800]]) {
    const view = outfitViewGeometry(width, height, 1)
    assert.ok(view.stageWidth <= width - 47)
    assert.ok(view.stageHeight <= height - 47)
    assert.ok(view.spaceWidth >= view.stageWidth + width)
    assert.ok(view.spaceHeight >= view.stageHeight + height)
  }
  assert.ok(outfitViewGeometry(1600, 1800, 1).scale > .6)
  assert.equal(outfitViewGeometry(390, 644, 1, 24).stageWidth, 366)
})

test('zoom workspace can preserve a pointer anchor and reach both board edges', () => {
  const width = 900, height = 700
  const initial = outfitViewGeometry(width, height, 1)
  const enlarged = outfitViewGeometry(width, height, 2)
  for (const fraction of [0, .25, .5, .75, 1]) {
    const pointer = width / 2 + (fraction - .5) * initial.stageWidth
    const scroll = (enlarged.spaceWidth - enlarged.stageWidth) / 2 + fraction * enlarged.stageWidth - pointer
    assert.ok(scroll >= 0 && scroll <= enlarged.spaceWidth - width)
    assert.equal((enlarged.spaceWidth - enlarged.stageWidth) / 2 + fraction * enlarged.stageWidth - scroll, pointer)
  }
})

test('wheel zoom is reversible, normalizes line/page units and stops at limits', () => {
  const zoom = outfitWheelZoom(1, -120, 0, 700)
  assert.ok(zoom > 1)
  assert.ok(Math.abs(outfitWheelZoom(zoom, 120, 0, 700) - 1) < 1e-12)
  assert.equal(outfitWheelZoom(1, 1, 1, 700), outfitWheelZoom(1, 16, 0, 700))
  assert.equal(outfitWheelZoom(1, 1, 2, 700), outfitWheelZoom(1, 700, 0, 700))
  assert.equal(outfitWheelZoom(1, -10000, 0, 700), 4)
  assert.equal(outfitWheelZoom(1, 10000, 0, 700), .25)
})
