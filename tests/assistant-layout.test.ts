import test from 'node:test'
import assert from 'node:assert/strict'
import { centerSize, clampHeight, clampPosition, clampWidth, heightBounds, keyboardSize, migrateMode, restoreLayout, widthBounds } from '../src/agent/assistantLayout.ts'
test('assistant layout: defaults to the centre window and migrates either legacy pin value', () => {
  assert.deepEqual(restoreLayout(null, null), { mode: 'center', width: 460, floatingHeight: 820, centerWidth: 720, centerHeight: 680 })
  assert.equal(migrateMode(undefined, 'true'), 'center')
  assert.equal(migrateMode(undefined, 'false'), 'floating')
  assert.equal(migrateMode('docked', 'false'), 'docked')
  assert.equal(migrateMode('invalid', 'true'), 'center')
})
test('assistant layout: recovers malformed storage and invalid sizes without losing legacy mode', () => {
  assert.deepEqual(restoreLayout('{', 'false'), { mode: 'floating', width: 460, floatingHeight: 820, centerWidth: 720, centerHeight: 680 })
  assert.deepEqual(restoreLayout('{"version":2,"mode":"docked","width":"800","floatingHeight":null}', null), { mode: 'docked', width: 460, floatingHeight: 820, centerWidth: 720, centerHeight: 680 })
  assert.deepEqual(restoreLayout('{"version":2,"mode":"floating","width":780,"floatingHeight":650}', 'true'), { mode: 'floating', width: 780, floatingHeight: 650, centerWidth: 720, centerHeight: 680 })
})
test('assistant layout: caps width by 70 percent, 960px and the docked app space', () => {
  assert.deepEqual(widthBounds(1024, 'overlay'), { min: 360, max: 716 })
  assert.deepEqual(widthBounds(1024, 'docked'), { min: 360, max: 464 })
  assert.equal(clampWidth(960, 1200, 'docked'), 640)
  assert.equal(clampWidth(2000, 2000, 'floating'), 960)
  assert.equal(clampWidth(20, 1440, 'overlay'), 360)
  assert.equal(clampWidth(NaN, 1440, 'overlay'), 460)
  assert.equal(clampWidth(460, 1024, 'docked'), 460)
})
test('assistant layout: keeps floating height within short viewports and restores the preferred size on larger ones', () => {
  assert.equal(clampHeight(820, 900), 820)
  assert.equal(clampHeight(820, 600), 568)
  assert.equal(clampHeight(100, 900), 420)
  assert.equal(clampHeight(820, 400), 368)
  assert.deepEqual(heightBounds(400), { min: 368, max: 368 })
})
test('assistant layout: supports keyboard increments, anchored left edges, endpoints and clamping', () => {
  const bounds = widthBounds(1024, 'docked')
  assert.equal(keyboardSize('ArrowRight', 400, bounds), 424)
  assert.equal(keyboardSize('ArrowLeft', 400, bounds, -1), 424)
  assert.equal(keyboardSize('ArrowLeft', 360, bounds), 360)
  assert.equal(keyboardSize('ArrowRight', 460, bounds), 464)
  assert.equal(keyboardSize('Home', 400, bounds), 360)
  assert.equal(keyboardSize('End', 400, bounds), 464)
  assert.equal(keyboardSize('Enter', 400, bounds), null)
})
test('assistant layout: reclamps the floating position when either size or viewport changes', () => {
  const point = { x: 800, y: 300 }
  assert.deepEqual(clampPosition(point, { width: 1440, height: 1000 }, { width: 460, height: 420 }), point)
  assert.deepEqual(clampPosition(point, { width: 1440, height: 1000 }, { width: 960, height: 820 }), { x: 472, y: 172 })
  assert.deepEqual(clampPosition(point, { width: 1024, height: 600 }, { width: 700, height: 568 }), { x: 316, y: 24 })
  assert.deepEqual(clampPosition({ x: -10, y: -20 }, { width: 1024, height: 600 }, { width: 460, height: 568 }), { x: 8, y: 8 })
})

test('assistant layout: pre-redesign saves open once in the centre window, keeping their sizes', () => {
  assert.deepEqual(restoreLayout('{"mode":"docked","width":600,"floatingHeight":700}', null), { mode: 'center', width: 600, floatingHeight: 700, centerWidth: 720, centerHeight: 680 })
  assert.deepEqual(restoreLayout('{"version":2,"mode":"center","width":600,"floatingHeight":700}', null), { mode: 'center', width: 600, floatingHeight: 700, centerWidth: 720, centerHeight: 680 })
  assert.deepEqual(centerSize({ width: 1440, height: 900 }, 100), { width: 720, height: 680 })
  assert.deepEqual(centerSize({ width: 600, height: 700 }, 100), { width: 568, height: 528 })
})
test('assistant layout: the centre window keeps a dragged size within the screen, and restores it', () => {
  assert.deepEqual(centerSize({ width: 1440, height: 900 }, 100, { width: 2000, height: 100 }), { width: 1100, height: 360 })
  assert.deepEqual(centerSize({ width: 1440, height: 900 }, 100, { width: 900, height: 600 }), { width: 900, height: 600 })
  assert.deepEqual(restoreLayout('{"version":2,"mode":"center","width":460,"floatingHeight":820,"centerWidth":900,"centerHeight":600}', null), { mode: 'center', centerWidth: 900, centerHeight: 600, width: 460, floatingHeight: 820 })
})
