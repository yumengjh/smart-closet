import test from 'node:test'
import assert from 'node:assert/strict'
import { STANDING_POSE, bodyCenter, easeOutCubic, hash01, releaseDelay, skeletonTargets, unveilRadius, type XY } from '../src/tryon/particles.ts'
import { projectX } from '../src/tryon/guide.ts'
import type { Point } from '../src/tryon/pose/checks.ts'

const px = (p: XY) => ({ x: p.x * 400, y: p.y * 800 })
const blank: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))

test('skeleton targets lie on the visible body and keep their slots', () => {
  const a = skeletonTargets(STANDING_POSE, 200, px)
  assert.equal(a.length, 200)
  assert.ok(a.every(p => p.x > 120 && p.x < 280 && p.y > 90 && p.y < 730), 'all within the standing figure')
  assert.deepEqual(skeletonTargets(STANDING_POSE, 200, px), a, 'same pose, same places')
  assert.ok(a.some(p => p.y < 160) && a.some(p => p.y > 650), 'from head to ankles')
  assert.deepEqual(skeletonTargets(blank, 50, px), [], 'nobody, no targets')
  assert.deepEqual(skeletonTargets([], 50, px), [])
})

test('only the visible half gets particles', () => {
  const upper = STANDING_POSE.map((p, i) => i >= 25 ? { ...p, visibility: 0 } : p)
  assert.ok(skeletonTargets(upper, 120, px).every(p => p.y < 0.6 * 800), 'no particles below hidden knees')
})

test('body center sits between shoulders and hips', () => {
  const c = bodyCenter(STANDING_POSE, px)!
  assert.ok(Math.abs(c.x - 200) < 1e-9 && Math.abs(c.y - 0.425 * 800) < 1e-6)
  assert.equal(bodyCenter(blank, px), null)
})

test('release runs from shoulders to feet', () => {
  const span = { top: 100, bottom: 700 }
  assert.equal(releaseDelay(50, span), 0)
  assert.equal(releaseDelay(400, span), 0.175)
  assert.equal(releaseDelay(900, span), 0.35)
  assert.equal(releaseDelay(400, null), 0)
})

test('unveil ring matches the css circle and easing', () => {
  assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1); assert.equal(easeOutCubic(2), 1)
  assert.ok(unveilRadius(300, 400) >= 500, 'covers the far corner from anywhere inside')
  assert.ok([0, 1, 2, 99].every(i => hash01(i) >= 0 && hash01(i) < 1))
})

test('projectX follows contain pillarboxing and cover cropping', () => {
  const stage = { width: 800, height: 400 }
  assert.equal(projectX(0.5, 9 / 16, stage, 'contain'), 400)
  assert.equal(projectX(0, 9 / 16, stage, 'contain'), 288, 'portrait video sits in the middle band')
  assert.equal(projectX(0, 4, stage, 'cover'), -400, 'very wide video is cropped left and right')
})
