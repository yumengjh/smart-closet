import test from 'node:test'
import assert from 'node:assert/strict'
import { VoiceGate, bodySpan, coverage, guideLine, isFar, partsFor, projectY, scopeOf, setupTip, type Setup } from '../src/tryon/guide.ts'
import type { Point } from '../src/tryon/pose/checks.ts'

const STANDING: Record<number, [number, number]> = {
  0: [0.5, 0.15], 2: [0.48, 0.13], 5: [0.52, 0.13], 7: [0.45, 0.14], 8: [0.55, 0.14],
  11: [0.4, 0.3], 12: [0.6, 0.3], 13: [0.38, 0.45], 14: [0.62, 0.45], 15: [0.37, 0.7], 16: [0.63, 0.7],
  23: [0.44, 0.6], 24: [0.56, 0.6], 25: [0.45, 0.78], 26: [0.55, 0.78], 27: [0.45, 0.93], 28: [0.55, 0.93],
}
function pose(base = STANDING, overrides: Record<number, [number, number] | null> = {}): Point[] {
  const map = { ...base, ...overrides }
  return Array.from({ length: 33 }, (_, i) => map[i] ? { x: map[i]![0], y: map[i]![1], visibility: 0.9 } : { x: 0.5, y: 0.5, visibility: 0.1 })
}
const hide = (...ids: number[]) => Object.fromEntries(ids.map(i => [i, null]))
const PHONE_FRONT: Setup = { device: 'phone', front: true, portrait: true }

test('parts follow the selected wearing roles, top to bottom, without duplicates', () => {
  assert.deepEqual(partsFor([]), [])
  assert.deepEqual(partsFor(['TOP']), ['shoulders', 'hips'])
  assert.deepEqual(partsFor(['SHOES', 'HAT']), ['head', 'feet'])
  assert.deepEqual(partsFor(['BOTTOM', 'TOP']), ['shoulders', 'hips', 'knees', 'feet'])
  assert.deepEqual(partsFor(['HANDHELD']), ['hands'])
  assert.deepEqual(partsFor(['ACCESSORY', undefined]), ['shoulders', 'hips'], 'unknown roles fall back to the upper body')
})

test('scope picks the widest framing the parts need', () => {
  assert.equal(scopeOf(partsFor(['SHOES'])), 'full')
  assert.equal(scopeOf(partsFor(['BELT'])), 'full')
  assert.equal(scopeOf(partsFor(['TOP', 'GLASSES'])), 'upper')
  assert.equal(scopeOf(partsFor(['WRIST'])), 'hands')
  assert.equal(scopeOf(partsFor(['EAR'])), 'head')
})

test('coverage lights only the parts that are in frame', () => {
  const upper = pose(STANDING, hide(25, 26, 27, 28))
  assert.deepEqual(coverage(upper, ['shoulders', 'hips', 'knees', 'feet']).map(c => [c.label, c.on]), [['肩', true], ['腰', true], ['膝', false], ['脚', false]])
  assert.ok(coverage(pose(), ['head', 'hands', 'feet']).every(c => c.on))
  assert.ok(coverage([], ['head']).every(c => !c.on), 'no landmarks, nothing lit')
})

test('far: knees in frame or narrow shoulders, only when the body matters', () => {
  assert.equal(isFar(pose(), 'full'), true)
  assert.equal(isFar(pose(STANDING, { ...hide(25, 26, 27, 28), 11: [0.45, 0.3], 12: [0.55, 0.3] }), 'upper'), true)
  assert.equal(isFar(pose(STANDING, { ...hide(25, 26, 27, 28), 11: [0.35, 0.3], 12: [0.65, 0.3] }), 'upper'), false, 'shoulders 0.3 apart is close')
  assert.equal(isFar(pose(), 'head'), false, 'leaning in for earrings is right')
  assert.equal(isFar([], 'full'), false)
})

test('setup tips fit the device, camera and orientation', () => {
  assert.match(setupTip(PHONE_FRONT, 'full'), /靠墙放稳.*后退两三步/)
  assert.match(setupTip({ ...PHONE_FRONT, portrait: false }, 'full'), /竖过来/)
  assert.match(setupTip({ ...PHONE_FRONT, front: false }, 'full'), /请朋友帮忙拍/)
  assert.match(setupTip({ device: 'tablet', front: true, portrait: true }, 'upper'), /^把平板放稳/)
  assert.match(setupTip({ device: 'desktop', front: true, portrait: false }, 'full'), /两米/)
  assert.doesNotMatch(setupTip({ device: 'desktop', front: true, portrait: false }, 'full'), /竖过来/, 'a landscape desktop is normal')
})

test('guide line: setup tip until someone is seen, then the frame check', () => {
  assert.deepEqual(guideLine(null, PHONE_FRONT, 'full'), { tone: 'tip', text: setupTip(PHONE_FRONT, 'full') })
  assert.equal(guideLine({ status: 'absent', hint: '请站到画面中' }, PHONE_FRONT, 'full').tone, 'tip')
  assert.deepEqual(guideLine({ status: 'adjust', hint: '请让双脚进入画面' }, PHONE_FRONT, 'full'), { tone: 'adjust', text: '请让双脚进入画面' })
  assert.equal(guideLine({ status: 'ready', hint: '取景就绪' }, PHONE_FRONT, 'full').tone, 'ready')
})

test('voice gate spaces lines out and does not repeat itself', () => {
  const gate = new VoiceGate(3500, 15_000)
  assert.equal(gate.next('请后退一些', 0), '请后退一些')
  assert.equal(gate.next('请后退一些', 5000), null, 'same line again')
  assert.equal(gate.next('请让双脚进入画面', 1000), null, 'too soon after the last one')
  assert.equal(gate.next('请让双脚进入画面', 4000), '请让双脚进入画面')
  assert.equal(gate.next('请后退一些', 8000), null, 'said 8 s ago')
  assert.equal(gate.next('请后退一些', 16_000), '请后退一些')
  assert.equal(gate.next('', 40_000), null)
})

test('body span pads the visible range and gives up on a sliver', () => {
  const span = bodySpan(pose())!
  assert.ok(Math.abs(span.top - 0.09) < 1e-9 && Math.abs(span.bottom - 0.97) < 1e-9)
  assert.equal(bodySpan(pose({ 0: [0.5, 0.5], 11: [0.4, 0.55], 12: [0.6, 0.55] })), null)
  assert.equal(bodySpan([]), null)
})

test('projectY follows contain letterboxing and cover cropping', () => {
  const stage = { width: 400, height: 800 }
  assert.equal(projectY(0.5, 9 / 16, stage, 'contain'), 400)
  assert.equal(projectY(0, 16 / 9, stage, 'contain'), 288, 'landscape video sits in the middle band')
  assert.equal(projectY(0, 16 / 9, stage, 'cover'), 0)
  assert.equal(projectY(0, 1 / 4, stage, 'cover'), -400, 'very tall video is cropped top and bottom')
})
