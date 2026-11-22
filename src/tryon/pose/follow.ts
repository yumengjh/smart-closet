import { seen, type Point } from './checks.ts'

/**
 * 跟着摆（docs/design/2026-11-22-镜头试穿：精选整套、动作管理与敏感检查设计.md 6.3）：
 * 预设动作的 14 个关节（3:4 画框内 0–1 坐标）对上 MediaPipe 的 33 个点，算“摆得像不像”。
 * 全是纯函数，关节点与吻合度只在本页使用，不上报、不发给实时试穿。
 */
export type Joint = 'HEAD' | 'NECK' | 'L_SHOULDER' | 'R_SHOULDER' | 'L_ELBOW' | 'R_ELBOW' | 'L_WRIST' | 'R_WRIST' | 'L_HIP' | 'R_HIP' | 'L_KNEE' | 'R_KNEE' | 'L_ANKLE' | 'R_ANKLE'
export type Keypoints = Partial<Record<Joint, readonly [number, number]>>
type Xy = { x: number; y: number }

export const JOINTS: readonly Joint[] = ['HEAD', 'NECK', 'L_SHOULDER', 'R_SHOULDER', 'L_ELBOW', 'R_ELBOW', 'L_WRIST', 'R_WRIST', 'L_HIP', 'R_HIP', 'L_KNEE', 'R_KNEE', 'L_ANKLE', 'R_ANKLE']
/** HEAD 对鼻子 0；NECK 取两肩中点；其余一一对应 11–16、23–28（MediaPipe 的左右是人自己的左右，与预设一致）。 */
export const JOINT_INDEX: Readonly<Record<Exclude<Joint, 'NECK'>, number>> = {
  HEAD: 0, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28,
}
/** 预设画框是 3:4（宽 / 高）。 */
export const TEMPLATE_ASPECT = 3 / 4

/** 把 MediaPipe 的 33 个点换成 14 个关节；看不清的关节不给。 */
export function jointsFromLandmarks(points: readonly Point[]): Keypoints {
  const out: Keypoints = {}
  if (points.length < 33) return out
  for (const [joint, index] of Object.entries(JOINT_INDEX) as [Exclude<Joint, 'NECK'>, number][]) {
    if (seen(points, index)) out[joint] = [points[index].x, points[index].y]
  }
  if (out.L_SHOULDER && out.R_SHOULDER) out.NECK = [(out.L_SHOULDER[0] + out.R_SHOULDER[0]) / 2, (out.L_SHOULDER[1] + out.R_SHOULDER[1]) / 2]
  return out
}

/**
 * 肩髋框归一化：先把横坐标乘画幅宽高比换成同一单位，平移到四点中心，横向按肩宽、纵向按躯干高缩放。
 * 肩宽有下限（侧身时肩会变得很窄），免得一点点偏差被放大。缺肩或髋时无法归一化，返回 null。
 */
export function normalize(points: Keypoints, aspect: number): Partial<Record<Joint, Xy>> | null {
  const ls = points.L_SHOULDER, rs = points.R_SHOULDER, lh = points.L_HIP, rh = points.R_HIP
  if (!ls || !rs || !lh || !rh || !(aspect > 0)) return null
  const at = (p: readonly [number, number]): Xy => ({ x: p[0] * aspect, y: p[1] })
  const [a, b, c, d] = [at(ls), at(rs), at(lh), at(rh)]
  const cx = (a.x + b.x + c.x + d.x) / 4, cy = (a.y + b.y + c.y + d.y) / 4
  const height = (c.y + d.y) / 2 - (a.y + b.y) / 2
  if (!(height > 0.01)) return null
  const width = Math.max(Math.abs(a.x - b.x), Math.abs(c.x - d.x), height * 0.4)
  const out: Partial<Record<Joint, Xy>> = {}
  for (const joint of JOINTS) {
    const p = points[joint]
    if (p) out[joint] = { x: (p[0] * aspect - cx) / width, y: (p[1] - cy) / height }
  }
  return out
}

/**
 * 平均距离到这个值时吻合度为 0；单位是肩宽 / 躯干高。按 8 个预设互相比对取值：
 * 吻合度 0.8 对应平均偏差约 0.11，差不多是“自然站立”和“双手插兜”的差别。
 */
export const TOLERANCE = 0.55
/** 除定框的点外，至少要对上这么多个关节才算数（只拍到上半身时，头和手臂也够用）。 */
export const MIN_JOINTS = 4
/** 定框用的点：肩髋四点归一化后几乎总是重合；NECK 在识别结果里由两肩算出，预设里却画在肩线上方，比了只会带来固定偏差。 */
const ANCHORS = new Set<Joint>(['L_SHOULDER', 'R_SHOULDER', 'L_HIP', 'R_HIP', 'NECK'])

/**
 * 吻合度 0–1：两组点各自归一化后，取双方都有的关节的平均距离，按 TOLERANCE 线性换算。
 * 定框的肩髋四点和由两肩算出的 NECK 不计入平均，免得冲淡头和手脚的差别。
 * 认不出肩髋、或能比的关节太少时返回 null（不是“摆错了”，是“还看不清”）。
 */
export function matchScore(template: Keypoints, landmarks: readonly Point[], aspect: number): number | null {
  const want = normalize(template, TEMPLATE_ASPECT), got = normalize(jointsFromLandmarks(landmarks), aspect)
  if (!want || !got) return null
  let sum = 0, count = 0
  for (const joint of JOINTS) {
    const p = want[joint], q = got[joint]
    if (!p || !q || ANCHORS.has(joint)) continue
    sum += Math.hypot(p.x - q.x, p.y - q.y); count++
  }
  if (count < MIN_JOINTS) return null
  return Math.max(0, Math.min(1, 1 - sum / count / TOLERANCE))
}

export const MATCH_THRESHOLD = 0.8
export const HOLD_MS = 800

export type HoldState = { matched: boolean; /** 这一次刚变成“摆好了”。 */ justMatched: boolean; score: number | null }
/**
 * 吻合度 ≥ 0.8 连续保持 800ms 判定“摆好了”；掉到阈值以下（或看不清）就重新计时。
 * 摆好后线框变实线，页面只在 justMatched 时出声和提示一次，不自动拍照。
 */
export class PoseHold {
  private since: number | null = null
  private matched = false
  private readonly threshold: number
  private readonly holdMs: number
  constructor(threshold = MATCH_THRESHOLD, holdMs = HOLD_MS) { this.threshold = threshold; this.holdMs = holdMs }
  update(score: number | null, at: number): HoldState {
    if (score === null || score < this.threshold) { this.since = null; this.matched = false; return { matched: false, justMatched: false, score } }
    this.since ??= at
    const was = this.matched
    this.matched = at - this.since >= this.holdMs
    return { matched: this.matched, justMatched: this.matched && !was, score }
  }
  reset() { this.since = null; this.matched = false }
}

export type Rect = { x: number; y: number; width: number; height: number }
/**
 * 线框放在哪：先算视频在舞台里实际显示的区域（cover 被裁、contain 留边），与舞台取交集，
 * 再在里面居中放一个最大的 3:4 画框。ratio 为视频宽 / 高。
 */
export function overlayBox(stage: { width: number; height: number }, ratio: number, fit: 'cover' | 'contain'): Rect {
  if (stage.width <= 0 || stage.height <= 0) return { x: 0, y: 0, width: 0, height: 0 }
  const safe = ratio > 0 ? ratio : stage.width / stage.height
  const scale = fit === 'cover' ? Math.max(stage.width / safe, stage.height) : Math.min(stage.width / safe, stage.height)
  const videoW = scale * safe, videoH = scale
  const visW = Math.min(stage.width, videoW), visH = Math.min(stage.height, videoH)
  const width = Math.min(visW, visH * TEMPLATE_ASPECT), height = width / TEMPLATE_ASPECT
  return { x: Math.round((stage.width - width) / 2), y: Math.round((stage.height - height) / 2), width: Math.round(width), height: Math.round(height) }
}

/** 画面是镜像显示时（前置镜头的本地预览），线框也左右翻转，用户看到的左手就是线框的左手。 */
export function mirrorKeypoints(points: Keypoints): Partial<Record<Joint, [number, number]>> {
  const out: Partial<Record<Joint, [number, number]>> = {}
  for (const joint of JOINTS) { const p = points[joint]; if (p) out[joint] = [1 - p[0], p[1]] }
  return out
}

/** 只有关节足够画出人形的预设才能“跟着摆”。 */
export function followable(points: Keypoints | null | undefined) {
  if (!points) return false
  return ['L_SHOULDER', 'R_SHOULDER', 'L_HIP', 'R_HIP'].every(j => points[j as Joint]) && JOINTS.filter(j => points[j]).length >= 8
}
