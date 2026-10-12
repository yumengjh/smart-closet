import test from 'node:test'
import assert from 'node:assert/strict'
import { figure, palette, FRAME } from '../src/ootd/pose-figure.ts'
import { describeAdjustments } from '../src/ootd/body-adjust.ts'
import { modelLabel } from '../src/ootd/labels.ts'
import type { Pose } from '../src/services/platform.ts'

const stand: Pose = { id: 'stand', name: '自然站立', source: 'PRESET', description: '', tags: [], viewAngle: 'FRONT', createdAt: 0, keypoints: {
  HEAD: [0.5, 0.11], NECK: [0.5, 0.2], L_SHOULDER: [0.6, 0.23], R_SHOULDER: [0.4, 0.23], L_ELBOW: [0.63, 0.38], R_ELBOW: [0.37, 0.38], L_WRIST: [0.64, 0.52], R_WRIST: [0.36, 0.52],
  L_HIP: [0.56, 0.52], R_HIP: [0.44, 0.52], L_KNEE: [0.565, 0.71], R_KNEE: [0.435, 0.71], L_ANKLE: [0.57, 0.9], R_ANKLE: [0.43, 0.9] } }

test('pose figure draws every bone, a torso, the head and a ground line under the feet', () => {
  const f = figure(stand)!
  assert.equal(f.segments.length, 11, '10 limb bones plus the neck')
  assert.ok(f.torso)
  assert.ok(f.head && f.head.r >= 6 && f.head.r <= 11)
  assert.equal(f.ground, 0.9 * FRAME.height + 4)
  assert.equal(f.segments.filter(s => s.side === 'left').length, 4)
  const neck = f.segments.find(s => s.key === 'neck')!
  assert.ok(neck.y2 > f.head!.y, 'The neck stops at the head edge instead of drawing over it')
})

test('a text card without joints has no figure; partial joints draw what is there', () => {
  assert.equal(figure({ ...stand, keypoints: {} }), null)
  const upper = figure({ ...stand, keypoints: { HEAD: [0.5, 0.2], NECK: [0.5, 0.3], L_SHOULDER: [0.6, 0.33], R_SHOULDER: [0.4, 0.33], L_ELBOW: [0.65, 0.5] } })!
  assert.equal(upper.torso, null)
  assert.deepEqual(upper.segments.map(s => s.key).sort(), ['L_SHOULDER-L_ELBOW', 'NECK-L_SHOULDER', 'NECK-R_SHOULDER', 'neck'].sort())
})

test('card palette is stable per id', () => {
  assert.deepEqual(palette('stand'), palette('stand'))
  assert.equal(palette('x').length, 2)
})

test('adjustment summary reads naturally', () => {
  assert.equal(describeAdjustments({ build: -1, legs: 2 }), '整体稍瘦 · 腿长更长')
  assert.equal(describeAdjustments({ waist: -2, hips: 1 }), '腰围更细 · 臀围稍宽')
  assert.equal(describeAdjustments({}), '')
  assert.equal(describeAdjustments(undefined), '')
})

test('unnamed models fall back to a dated label', () => {
  assert.equal(modelLabel({ name: '长发的我', createdAt: 0 }), '长发的我')
  assert.match(modelLabel({ name: null, createdAt: Date.UTC(2026, 9, 12) }), /^模特 · /)
})
