import test from 'node:test'
import assert from 'node:assert/strict'
import { aspectOf, autoFit, connectStep, cornerPosition, fitBox, nearestCorner, pipSize, shutterIntent, swipeDirection, tryOnPhase, type PhaseInput } from '../src/tryon/stage.ts'

const base: PhaseInput = { enabled: true, cameraReady: true, busy: false, live: false, queued: false, offered: false, reclaiming: false, frameReady: false, recording: false }
const phase = (patch: Partial<PhaseInput>) => tryOnPhase({ ...base, ...patch })

test('a connected session is not shown as trying on until a real frame arrives', () => {
  assert.equal(phase({ live: true }), 'connecting')
  assert.equal(phase({ busy: true }), 'connecting')
  assert.equal(phase({ live: true, frameReady: true }), 'live')
  assert.equal(phase({ live: true, frameReady: true, recording: true }), 'recording')
})
test('reclaiming wins so a closing session never looks usable', () => {
  assert.equal(phase({ live: true, frameReady: true, recording: true, reclaiming: true }), 'stopping')
  assert.equal(phase({ live: true, queued: true }), 'queued')
  assert.equal(phase({ live: true, offered: true }), 'offered')
})
test('without a camera or permission the page falls back to its cover', () => {
  assert.equal(phase({ cameraReady: false }), 'cover')
  assert.equal(phase({ cameraReady: false, busy: true }), 'cover')
  assert.equal(phase({ enabled: false, cameraReady: false }), 'off')
  assert.equal(phase({}), 'preview')
})
test('the shutter stays one control: never starts billing without garments, always cancellable', () => {
  assert.equal(shutterIntent('preview', '拍照', false, true), 'pick')
  assert.equal(shutterIntent('preview', '拍照', true, false), 'disabled')
  assert.equal(shutterIntent('preview', '录像', true, true), 'start')
  assert.equal(shutterIntent('connecting', '拍照', true, true), 'cancel')
  assert.equal(shutterIntent('queued', '拍照', true, true), 'cancel')
  assert.equal(shutterIntent('offered', '拍照', true, true), 'accept')
  assert.equal(shutterIntent('live', '拍照', true, true), 'photo')
  assert.equal(shutterIntent('live', '录像', true, true), 'record')
  assert.equal(shutterIntent('recording', '拍照', true, true), 'stop-record')
  assert.equal(shutterIntent('stopping', '拍照', true, true), 'wait')
})
test('fills a phone only while the body survives the crop', () => {
  assert.equal(autoFit(390, 844, 9 / 16), 'cover')
  assert.equal(autoFit(390, 844, 3 / 4), 'contain')
  assert.equal(autoFit(844, 390, 9 / 16), 'contain')
  assert.equal(autoFit(0, 0, 9 / 16), 'contain')
})
test('the desktop stage keeps the real aspect inside the available area', () => {
  assert.deepEqual(fitBox({ width: 1000, height: 800 }, 16 / 9), { width: 1000, height: 563 })
  assert.deepEqual(fitBox({ width: 1000, height: 800 }, 9 / 16), { width: 450, height: 800 })
  assert.deepEqual(fitBox({ width: 0, height: 800 }, 1), { width: 0, height: 0 })
})
test('the small window keeps its source shape and snaps clear of the controls', () => {
  const stage = { width: 390, height: 844 }, pip = pipSize(stage, 9 / 16, true), insets = { top: 60, right: 12, bottom: 250, left: 12 }
  assert.deepEqual(pip, { width: 83, height: 148 })
  assert.deepEqual(pipSize(stage, 16 / 9, true), { width: 148, height: 83 })
  assert.deepEqual(cornerPosition('top-right', stage, pip, insets), { x: 295, y: 60 })
  assert.deepEqual(cornerPosition('bottom-left', stage, pip, insets), { x: 12, y: 446 })
  assert.equal(nearestCorner(10, 500, stage, pip), 'bottom-left')
  assert.equal(nearestCorner(300, 20, stage, pip), 'top-right')
})
test('every startup stage maps forward and every aspect has a preset', () => {
  assert.deepEqual([undefined, 'CREATING_SESSION', 'JOINING_RTC', 'PUBLISHING', 'WAITING_FRAME'].map(s => connectStep(s as never)), [0, 1, 1, 2, 3])
  assert.equal(aspectOf('3:4')?.preset, 'resolution1152x1536')
  assert.equal(aspectOf('2:1'), undefined)
})
test('a vertical scroll or small drag never changes the capture mode', () => {
  assert.equal(swipeDirection(-80, 10), 'left')
  assert.equal(swipeDirection(90, -20), 'right')
  assert.equal(swipeDirection(30, 0), null)
  assert.equal(swipeDirection(70, 70), null)
})
