import { present, seen, type FrameCheck, type Point } from './pose/checks.ts'

/**
 * 镜头试穿的取景引导（docs/design/2026-11-19-镜头试穿：启动动效与取景引导设计.md）：
 * 按设备、前后摄、横竖屏和所选衣物的穿戴位置，决定“现在最该说的一句”和要点亮的部位。
 * 全是纯函数；关键点只在本页使用，不上传、不保存，也不估算身材。
 */
export type Device = 'phone' | 'tablet' | 'desktop'
export type Setup = { device: Device; front: boolean; portrait: boolean }
export type Part = 'head' | 'shoulders' | 'hands' | 'hips' | 'knees' | 'feet'
/** 需要入镜的范围：决定目标框形状和设备提示。 */
export type Scope = 'full' | 'upper' | 'head' | 'hands'

export const PART_LABEL: Record<Part, string> = { head: '头', shoulders: '肩', hands: '手', hips: '腰', knees: '膝', feet: '脚' }
/** 从上到下，部位刻度按这个顺序竖排。 */
export const PART_ORDER: readonly Part[] = ['head', 'shoulders', 'hands', 'hips', 'knees', 'feet']

const ROLE_PARTS: Record<string, readonly Part[]> = {
  HAT: ['head'], HEADWEAR: ['head'], GLASSES: ['head'], EAR: ['head'],
  NECK: ['head', 'shoulders'], SCARF: ['head', 'shoulders'],
  TOP: ['shoulders', 'hips'], INNER: ['shoulders', 'hips'], OUTER: ['shoulders', 'hips'], BAG: ['shoulders', 'hips'],
  BELT: ['hips', 'knees'], BOTTOM: ['hips', 'knees', 'feet'],
  ONE_PIECE: ['shoulders', 'hips', 'knees'], OVERALL: ['shoulders', 'hips', 'knees'],
  SHOES: ['feet'], SOCKS: ['feet'],
  WRIST: ['hands'], FINGER: ['hands'], GLOVES: ['hands'], ARM: ['hands'], HANDHELD: ['hands'],
}
/** 认不出位置（其他配饰、未分类）按上半身处理，和 framingHint 的兜底一致。 */
const FALLBACK: readonly Part[] = ['shoulders', 'hips']

type Roles = readonly (string | null | undefined)[]
export function partsFor(roles: Roles): Part[] {
  if (!roles.length) return []
  const wanted = new Set(roles.flatMap(role => ROLE_PARTS[role || ''] ?? FALLBACK))
  return PART_ORDER.filter(part => wanted.has(part))
}

export function scopeOf(parts: readonly Part[]): Scope {
  if (parts.includes('feet') || parts.includes('knees')) return 'full'
  if (parts.includes('hips') || parts.includes('shoulders')) return 'upper'
  if (parts.includes('hands')) return 'hands'
  return 'head'
}

const NOSE = 0, LEFT_EYE = 2, RIGHT_EYE = 5, LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12, LEFT_WRIST = 15, RIGHT_WRIST = 16
const LEFT_HIP = 23, RIGHT_HIP = 24, LEFT_KNEE = 25, RIGHT_KNEE = 26, LEFT_ANKLE = 27, RIGHT_ANKLE = 28
const PART_POINTS: Record<Part, { all?: number[]; any?: number[] }> = {
  head: { all: [NOSE], any: [LEFT_EYE, RIGHT_EYE] },
  shoulders: { all: [LEFT_SHOULDER, RIGHT_SHOULDER] },
  hands: { any: [LEFT_WRIST, RIGHT_WRIST] },
  hips: { all: [LEFT_HIP, RIGHT_HIP] },
  knees: { all: [LEFT_KNEE, RIGHT_KNEE] },
  feet: { all: [LEFT_ANKLE, RIGHT_ANKLE] },
}
/** 部位刻度：只列这次需要的部位，识别到的点亮。刻度只表示“在画面里”，具体姿势仍以 checkFrame 为准。 */
export function coverage(points: readonly Point[], parts: readonly Part[]) {
  return parts.map(part => {
    const rule = PART_POINTS[part]
    const on = points.length >= 33 && (rule.all ?? []).every(i => seen(points, i)) && (!rule.any || rule.any.some(i => seen(points, i)))
    return { part, label: PART_LABEL[part], on }
  })
}

/**
 * 站远了：需要看身体时，膝盖进了画面或双肩很窄，说明人离屏幕至少一两米，小字已经看不清，改用画面中央大字。
 * 只试头部、手部配饰时人本来就该凑近，不算。
 */
export function isFar(points: readonly Point[], scope: Scope) {
  if (scope === 'head' || scope === 'hands' || !present(points)) return false
  if (seen(points, LEFT_KNEE) || seen(points, RIGHT_KNEE)) return true
  return seen(points, LEFT_SHOULDER) && seen(points, RIGHT_SHOULDER) && Math.abs(points[LEFT_SHOULDER].x - points[RIGHT_SHOULDER].x) < 0.22
}

/** 放手机或站位的提示：姿态识别还没好、或画面里还没人时说这句。 */
export function setupTip(setup: Setup, scope: Scope) {
  const { device, front, portrait } = setup
  if (device === 'desktop') {
    if (scope === 'full') return '离屏幕两米左右，让全身进入画面'
    if (scope === 'upper') return '离屏幕一臂多远，让上半身进入画面'
    if (scope === 'hands') return '把手抬到胸前，对着镜头'
    return '正对屏幕坐好，让头部完整入镜'
  }
  const name = device === 'phone' ? '手机' : '平板'
  if (scope === 'full' && !portrait) return `把${name}竖过来，拍全身更完整`
  if (!front) return scope === 'full' ? `请朋友帮忙拍，${name}竖着，镜头对准腰部` : '请朋友帮忙拍，镜头对准要试的部位'
  if (scope === 'full') return `把${name}竖着靠墙放稳，镜头和腰差不多高，后退两三步`
  if (scope === 'upper') return `把${name}放稳，后退一步，让上半身进入画面`
  if (scope === 'hands') return `${name}放稳，把手抬到胸前`
  return `${name}举到和脸一样高，正对镜头`
}

export type GuideLine = { tone: 'tip' | 'adjust' | 'ready'; text: string }
/** 开始前的一句话：姿态没好或人不在画面里时给放置提示，有结论后用 checkFrame 的提示。 */
export function guideLine(check: FrameCheck | null, setup: Setup, scope: Scope): GuideLine {
  if (!check || check.status === 'absent') return { tone: 'tip', text: setupTip(setup, scope) }
  if (check.status === 'adjust') return { tone: 'adjust', text: check.hint }
  return { tone: 'ready', text: '取景就绪，点开始' }
}

/**
 * 语音提示的节流：同一句 15 秒内不重复，两句之间至少隔 3.5 秒；变化太快时等下一次识别结果再说，
 * 免得人一晃就念个不停。
 */
export class VoiceGate {
  private last = ''
  private lastAt = -Infinity
  private readonly said = new Map<string, number>()
  private readonly gapMs: number
  private readonly repeatMs: number
  constructor(gapMs = 3500, repeatMs = 15_000) { this.gapMs = gapMs; this.repeatMs = repeatMs }
  next(text: string, now: number): string | null {
    if (!text || text === this.last || now - this.lastAt < this.gapMs) return null
    const before = this.said.get(text)
    if (before !== undefined && now - before < this.repeatMs) return null
    this.last = text; this.lastAt = now; this.said.set(text, now)
    return text
  }
  reset() { this.last = ''; this.lastAt = -Infinity; this.said.clear() }
}

export type Fit = 'cover' | 'contain'
/** 人在画面里的上下范围（归一化），给“穿上”扫光定起止；认不出时返回 null，扫光走全屏。 */
export function bodySpan(points: readonly Point[]): { top: number; bottom: number } | null {
  if (!present(points)) return null
  const ys = [NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE].filter(i => seen(points, i)).map(i => points[i].y)
  if (ys.length < 2) return null
  const top = Math.min(...ys), bottom = Math.max(...ys)
  return bottom - top < 0.15 ? null : { top: Math.max(0, top - 0.06), bottom: Math.min(1, bottom + 0.04) }
}
/** 把画面里的纵坐标换算到舞台像素：contain 上下留黑边，cover 上下被裁。ratio 为宽 / 高。 */
export function projectY(y: number, ratio: number, stage: { width: number; height: number }, fit: Fit) {
  if (ratio <= 0 || stage.width <= 0 || stage.height <= 0) return y * stage.height
  const natural = stage.width / ratio
  const shown = fit === 'cover' ? Math.max(stage.height, natural) : Math.min(stage.height, natural)
  return Math.round((stage.height - shown) / 2 + y * shown)
}
