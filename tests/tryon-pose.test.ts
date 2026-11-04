import test from 'node:test'
import assert from 'node:assert/strict'
import { AbsenceWatch, SteadyCheck, checkFrame, present, seen, type Point } from '../src/tryon/pose/checks.ts'

const STANDING: Record<number, [number, number]> = {
  0: [0.5, 0.15], 2: [0.48, 0.13], 5: [0.52, 0.13], 7: [0.45, 0.14], 8: [0.55, 0.14],
  11: [0.4, 0.3], 12: [0.6, 0.3], 13: [0.38, 0.45], 14: [0.62, 0.45], 15: [0.37, 0.7], 16: [0.63, 0.7],
  23: [0.44, 0.6], 24: [0.56, 0.6], 25: [0.45, 0.78], 26: [0.55, 0.78], 27: [0.45, 0.93], 28: [0.55, 0.93],
  29: [0.45, 0.96], 30: [0.55, 0.96], 31: [0.44, 0.97], 32: [0.56, 0.97],
}
/** 33 points, all hidden except the given ones; overrides move or hide (null) single points. */
function pose(base = STANDING, overrides: Record<number, [number, number] | null> = {}): Point[] {
  const map = { ...base, ...overrides }
  return Array.from({ length: 33 }, (_, i) => map[i] ? { x: map[i]![0], y: map[i]![1], visibility: 0.9 } : { x: 0.5, y: 0.5, visibility: 0.1 })
}
const hide = (...ids: number[]) => Object.fromEntries(ids.map(i => [i, null]))
const UPPER_ONLY = hide(25, 26, 27, 28, 29, 30, 31, 32)

test('nobody in frame, or no landmarks at all, asks the person to step in', () => {
  assert.deepEqual(checkFrame([], ['TOP']), { status: 'absent', hint: '请站到画面中' })
  assert.equal(checkFrame(pose({}), ['TOP']).status, 'absent')
  assert.equal(present(pose()), true)
})
test('points on the frame edge are treated as cropped, not seen', () => {
  assert.equal(seen(pose(STANDING, { 27: [0.45, 0.99] }), 27), false)
  assert.equal(seen(pose(), 27), true)
})
test('lower-body garments need hips to ankles; upper-body garments do not', () => {
  assert.match(checkFrame(pose(STANDING, UPPER_ONLY), ['BOTTOM']).hint, /腰部到脚踝/)
  assert.equal(checkFrame(pose(STANDING, UPPER_ONLY), ['TOP']).status, 'ready')
  assert.equal(checkFrame(pose(), ['BOTTOM', 'SHOES', 'ONE_PIECE']).status, 'ready')
  assert.match(checkFrame(pose(STANDING, hide(29, 30, 31, 32, 27, 28)), ['SHOES']).hint, /双脚/)
})
test('head accessories need a frontal face; ear jewellery needs an ear', () => {
  assert.equal(checkFrame(pose(), ['GLASSES']).status, 'ready')
  assert.match(checkFrame(pose(STANDING, { 0: [0.58, 0.15] }), ['GLASSES']).hint, /正对镜头/)
  assert.match(checkFrame(pose(STANDING, hide(7, 8)), ['EAR']).hint, /耳后/)
})
test('hand items need a raised hand; wrist items also need the elbow', () => {
  assert.match(checkFrame(pose(), ['WRIST']).hint, /抬到胸前/)
  assert.equal(checkFrame(pose(STANDING, { 15: [0.37, 0.4] }), ['WRIST']).status, 'ready')
  assert.match(checkFrame(pose(STANDING, { 15: [0.37, 0.4], ...hide(13) }), ['WRIST']).hint, /抬到胸前/)
  assert.equal(checkFrame(pose(STANDING, { 15: [0.37, 0.4], ...hide(13) }), ['HANDHELD']).status, 'ready')
})
test('several garments report only the first unmet part, hands before legs', () => {
  assert.match(checkFrame(pose(STANDING, UPPER_ONLY), ['BOTTOM', 'HANDHELD']).hint, /拿东西/)
  assert.match(checkFrame(pose(STANDING, { ...UPPER_ONLY, 15: [0.37, 0.4] }), ['BOTTOM', 'HANDHELD']).hint, /腰部到脚踝/)
})
test('too close only matters for body garments, not for glasses', () => {
  const close = pose(STANDING, { 11: [0.1, 0.5], 12: [0.9, 0.5] })
  assert.match(checkFrame(close, ['TOP']).hint, /太近/)
  assert.notEqual(checkFrame(close, ['GLASSES']).hint, '离镜头太近了，请后退一些')
})
test('positions without a rule only need a person in frame', () => {
  assert.equal(checkFrame(pose(STANDING, UPPER_ONLY), ['ACCESSORY', 'OTHER', null, undefined]).status, 'ready')
})
test('a changed result must hold for 0.6 s before it replaces the shown one', () => {
  const steady = new SteadyCheck(600), ready = { status: 'ready', hint: '取景就绪' } as const, adjust = { status: 'adjust', hint: '请把手抬到胸前' } as const
  assert.equal(steady.update(ready, 0), ready)
  assert.equal(steady.update(adjust, 100), ready)
  assert.equal(steady.update(adjust, 500), ready)
  assert.equal(steady.update(ready, 600), ready)
  assert.equal(steady.update(adjust, 700), ready)
  assert.equal(steady.update(adjust, 1300), adjust)
})
test('nobody in frame warns after 10 s, stops after 30 s, and presence or "still here" resets it', () => {
  const watch = new AbsenceWatch(10_000, 30_000)
  assert.deepEqual(watch.update(false, 0), { state: 'ok' })
  assert.deepEqual(watch.update(false, 10_000), { state: 'warn', secondsLeft: 20 })
  assert.deepEqual(watch.update(true, 12_000), { state: 'ok' })
  watch.update(false, 20_000)
  watch.snooze(35_000)
  assert.deepEqual(watch.update(false, 44_000), { state: 'ok' })
  assert.deepEqual(watch.update(false, 65_000), { state: 'stop' })
})
