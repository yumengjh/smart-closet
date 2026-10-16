import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeAlpha, buildMesh, cleanTextureCandidates, DEFAULT_FIT, deformPoint, usablePose, type Landmark } from '../src/try-on/geometry.ts'
import { preparePose, PoseStabilizer } from '../src/try-on/tracking.ts'

function silhouette() {
  const pixels = new Uint8ClampedArray(128 * 128 * 4)
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    if (y >= 15 && y <= 52 || y >= 30 && y <= 120 && x >= 30 && x <= 98) pixels[(y * 128 + x) * 4 + 3] = 255
  }
  return pixels
}
function person(): Landmark[] {
  const p = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }))
  p[11] = { x: .65, y: .25, z: 0, visibility: 1 }; p[12] = { x: .35, y: .25, z: 0, visibility: 1 }
  p[13] = { x: .8, y: .45, z: 0, visibility: 1 }; p[14] = { x: .2, y: .45, z: 0, visibility: 1 }
  p[23] = { x: .62, y: .7, z: 0, visibility: 1 }; p[24] = { x: .38, y: .7, z: 0, visibility: 1 }
  return p
}
test('texture selection excludes outlined stickers and ambiguous enhanced outputs', () => {
  const images = ['STICKER', 'BASE_STICKER', 'AI_ENHANCED', 'BASE', 'SEGMENT', 'INPUT'].map((kind, i) => ({ id: String(i), kind, url: '/test', reviewStatus: 'APPROVED' }))
  assert.deepEqual(cleanTextureCandidates({ images, sourceUrl: '' }).map(a => a.kind), ['SEGMENT', 'BASE', 'INPUT'])
})
test('the original wardrobe clean AI image is preferred over its rough base and outlined AI image', () => {
  const job = 'b6a49efe-de94-4ad6-9d29-c81ef952d5af', url = (file: string) => `/api/workflows/${job}/files/${file}`
  const images = [
    { id: 'base', kind: 'BASE', url: url('base-cutout.png'), reviewStatus: 'APPROVED' },
    { id: 'base-sticker', kind: 'BASE_STICKER', url: url('step-0.png'), reviewStatus: 'APPROVED' },
    { id: 'enhanced', kind: 'AI_ENHANCED', url: url('step-2.png'), reviewStatus: 'APPROVED' },
    { id: 'sticker', kind: 'AI_ENHANCED', url: url('step-3.png'), reviewStatus: 'APPROVED' },
  ]
  const steps = [
    { type: 'GENERATE', status: 'completed' as const, outputUrl: url('step-2.png') },
    { type: 'STICKER', status: 'completed' as const, outputUrl: url('step-3.png') },
  ]
  assert.deepEqual(cleanTextureCandidates({ images, sourceUrl: '', displayUrl: url('step-3.png') }, [{ id: job, steps }]).map(a => a.id), ['enhanced', 'base'])
})
test('texture provenance follows the displayed workflow and rejects failed or rejected intermediates', () => {
  const current = '11111111-1111-4111-8111-111111111111', old = '22222222-2222-4222-8222-222222222222'
  const url = (job: string, file: string) => `/api/workflows/${job}/files/${file}`
  const images = [
    { id: 'old-enhanced', kind: 'GENERATE', url: url(old, 'step-2.png'), reviewStatus: 'APPROVED' },
    { id: 'current', kind: 'ENSURE_TRANSPARENCY', url: url(current, 'step-3.png'), reviewStatus: 'APPROVED' },
    { id: 'rejected', kind: 'ENSURE_TRANSPARENCY', url: url(current, 'step-5.png'), reviewStatus: 'REJECTED' },
    { id: 'failed', kind: 'GENERATE', url: url(current, 'step-6.png'), reviewStatus: 'APPROVED' },
  ]
  const workflows = [{ id: current, steps: [{ type: 'GENERATE', status: 'failed' as const, outputUrl: url(current, 'step-6.png') }] }]
  assert.deepEqual(cleanTextureCandidates({ images, sourceUrl: '', displayUrl: url(current, 'step-4.png') }, workflows).map(a => a.id), ['current', 'old-enhanced'])
})
test('opaque photographs are rejected instead of drawing their background onto the person', () => {
  const pixels = new Uint8ClampedArray(128 * 128 * 4).fill(255)
  assert.throws(() => analyzeAlpha(pixels, 128, 128), /透明衣物轮廓/)
  assert.throws(() => analyzeAlpha(new Uint8ClampedArray(128 * 128 * 4), 128, 128))
})
test('lifting one elbow deforms its sleeve while keeping the torso and opposite sleeve stable', () => {
  const geometry = analyzeAlpha(silhouette(), 128, 128), before = person(), after = person()
  after[14] = { x: .2, y: .16, z: 0, visibility: 1 }
  const map = (point: { x: number; y: number }, pose: Landmark[]) => deformPoint(point, geometry, pose, DEFAULT_FIT, .75)
  assert.deepEqual(map({ x: .5, y: .7 }, before), map({ x: .5, y: .7 }, after))
  assert.deepEqual(map({ x: .98, y: .3 }, before), map({ x: .98, y: .3 }, after))
  assert.ok(Math.abs(map({ x: .02, y: .3 }, before).y - map({ x: .02, y: .3 }, after).y) > .05)
  assert.deepEqual(deformPoint({ x: .02, y: .3 }, geometry, before, DEFAULT_FIT, .75, true), deformPoint({ x: .02, y: .3 }, geometry, after, DEFAULT_FIT, .75, true))
})
test('short sleeves follow upper arms rather than wrists, and mesh coordinates remain finite', () => {
  const geometry = analyzeAlpha(silhouette(), 128, 128), a = person(), b = person()
  b[16] = { x: .5, y: .1, z: -.2, visibility: 1 }
  assert.deepEqual(deformPoint({ x: .02, y: .3 }, geometry, a, DEFAULT_FIT, 1.5), deformPoint({ x: .02, y: .3 }, geometry, b, DEFAULT_FIT, 1.5))
  const mesh = buildMesh(geometry, a, DEFAULT_FIT, .75)
  assert.equal(mesh.length, 20 * 20 * 6)
  assert.ok(mesh.every(v => Number.isFinite(v.target.x) && Number.isFinite(v.target.y)))
})
test('upper-body tracking accepts hidden hips but still rejects missing, invalid or collapsed shoulders', () => {
  assert.equal(usablePose([]), false)
  const a = person(); assert.equal(usablePose(a), true)
  a[24]!.visibility = .2; assert.equal(usablePose(a), true)
  a[24]!.visibility = 1; a[12]!.x = .64; assert.equal(usablePose(a), false)
  a[12]!.x = NaN; assert.equal(usablePose(a), false)
  a[12]!.x = .35; a[12]!.visibility = .1; assert.equal(usablePose(a), false)
})
test('cropped hips use finite template anchors in pixel space, without inventing visible hips', () => {
  const input = person(); input[23]!.visibility = .13; input[24]!.visibility = .18
  input[23]!.y = 1.08; input[24]!.y = 1.07
  for (const aspect of [.5625, 1.4]) {
    const result = preparePose(input, aspect)!
    assert.equal(result.estimatedTorso, true)
    assert.deepEqual(result.landmarks[11], input[11])
    assert.equal(result.landmarks[23]!.visibility, 0)
    const torsoHeight = result.landmarks[23]!.y - input[11]!.y
    assert.ok(Math.abs(torsoHeight / (.3 * aspect) - 1.55) < .001)
    assert.ok(buildMesh(analyzeAlpha(silhouette(), 128, 128), result.landmarks, DEFAULT_FIT, aspect).every(v => Number.isFinite(v.target.x) && Number.isFinite(v.target.y)))
  }
  assert.equal(input[23]!.visibility, .13)
  assert.equal(preparePose(person(), .75)!.estimatedTorso, false)
  input[23]!.visibility = 1; input[24]!.visibility = 1
  assert.equal(preparePose(input, .75)!.estimatedTorso, true)
})
test('a brief model miss retains the garment, repeated misses expire it and reacquisition is immediate', () => {
  const tracking = new PoseStabilizer(), p = person()
  assert.equal(tracking.update([], 0, 10, .75).landmarks.length, 0)
  const first = tracking.update(p, 100, 120, .75)
  assert.equal(first.status, 'tracking')
  assert.equal(tracking.update([], 200, 220, .75).status, 'holding')
  assert.deepEqual(tracking.current(600).landmarks, first.landmarks)
  assert.equal(tracking.current(821).landmarks.length, 0)
  assert.equal(tracking.update([], 850, 870, .75).status, 'searching')
  p[11]!.x = .8
  assert.deepEqual(tracking.update(p, 900, 920, .75).landmarks[11], p[11])
})
test('moderate shoulder confidence starts tracking and confidence hysteresis avoids rapid flicker', () => {
  const tracking = new PoseStabilizer(), p = person()
  p[11]!.visibility = .45; p[12]!.visibility = .42
  assert.equal(tracking.update(p, 0, 20, .75).status, 'tracking')
  p[12]!.visibility = .32
  assert.equal(tracking.update(p, 100, 120, .75).status, 'tracking')
  assert.equal(new PoseStabilizer().update(p, 100, 120, .75).status, 'shoulders')
})
test('slow startup results remain usable but stale results and stalled workers cannot freeze a garment indefinitely', () => {
  const tracking = new PoseStabilizer(), p = person()
  assert.equal(tracking.update(p, 0, 600, .75).landmarks.length, 33)
  assert.equal(tracking.current(700).status, 'tracking')
  assert.equal(tracking.current(1301).landmarks.length, 0)
  assert.equal(tracking.update(p, 0, 1400, .75).status, 'slow')
  assert.equal(tracking.current(1401).landmarks.length, 0)
  assert.equal(tracking.update(p, 1450, 1470, .75).status, 'tracking')
})
