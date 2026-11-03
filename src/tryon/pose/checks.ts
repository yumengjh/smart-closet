/**
 * 本地姿态检查的纯规则：MediaPipe Pose 的 33 个关键点 + 已选衣物的穿戴位置 → 取景结论。
 * 只判断“部位在不在画面里、人在不在画面里”，不估算身高体型，结果不离开本页。
 */
export type Point = { x: number; y: number; visibility: number }
export type FrameCheck = { status: 'absent' | 'adjust' | 'ready'; hint: string }

const NOSE = 0, LEFT_EYE = 2, RIGHT_EYE = 5, LEFT_EAR = 7, RIGHT_EAR = 8
const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12, LEFT_ELBOW = 13, RIGHT_ELBOW = 14, LEFT_WRIST = 15, RIGHT_WRIST = 16
const LEFT_HIP = 23, RIGHT_HIP = 24, LEFT_KNEE = 25, RIGHT_KNEE = 26, LEFT_ANKLE = 27, RIGHT_ANKLE = 28
const FEET = [29, 30, 31, 32]
const EDGE = 0.02

/** 可见：模型有把握，且落在画面内（贴边的点多半是被裁掉后猜出来的）。 */
export function seen(points: readonly Point[], index: number) {
  const p = points[index]
  return Boolean(p) && p.visibility >= 0.5 && p.x >= EDGE && p.x <= 1 - EDGE && p.y >= EDGE && p.y <= 1 - EDGE
}
const all = (p: readonly Point[], ...ids: number[]) => ids.every(i => seen(p, i))
const any = (p: readonly Point[], ...ids: number[]) => ids.some(i => seen(p, i))
/** 至少一只手抬起：手腕可见且高于髋部（髋部不在画面时视为在画面底边）。 */
function raisedHand(p: readonly Point[], needElbow: boolean) {
  const hips = [LEFT_HIP, RIGHT_HIP].filter(i => seen(p, i)).map(i => p[i].y)
  const hipY = hips.length ? Math.min(...hips) : 1
  return [[LEFT_WRIST, LEFT_ELBOW], [RIGHT_WRIST, RIGHT_ELBOW]].some(([w, e]) => seen(p, w) && (!needElbow || seen(p, e)) && p[w].y < hipY)
}
/** 正脸：双眼可见，鼻尖在两眼之间。 */
function frontal(p: readonly Point[]) {
  if (!all(p, NOSE, LEFT_EYE, RIGHT_EYE)) return false
  const a = p[LEFT_EYE].x, b = p[RIGHT_EYE].x
  return p[NOSE].x > Math.min(a, b) && p[NOSE].x < Math.max(a, b)
}

type Rule = { roles: readonly string[]; ok: (p: readonly Point[]) => boolean; hint: string }
/** 顺序即提示优先级：多件衣物时只提示最先没满足的一条（手 → 脚 → 下身 → 全身 → 上身 → 颈 → 头）。 */
const RULES: readonly Rule[] = [
  { roles: ['HANDHELD'], ok: p => raisedHand(p, false), hint: '请把手抬进画面，做出拿东西的手势' },
  { roles: ['WRIST', 'FINGER', 'GLOVES', 'ARM'], ok: p => raisedHand(p, true), hint: '请把手抬到胸前' },
  { roles: ['SHOES', 'SOCKS'], ok: p => all(p, LEFT_ANKLE, RIGHT_ANKLE) && any(p, ...FEET), hint: '请让双脚进入画面' },
  { roles: ['BOTTOM'], ok: p => all(p, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE) && any(p, LEFT_ANKLE, RIGHT_ANKLE), hint: '请后退一些，让腰部到脚踝进入画面' },
  { roles: ['BELT'], ok: p => all(p, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE), hint: '请后退一些，让腰部和大腿进入画面' },
  { roles: ['ONE_PIECE', 'OVERALL'], ok: p => all(p, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE), hint: '请后退一些，让肩部到膝盖进入画面' },
  { roles: ['TOP', 'INNER', 'OUTER', 'BAG'], ok: p => all(p, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP), hint: '请后退一些，让上半身完整入镜' },
  { roles: ['NECK', 'SCARF'], ok: p => all(p, NOSE, LEFT_SHOULDER, RIGHT_SHOULDER), hint: '请让颈部和双肩进入画面' },
  { roles: ['EAR'], ok: p => seen(p, NOSE) && any(p, LEFT_EAR, RIGHT_EAR), hint: '请把头发拨到耳后，让耳朵露出来' },
  { roles: ['HAT', 'HEADWEAR', 'GLASSES'], ok: frontal, hint: '请正对镜头，让头部完整入镜' },
]
/** 需要看到身体的位置：只有这些才提示“离得太近”，试眼镜、耳饰时凑近是对的。 */
const BODY = new Set(['TOP', 'INNER', 'OUTER', 'BAG', 'BOTTOM', 'BELT', 'ONE_PIECE', 'OVERALL', 'SHOES', 'SOCKS'])

/** 画面里有人：鼻尖或任一肩膀可见。 */
export function present(points: readonly Point[]) { return points.length >= 33 && any(points, NOSE, LEFT_SHOULDER, RIGHT_SHOULDER) }

export function checkFrame(points: readonly Point[], roles: readonly (string | null | undefined)[]): FrameCheck {
  if (!present(points)) return { status: 'absent', hint: '请站到画面中' }
  const wanted = new Set(roles.filter((r): r is string => Boolean(r)))
  if ([...wanted].some(r => BODY.has(r)) && all(points, LEFT_SHOULDER, RIGHT_SHOULDER) && Math.abs(points[LEFT_SHOULDER].x - points[RIGHT_SHOULDER].x) > 0.7)
    return { status: 'adjust', hint: '离镜头太近了，请后退一些' }
  const missing = RULES.find(rule => rule.roles.some(r => wanted.has(r)) && !rule.ok(points))
  return missing ? { status: 'adjust', hint: missing.hint } : { status: 'ready', hint: '取景就绪' }
}

/** 结论连续稳定一段时间才切换，避免人一晃提示就闪。 */
export class SteadyCheck {
  private current: FrameCheck | null = null
  private pending: FrameCheck | null = null
  private since = 0
  private readonly holdMs: number
  constructor(holdMs = 600) { this.holdMs = holdMs }
  update(next: FrameCheck, now: number): FrameCheck | null {
    const same = (a: FrameCheck | null, b: FrameCheck | null) => a?.status === b?.status && a?.hint === b?.hint
    if (!this.current) { this.current = next; this.pending = null; return this.current }
    if (same(next, this.current)) { this.pending = null; return this.current }
    if (!same(next, this.pending)) { this.pending = next; this.since = now; return this.current }
    if (now - this.since >= this.holdMs) { this.current = next; this.pending = null }
    return this.current
  }
  reset() { this.current = this.pending = null }
}

export type Absence = { state: 'ok' } | { state: 'warn'; secondsLeft: number } | { state: 'stop' }
/** 试穿中画面里一直没人：先提醒倒数，再结束，免得空计时。 */
export class AbsenceWatch {
  private missingSince: number | null = null
  private readonly warnMs: number
  private readonly stopMs: number
  constructor(warnMs = 10_000, stopMs = 30_000) { this.warnMs = warnMs; this.stopMs = stopMs }
  update(isPresent: boolean, now: number): Absence {
    if (isPresent) { this.missingSince = null; return { state: 'ok' } }
    this.missingSince ??= now
    const gone = now - this.missingSince
    if (gone >= this.stopMs) return { state: 'stop' }
    if (gone >= this.warnMs) return { state: 'warn', secondsLeft: Math.ceil((this.stopMs - gone) / 1000) }
    return { state: 'ok' }
  }
  /** 用户点“继续”：从现在重新计时。 */
  snooze(now: number) { if (this.missingSince !== null) this.missingSince = now }
  reset() { this.missingSince = null }
}
