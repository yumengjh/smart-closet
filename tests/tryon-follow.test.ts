import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { HOLD_MS, JOINT_INDEX, MATCH_THRESHOLD, PoseHold, followable, jointsFromLandmarks, matchScore, mirrorKeypoints, normalize, overlayBox, type Keypoints } from '../src/tryon/pose/follow.ts'
import type { Point } from '../src/tryon/pose/checks.ts'

const STAND: Keypoints = { HEAD: [0.5, 0.11], NECK: [0.5, 0.2], L_SHOULDER: [0.6, 0.23], R_SHOULDER: [0.4, 0.23], L_ELBOW: [0.63, 0.38], R_ELBOW: [0.37, 0.38], L_WRIST: [0.64, 0.52], R_WRIST: [0.36, 0.52], L_HIP: [0.56, 0.52], R_HIP: [0.44, 0.52], L_KNEE: [0.565, 0.71], R_KNEE: [0.435, 0.71], L_ANKLE: [0.57, 0.9], R_ANKLE: [0.43, 0.9] }
const HAIR_TOUCH: Keypoints = { ...STAND, L_ELBOW: [0.72, 0.12], L_WRIST: [0.58, 0.06], R_ELBOW: [0.3, 0.14], R_WRIST: [0.44, 0.06] }

/** 把 3:4 画框里的动作放进一张宽高比为 aspect 的画面（模拟 MediaPipe 输出）：画框高占 0.7、可整体平移，offset 为每个点的扰动。 */
function landmarks(kp: Keypoints, aspect: number, { shift = 0, scale = 0.7, wobble = 0, hide = [] as string[] } = {}): Point[] {
  const bw = scale * 0.75, bx = (aspect - bw) / 2 + shift, by = 0.12
  const points: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }))
  let n = 0
  for (const [joint, index] of Object.entries(JOINT_INDEX)) {
    const p = kp[joint as keyof Keypoints]; if (!p || hide.includes(joint)) continue
    const d = wobble * (n++ % 2 ? 1 : -1)
    points[index] = { x: (bx + (p[0] + d) * bw) / aspect, y: by + (p[1] + d) * scale, visibility: 0.9 }
  }
  return points
}

test('关节对应：HEAD 是鼻子，NECK 是两肩中点，其余对应 11–16、23–28', () => {
  assert.equal(JOINT_INDEX.HEAD, 0)
  assert.deepEqual([JOINT_INDEX.L_SHOULDER, JOINT_INDEX.R_SHOULDER, JOINT_INDEX.L_ELBOW, JOINT_INDEX.R_ELBOW, JOINT_INDEX.L_WRIST, JOINT_INDEX.R_WRIST], [11, 12, 13, 14, 15, 16])
  assert.deepEqual([JOINT_INDEX.L_HIP, JOINT_INDEX.R_HIP, JOINT_INDEX.L_KNEE, JOINT_INDEX.R_KNEE, JOINT_INDEX.L_ANKLE, JOINT_INDEX.R_ANKLE], [23, 24, 25, 26, 27, 28])
  const joints = jointsFromLandmarks(landmarks(STAND, 1))
  assert.ok(joints.NECK)
  assert.ok(Math.abs(joints.NECK![0] - (joints.L_SHOULDER![0] + joints.R_SHOULDER![0]) / 2) < 1e-9)
  assert.equal(Object.keys(jointsFromLandmarks([])).length, 0)
  assert.equal(jointsFromLandmarks(landmarks(STAND, 1, { hide: ['L_ANKLE'] })).L_ANKLE, undefined)
})

test('肩髋框归一化：平移和缩放都不改变结果，缺肩或髋时无法归一化', () => {
  const a = normalize(STAND, 0.75)!, b = normalize(jointsFromLandmarks(landmarks(STAND, 16 / 9, { shift: 0.3, scale: 0.5 })), 16 / 9)!
  for (const joint of Object.keys(a) as (keyof typeof a)[]) if (joint !== 'NECK') {
    assert.ok(Math.abs(a[joint]!.x - b[joint]!.x) < 1e-6 && Math.abs(a[joint]!.y - b[joint]!.y) < 1e-6, joint)
  }
  const { L_HIP: _, ...noHip } = STAND
  assert.equal(normalize(noHip, 0.75), null)
})

test('同一个动作在竖屏、横屏、远近不同的画面里都接近 1，别的动作明显更低', () => {
  for (const aspect of [9 / 16, 3 / 4, 16 / 9]) for (const scale of [0.5, 0.8]) {
    assert.ok(matchScore(STAND, landmarks(STAND, aspect, { scale }), aspect)! > 0.97, `${aspect} ${scale}`)
    assert.ok(matchScore(STAND, landmarks(HAIR_TOUCH, aspect, { scale }), aspect)! < MATCH_THRESHOLD, `${aspect} ${scale}`)
  }
  // 摆得差不多（每个点偏 2%）仍算吻合；偏太多不算。
  assert.ok(matchScore(STAND, landmarks(STAND, 9 / 16, { wobble: 0.02 }), 9 / 16)! >= MATCH_THRESHOLD)
  assert.ok(matchScore(STAND, landmarks(STAND, 9 / 16, { wobble: 0.08 }), 9 / 16)! < MATCH_THRESHOLD)
})

test('看不清时返回 null：没人、缺肩髋、能比的关节太少', () => {
  assert.equal(matchScore(STAND, [], 1), null)
  assert.equal(matchScore(STAND, landmarks(STAND, 1, { hide: ['L_HIP'] }), 1), null)
  assert.equal(matchScore(STAND, landmarks(STAND, 1, { hide: ['HEAD', 'L_ELBOW', 'R_ELBOW', 'L_WRIST', 'R_WRIST', 'L_KNEE', 'R_KNEE', 'L_ANKLE', 'R_ANKLE'] }), 1), null)
  // 只拍到上半身：头、颈、手臂够比。
  assert.ok(matchScore(STAND, landmarks(STAND, 1, { hide: ['L_KNEE', 'R_KNEE', 'L_ANKLE', 'R_ANKLE'] }), 1)! > 0.97)
})

test('吻合度 ≥ 0.8 保持 800ms 才算摆好，只在刚摆好时提示一次；掉下来重新计时', () => {
  const hold = new PoseHold()
  assert.equal(hold.update(0.9, 0).matched, false)
  assert.equal(hold.update(0.85, HOLD_MS - 1).matched, false)
  const done = hold.update(0.82, HOLD_MS)
  assert.deepEqual([done.matched, done.justMatched], [true, true])
  const still = hold.update(0.9, HOLD_MS + 200)
  assert.deepEqual([still.matched, still.justMatched], [true, false])
  assert.equal(hold.update(0.79, HOLD_MS + 400).matched, false)
  assert.equal(hold.update(0.9, HOLD_MS + 500).matched, false)
  assert.equal(hold.update(null, HOLD_MS + 600).matched, false)
  assert.equal(hold.update(0.9, HOLD_MS + 700).matched, false)
  assert.equal(hold.update(0.9, 2 * HOLD_MS + 700).justMatched, true)
  hold.reset()
  assert.equal(hold.update(0.95, 10_000).matched, false)
})

test('线框位置：在视频实际显示的区域里居中放最大的 3:4 框；镜像只翻横坐标', () => {
  // 横屏画面铺满横屏舞台：框高等于舞台高。
  assert.deepEqual(overlayBox({ width: 1600, height: 900 }, 16 / 9, 'contain'), { x: 463, y: 0, width: 675, height: 900 })
  // 竖屏画面完整显示在横屏舞台里：框受画面宽度限制。
  const box = overlayBox({ width: 1600, height: 900 }, 9 / 16, 'contain')
  assert.ok(box.width <= 900 * 9 / 16 + 1 && Math.abs(box.width / box.height - 0.75) < 0.01)
  // 竖屏画面铺满手机：框受舞台宽度限制并上下居中。
  assert.deepEqual(overlayBox({ width: 390, height: 844 }, 9 / 16, 'cover'), { x: 0, y: 162, width: 390, height: 520 })
  assert.deepEqual(overlayBox({ width: 0, height: 100 }, 1, 'cover'), { x: 0, y: 0, width: 0, height: 0 })
  const mirrored = mirrorKeypoints(STAND)
  assert.ok(Math.abs(mirrored.L_SHOULDER![0] - 0.4) < 1e-9 && mirrored.L_SHOULDER![1] === 0.23)
  // 镜像不改变吻合度判断用的关节名。
  assert.ok(Object.keys(mirrored).every(k => k in STAND))
})

test('只有关节够画人形的预设能跟着摆；仓库里的 8 个预设都可以', () => {
  assert.equal(followable(STAND), true)
  assert.equal(followable({ HEAD: [0.5, 0.1], NECK: [0.5, 0.2] }), false)
  assert.equal(followable(null), false)
  const presets = new URL('../../smart-closet-server/src/main/resources/ootd/pose-presets.json', import.meta.url)
  if (!existsSync(presets)) return
  const rows = JSON.parse(readFileSync(presets, 'utf8')) as { id: string; keypoints: Keypoints }[]
  for (const row of rows) {
    assert.equal(followable(row.keypoints), true, row.id)
    assert.ok(matchScore(row.keypoints, landmarks(row.keypoints, 9 / 16), 9 / 16)! > 0.97, row.id)
  }
})
