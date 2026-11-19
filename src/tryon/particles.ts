import { seen, type Point } from './pose/checks.ts'

/**
 * 镜头试穿的粒子转场（docs/design/2026-11-19-镜头试穿：启动动效与取景引导设计.md 第 4.5 节）：
 * 连接中粒子汇聚到人的骨架上，首帧出来时从肩到脚依次炸开，试穿画面跟着光环从身体中心铺开。
 * 上半部分是纯函数（有单测）；ParticleField 只负责画，关键点用完即丢，不上传、不保存。
 */
export type XY = { x: number; y: number }

const NOSE = 0, LEFT_EAR = 7, RIGHT_EAR = 8, LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12, LEFT_HIP = 23, RIGHT_HIP = 24
/** 骨架连线，含躯干两条对角线，让身体中间也有粒子。 */
const BONES: readonly (readonly [number, number])[] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [11, 24], [12, 23],
  [23, 25], [25, 27], [24, 26], [26, 28],
]

/** 认不出人时用的标准站姿（归一化坐标），粒子先聚成一个人形等人站进来。 */
const STANDING: Record<number, [number, number]> = {
  0: [0.5, 0.17], 7: [0.47, 0.17], 8: [0.53, 0.17], 11: [0.42, 0.29], 12: [0.58, 0.29], 13: [0.39, 0.43], 14: [0.61, 0.43],
  15: [0.38, 0.56], 16: [0.62, 0.56], 23: [0.45, 0.56], 24: [0.55, 0.56], 25: [0.45, 0.72], 26: [0.55, 0.72], 27: [0.45, 0.88], 28: [0.55, 0.88],
}
export const STANDING_POSE: readonly Point[] = Array.from({ length: 33 }, (_, i) => STANDING[i] ? { x: STANDING[i][0], y: STANDING[i][1], visibility: 1 } : { x: 0.5, y: 0.5, visibility: 0 })

/** 0..1 的确定性散列：同一个槽位每次落在骨架的同一处，人动时粒子跟着走而不是乱跳。 */
export function hash01(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
const GOLDEN = 0.6180339887498949

/**
 * 沿可见骨架（加头部一圈）按长度均匀取 count 个点，map 把画面坐标换算成舞台像素；
 * thickness 是垂直于骨头的散布宽度（像素）。没有可见骨头时返回空数组。
 */
export function skeletonTargets(points: readonly Point[], count: number, map: (p: XY) => XY, thickness = 10): XY[] {
  if (points.length < 33 || count <= 0) return []
  const segs = BONES.filter(([a, b]) => seen(points, a) && seen(points, b)).map(([a, b]) => [map(points[a]), map(points[b])] as const)
  let head: { c: XY; r: number } | null = null
  if (seen(points, NOSE)) {
    const c = map(points[NOSE])
    const ears = seen(points, LEFT_EAR) && seen(points, RIGHT_EAR) ? Math.hypot(map(points[LEFT_EAR]).x - map(points[RIGHT_EAR]).x, map(points[LEFT_EAR]).y - map(points[RIGHT_EAR]).y) * 0.62 : 0
    const shoulders = seen(points, LEFT_SHOULDER) && seen(points, RIGHT_SHOULDER) ? Math.abs(map(points[LEFT_SHOULDER]).x - map(points[RIGHT_SHOULDER]).x) * 0.3 : 0
    head = { c, r: Math.max(6, ears || shoulders || 14) }
  }
  const lengths = segs.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y))
  const headLength = head ? 2 * Math.PI * head.r : 0
  const total = lengths.reduce((s, l) => s + l, 0) + headLength
  if (total <= 0) return []
  const out: XY[] = []
  for (let i = 0; i < count; i++) {
    let d = ((i * GOLDEN) % 1) * total
    const spread = (hash01(i) - 0.5) * thickness
    if (head && d < headLength) {
      const angle = d / head.r, r = head.r + spread * 0.5
      out.push({ x: head.c.x + Math.cos(angle) * r, y: head.c.y + Math.sin(angle) * r })
      continue
    }
    d -= headLength
    let k = 0
    while (k < lengths.length - 1 && d > lengths[k]) { d -= lengths[k]; k++ }
    const [a, b] = segs[k], len = lengths[k] || 1, t = Math.min(1, d / len)
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len
    out.push({ x: a.x + (b.x - a.x) * t + nx * spread, y: a.y + (b.y - a.y) * t + ny * spread })
  }
  return out
}

/** 身体中心：双肩与双髋的中点，光环和画面从这里铺开；认不出时返回 null。 */
export function bodyCenter(points: readonly Point[], map: (p: XY) => XY): XY | null {
  const ids = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP].filter(i => points.length >= 33 && seen(points, i))
  if (ids.length < 2) return null
  const xy = ids.map(i => map(points[i]))
  return { x: xy.reduce((s, p) => s + p.x, 0) / xy.length, y: xy.reduce((s, p) => s + p.y, 0) / xy.length }
}

/** 炸开时从上往下依次放出：越靠下越晚，最多晚 maxDelay 秒，形成“从肩穿到脚”。 */
export function releaseDelay(y: number, span: { top: number; bottom: number } | null, maxDelay = 0.35) {
  if (!span || span.bottom <= span.top) return 0
  return Math.min(1, Math.max(0, (y - span.top) / (span.bottom - span.top))) * maxDelay
}

/** 与 CSS cubic-bezier(.33, 1, .68, 1) 一致，画面铺开和光环保持同步。 */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)
/** 光环半径终点：与 CSS clip-path circle(150%) 一致（百分比以对角线 / √2 为基准）。 */
export const unveilRadius = (w: number, h: number) => 1.5 * Math.hypot(w, h) / Math.SQRT2
export const UNVEIL_SECONDS = 0.9

export type Tone = 'dark' | 'light'
type Dot = { x: number; y: number; vx: number; vy: number; size: number; phase: number; alt: boolean; release: number; life: number; out: boolean }
type Burst = { at: number; origin: XY; ring: boolean; done?: () => void }

const PALETTE: Record<Tone, { main: string; alt: string; ring: string; blend: GlobalCompositeOperation; alpha: number }> = {
  dark: { main: '#9fe8c3', alt: '#ffffff', ring: '159, 232, 195', blend: 'lighter', alpha: 0.9 },
  light: { main: '#2f7d5b', alt: '#111111', ring: '47, 125, 91', blend: 'source-over', alpha: 0.7 },
}

function sprite(color: string, soft: boolean) {
  const c = document.createElement('canvas'); c.width = c.height = 32
  const g = c.getContext('2d')!, grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, color); grad.addColorStop(soft ? 0.25 : 0.45, color); grad.addColorStop(1, `${color}00`)
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32)
  return c
}

/**
 * 一层画布上的粒子：汇聚到目标点（spring），被“踢”开后弹回，炸开后漂散消失。
 * 只用 2D 画布和预渲染的光点贴图；画布尺寸按 devicePixelRatio 取，最高 2 倍。
 */
export class ParticleField {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly count: number
  private dots: Dot[] = []
  private targets: XY[] = []
  private called = 1
  private w = 0
  private h = 0
  private dpr = 1
  private raf = 0
  private last = 0
  private burstState: Burst | null = null
  private kicks: { at: number; origin: XY }[] = []
  private tone: Tone = 'dark'
  private sprites: { main: HTMLCanvasElement; alt: HTMLCanvasElement } | null = null

  constructor(canvas: HTMLCanvasElement, count: number, tone: Tone = 'dark') {
    this.canvas = canvas; this.count = count
    this.ctx = canvas.getContext('2d')!
    this.setTone(tone)
  }

  setTone(tone: Tone) {
    this.tone = tone
    const p = PALETTE[tone]
    this.sprites = { main: sprite(p.main, tone === 'dark'), alt: sprite(p.alt, tone === 'dark') }
  }

  resize(w: number, h: number) {
    if (w <= 0 || h <= 0 || (w === this.w && h === this.h)) return
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr)
    this.w = w; this.h = h
  }

  /** 从画布四周撒入；from='edge' 时从边缘飞进来，'scatter' 时直接散在整块画布上。 */
  seed(from: 'edge' | 'scatter' = 'edge') {
    this.dots = Array.from({ length: this.count }, (_, i) => {
      const r = hash01(i + 7), side = Math.floor(hash01(i + 19) * 4)
      const edge = from === 'edge'
      const x = edge ? (side === 0 ? -10 : side === 1 ? this.w + 10 : r * this.w) : hash01(i + 3) * this.w
      const y = edge ? (side === 2 ? -10 : side === 3 ? this.h + 10 : r * this.h) : hash01(i + 5) * this.h
      return { x, y, vx: 0, vy: 0, size: 1.2 + hash01(i + 11) * 2.2, phase: hash01(i + 13) * Math.PI * 2, alt: hash01(i + 17) < 0.28, release: 0, life: 1, out: false }
    })
    this.burstState = null; this.kicks = []
  }

  setTargets(targets: XY[]) { this.targets = targets }
  /** 汇聚比例：前 fraction 的粒子归位，其余在四周慢慢飘，连接进度越往后聚得越多。 */
  setCalled(fraction: number) { this.called = Math.min(1, Math.max(0, fraction)) }

  /** 在某处荡开一圈：附近的粒子被推开，再被弹回目标。 */
  kick(origin: XY) { this.kicks.push({ at: performance.now(), origin }) ; this.start() }

  /** 炸开：粒子按 releaseDelay 依次飞散并上浮消失；ring 时画一圈与画面铺开同步的光环。 */
  burst(origin: XY, span: { top: number; bottom: number } | null, ring: boolean, done?: () => void) {
    const at = performance.now()
    for (const d of this.dots) { d.release = releaseDelay(d.y, span); d.out = false }
    this.burstState = { at, origin, ring, done }
    this.start()
  }

  start() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame) } }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0 }
  clear() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height) }
  destroy() { this.stop(); this.clear(); this.dots = []; this.burstState = null }

  private readonly frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now
    const finished = this.step(now, dt)
    this.draw(now)
    if (finished) { const done = this.burstState?.done; this.burstState = null; this.dots = []; this.clear(); this.raf = 0; done?.(); return }
    this.raf = requestAnimationFrame(this.frame)
  }

  private step(now: number, dt: number) {
    const burst = this.burstState, since = burst ? (now - burst.at) / 1000 : -1
    this.kicks = this.kicks.filter(k => now - k.at < 600)
    const drag = Math.pow(0.02, dt), loose = Math.pow(0.18, dt)
    let alive = 0
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i]
      if (burst && since >= d.release) {
        if (!d.out) {
          d.out = true
          let dx = d.x - burst.origin.x, dy = d.y - burst.origin.y
          const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len
          const speed = (burst.ring ? 220 : 90) + hash01(i + 23) * (burst.ring ? 380 : 120)
          d.vx = dx * speed - dy * speed * 0.28; d.vy = dy * speed + dx * speed * 0.28 - 50
        }
        d.vx *= loose; d.vy = d.vy * loose - 70 * dt
        d.x += d.vx * dt; d.y += d.vy * dt
        d.life -= dt / (0.75 + hash01(i + 29) * 0.55)
        if (d.life > 0) alive++
        continue
      }
      alive++
      const slot = (i * GOLDEN) % 1
      const target = this.targets.length && slot < this.called ? this.targets[i % this.targets.length] : null
      if (target) {
        const wobble = Math.sin(now * 0.0016 + d.phase) * 1.6
        d.vx += (target.x + wobble - d.x) * 26 * dt; d.vy += (target.y + Math.cos(now * 0.0013 + d.phase) * 1.6 - d.y) * 26 * dt
        d.vx *= drag; d.vy *= drag
      } else {
        // 没被叫到的粒子在四周慢慢飘，出了画布从另一边回来。
        d.vx += Math.sin(now * 0.0005 + d.phase) * 6 * dt; d.vy += Math.cos(now * 0.0004 + d.phase * 1.3) * 6 * dt - 2 * dt
        d.vx *= Math.pow(0.6, dt); d.vy *= Math.pow(0.6, dt)
        if (d.x < -12) d.x = this.w + 10; else if (d.x > this.w + 12) d.x = -10
        if (d.y < -12) d.y = this.h + 10; else if (d.y > this.h + 12) d.y = -10
      }
      for (const k of this.kicks) {
        const age = (now - k.at) / 1000, dx = d.x - k.origin.x, dy = d.y - k.origin.y, dist = Math.hypot(dx, dy) || 1
        const front = age * 260
        if (Math.abs(dist - front) < 18) { d.vx += (dx / dist) * 900 * dt; d.vy += (dy / dist) * 900 * dt }
      }
      d.x += d.vx * dt; d.y += d.vy * dt
    }
    return Boolean(burst && since > 0.4 && alive === 0 && (!burst.ring || since > UNVEIL_SECONDS))
  }

  private draw(now: number) {
    const ctx = this.ctx, palette = PALETTE[this.tone], sprites = this.sprites!
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.globalCompositeOperation = palette.blend
    const burst = this.burstState
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i]
      if (d.life <= 0) continue
      const slot = (i * GOLDEN) % 1, settled = this.targets.length && slot < this.called
      const twinkle = 0.62 + 0.38 * Math.sin(now * 0.004 + d.phase)
      const alpha = palette.alpha * twinkle * Math.max(0, d.life) * (settled || d.out ? 1 : 0.4)
      const s = d.size * (d.out ? 0.6 + d.life * 0.8 : 1) * 2.4
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.drawImage(d.alt ? sprites.alt : sprites.main, d.x - s, d.y - s, s * 2, s * 2)
    }
    for (const k of this.kicks) {
      const age = (now - k.at) / 600
      ctx.globalAlpha = Math.max(0, 1 - age) * 0.6
      ctx.strokeStyle = `rgb(${palette.ring})`; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(k.origin.x, k.origin.y, age * 156, 0, Math.PI * 2); ctx.stroke()
    }
    if (burst?.ring) {
      const t = (now - burst.at) / 1000 / UNVEIL_SECONDS
      if (t < 1) {
        const r = easeOutCubic(t) * unveilRadius(this.w, this.h)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = (1 - t) * 0.9
        ctx.lineWidth = 2 + (1 - t) * 4
        ctx.strokeStyle = `rgb(${palette.ring})`
        ctx.shadowColor = `rgba(${palette.ring}, .9)`; ctx.shadowBlur = 18
        ctx.beginPath(); ctx.arc(burst.origin.x, burst.origin.y, r, 0, Math.PI * 2); ctx.stroke()
        ctx.shadowBlur = 0
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
  }
}
