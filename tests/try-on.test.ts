import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeAlpha, buildMesh, cleanTextureCandidates, createMesh, DEFAULT_FIT, deformMesh, deformPoint, sleeveWeight, usablePose, type Landmark } from '../src/try-on/geometry.ts'
import { PoseFollower, preparePose, PoseStabilizer } from '../src/try-on/tracking.ts'

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

test('silhouette analysis finds the shoulder line, armpits and both cuffs instead of fixed proportions', () => {
  const g = analyzeAlpha(silhouette(), 128, 128)
  assert.ok(Math.abs(g.shoulderY - 15 / 128) < .02, `shoulder ${g.shoulderY}`)
  assert.ok(Math.abs(g.armpitY - 53 / 128) < .03, `armpit ${g.armpitY}`)
  assert.ok(g.sleeves[0].tip.x < .1 && g.sleeves[1].tip.x > .9)
  assert.ok(g.sleeves.every(s => s.reach > .15 && s.limitY > g.shoulderY))
  assert.equal(sleeveWeight({ x: .5, y: .3 }, g), 0)
  assert.ok(sleeveWeight({ x: .03, y: .3 }, g) > .95)
  // A sleeveless top keeps every point on the torso.
  const vest = new Uint8ClampedArray(128 * 128 * 4)
  for (let y = 10; y <= 120; y++) for (let x = 30; x <= 98; x++) vest[(y * 128 + x) * 4 + 3] = 255
  const sleeveless = analyzeAlpha(vest, 128, 128)
  assert.ok(sleeveless.sleeves.every(s => s.reach === 0))
  assert.equal(sleeveWeight({ x: .2, y: .3 }, sleeveless), 0)
})
test('the garment shoulder line sits above the shoulder joints and the hem stays near the hips', () => {
  const g = analyzeAlpha(silhouette(), 128, 128), pose = person()
  const neck = deformPoint({ x: .5, y: g.shoulderY }, g, pose, DEFAULT_FIT, .75)
  assert.ok(neck.y < pose[11]!.y, `shoulder line ${neck.y}`)
  const hem = deformPoint({ x: .5, y: g.hemY }, g, pose, DEFAULT_FIT, .75)
  assert.ok(Math.abs(hem.y - (.25 + (.7 - .25) * DEFAULT_FIT.length)) < .01)
  const body = deformPoint({ x: g.right, y: .7 }, g, pose, DEFAULT_FIT, .75).x - deformPoint({ x: g.left, y: .7 }, g, pose, DEFAULT_FIT, .75).x
  assert.ok(Math.abs(body - .3 * DEFAULT_FIT.width) < .001)
})
test('a sleeve keeps its length when the arm swings, and arms towards the camera shorten it', () => {
  const g = analyzeAlpha(silhouette(), 128, 128), down = person(), raised = person(), forward = person()
  raised[14] = { x: .12, y: .2, z: 0, visibility: 1 }
  forward[14] = { x: .32, y: .3, z: -.4, visibility: 1 }
  const span = (pose: Landmark[]) => {
    const { pivot, tip } = g.sleeves[0], inner = { x: pivot.x + (tip.x - pivot.x) * .6, y: pivot.y + (tip.y - pivot.y) * .6 }
    assert.ok(sleeveWeight(inner, g) > .99)
    const a = deformPoint(inner, g, pose, DEFAULT_FIT, .75), b = deformPoint(tip, g, pose, DEFAULT_FIT, .75)
    return Math.hypot((a.x - b.x) * .75, a.y - b.y)
  }
  assert.ok(Math.abs(span(down) / span(raised) - 1) < .05, `${span(down)} vs ${span(raised)}`)
  assert.ok(span(forward) < span(down) * .8)
})
test('long sleeves bend at the elbow while short sleeves do not', () => {
  const pixels = new Uint8ClampedArray(160 * 128 * 4)
  // Body column plus sleeves reaching diagonally down past the hem width, like a laid-out sweater.
  for (let y = 0; y < 128; y++) for (let x = 0; x < 160; x++) {
    const body = x >= 45 && x <= 115 && y >= 8
    const sleeve = (y >= 8 && y <= 40 && (x < 45 && y - 8 > (45 - x) * .45 - 4 && y - 8 < (45 - x) * .45 + 26 || x > 115 && y - 8 > (x - 115) * .45 - 4 && y - 8 < (x - 115) * .45 + 26))
    if (body || sleeve) pixels[(y * 160 + x) * 4 + 3] = 255
  }
  const g = analyzeAlpha(pixels, 160, 128), straight = person(), bent = person()
  straight[14] = { x: .2, y: .45, z: 0, visibility: 1 }; straight[16] = { x: .05, y: .65, z: 0, visibility: 1 }
  bent[14] = { x: .2, y: .45, z: 0, visibility: 1 }; bent[16] = { x: .35, y: .3, z: 0, visibility: 1 }
  const cuffStraight = deformPoint(g.sleeves[0].tip, g, straight, { ...DEFAULT_FIT, width: 2.4 }, .75)
  const cuffBent = deformPoint(g.sleeves[0].tip, g, bent, { ...DEFAULT_FIT, width: 2.4 }, .75)
  assert.ok(Math.hypot(cuffStraight.x - cuffBent.x, cuffStraight.y - cuffBent.y) > .03)
})
test('indexed mesh draws sleeves after the torso and every deformed vertex is finite', () => {
  const g = analyzeAlpha(silhouette(), 128, 128), mesh = createMesh(g, 24)
  assert.equal(mesh.uv.length, 25 * 25 * 2); assert.equal(mesh.indices.length, 24 * 24 * 6)
  const weights = [] as number[]
  for (let i = 0; i < mesh.indices.length; i += 6) {
    const cell = [0, 1, 2].map(k => mesh.indices[i + k]!)
    const cx = cell.reduce((s, v) => s + mesh.uv[v * 2]!, 0) / 3, cy = cell.reduce((s, v) => s + mesh.uv[v * 2 + 1]!, 0) / 3
    weights.push(sleeveWeight({ x: cx, y: cy }, g))
  }
  assert.ok(weights[0]! <= weights[weights.length - 1]!)
  const out = deformMesh(mesh, g, person(), DEFAULT_FIT, .75, false, new Float32Array(mesh.uv.length))
  assert.ok(out.every(Number.isFinite))
})
test('the display follower glides between pose results and snaps on a new person', () => {
  const follower = new PoseFollower(35), a = person(), b = person()
  b[11] = { ...b[11]!, x: .7 }
  assert.deepEqual(follower.follow(a, 0)[11], a[11])
  const mid = follower.follow(b, 35)[11]!.x
  assert.ok(mid > .65 && mid < .7)
  assert.ok(Math.abs(follower.follow(b, 400)[11]!.x - .7) < .001)
  const far = person(); far[11] = { ...far[11]!, x: .2 }; far[12] = { ...far[12]!, x: .05 }
  assert.equal(follower.follow(far, 410)[11]!.x, .2)
  assert.equal(follower.follow([], 420).length, 0)
})
test('the One Euro filter steadies a still jittering shoulder but keeps up with a fast move', () => {
  const tracking = new PoseStabilizer(), p = person()
  let shown = 0
  for (let i = 0; i < 20; i++) { p[11]!.x = .65 + (i % 2 ? .006 : -.006); shown = tracking.update(p, i * 80, i * 80 + 20, .75).landmarks[11]!.x }
  assert.ok(Math.abs(shown - .65) < .004, `still ${shown}`)
  for (let i = 20; i < 26; i++) { p[11]!.x = .65 + (i - 19) * .025; shown = tracking.update(p, i * 80, i * 80 + 20, .75).landmarks[11]!.x }
  assert.ok(.8 - shown < .03, `moving ${shown}`)
})
test('a body turned to the side widens the torso a little, bounded against exaggerated depth', () => {
  const g = analyzeAlpha(silhouette(), 128, 128), front = person(), turned = person()
  turned[11] = { ...turned[11]!, z: .5 }; turned[12] = { ...turned[12]!, z: -.5 }
  const width = (pose: Landmark[]) => deformPoint({ x: g.right, y: .7 }, g, pose, DEFAULT_FIT, .75).x - deformPoint({ x: g.left, y: .7 }, g, pose, DEFAULT_FIT, .75).x
  assert.ok(width(turned) > width(front) * 1.05 && width(turned) <= width(front) * 1.2 + 1e-9)
  turned[11]!.z = 50; turned[12]!.z = -50
  assert.ok(width(turned) <= width(front) * 1.2 + 1e-9)
})
test('an arm pointing at the camera lets its sleeve hang rather than swing across the chest', () => {
  const g = analyzeAlpha(silhouette(), 128, 128), pose = person()
  // Image-left elbow almost in front of the shoulder, drifting towards the chest on screen.
  pose[14] = { x: .4, y: .28, z: -.6, visibility: 1 }
  const cuff = deformPoint(g.sleeves[0].tip, g, pose, DEFAULT_FIT, .75)
  // Trusting the on-screen angle would lay the sleeve flat towards the chest at shoulder height.
  assert.ok(cuff.y > pose[12]!.y + .06, `cuff ${cuff.y} hangs below the shoulder`)
})
