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
 * thickness 是垂直于骨头的散布宽度（像素）；offset 让所有点沿骨架整体前移（0..1 为一圈），用来做“流动”。
 * 没有可见骨头时返回空数组。
 */
export function skeletonTargets(points: readonly Point[], count: number, map: (p: XY) => XY, thickness = 3, offset = 0): XY[] {
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
    let d = ((((i * GOLDEN) + offset) % 1 + 1) % 1) * total
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

type Dot = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; size: number; phase: number; fresh: number; release: number; life: number; out: boolean }
type Burst = { at: number; origin: XY; ring: boolean; done?: () => void }
type Targets = XY[] | ((now: number) => XY[])

const MINT = '159, 232, 195'
/** 光点：白色小核加一圈很淡的薄荷绿晕，所有粒子同一张贴图、大小只差一点，避免“斑点感”。 */
function sprite() {
  const c = document.createElement('canvas'); c.width = c.height = 32
  const g = c.getContext('2d')!, grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)'); grad.addColorStop(0.12, 'rgba(255, 255, 255, .95)')
  grad.addColorStop(0.3, `rgba(${MINT}, .35)`); grad.addColorStop(1, `rgba(${MINT}, 0)`)
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32)
  return c
}

/**
 * 黑底相机画面上的一层光点：沿骨架流动（目标可以是随时间变化的函数），飞行时拖出细尾迹，
 * 炸开后漂散消失。只用 2D 画布和一张预渲染贴图，叠加模式发光；画布按设备像素比取、最高 2 倍。
 */
export class ParticleField {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly count: number
  private readonly dot: HTMLCanvasElement
  private dots: Dot[] = []
  private targets: Targets = []
  private called = 1
  private w = 0
  private h = 0
  private dpr = 1
  private raf = 0
  private last = 0
  private burstState: Burst | null = null

  constructor(canvas: HTMLCanvasElement, count: number) {
    this.canvas = canvas; this.count = count
    this.ctx = canvas.getContext('2d')!
    this.dot = sprite()
  }

  resize(w: number, h: number) {
    if (w <= 0 || h <= 0 || (w === this.w && h === this.h)) return
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr)
    this.w = w; this.h = h
  }

  /** 从画布四边外飞进来。 */
  seed() {
    this.dots = Array.from({ length: this.count }, (_, i) => {
      const r = hash01(i + 7), side = Math.floor(hash01(i + 19) * 4)
      const x = side === 0 ? -20 : side === 1 ? this.w + 20 : r * this.w
      const y = side === 2 ? -20 : side === 3 ? this.h + 20 : r * this.h
      return { x, y, vx: 0, vy: 0, tx: x, ty: y, size: 0.9 + hash01(i + 11) * 0.5, phase: hash01(i + 13) * Math.PI * 2, fresh: 1, release: 0, life: 1, out: false }
    })
    this.burstState = null
  }

  setTargets(targets: Targets) { this.targets = targets }
  /** 汇聚比例：前 fraction 的粒子归位，其余在四周慢慢飘。 */
  setCalled(fraction: number) { this.called = Math.min(1, Math.max(0, fraction)) }

  /** 炸开：粒子按 releaseDelay 依次飞散并上浮消失；ring 时画一圈与画面铺开同步的光环。 */
  burst(origin: XY, span: { top: number; bottom: number } | null, ring: boolean, done?: () => void) {
    for (const d of this.dots) { d.release = releaseDelay(d.y, span); d.out = false }
    this.burstState = { at: performance.now(), origin, ring, done }
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
    const targets = typeof this.targets === 'function' ? this.targets(now) : this.targets
    const drag = Math.pow(0.004, dt), loose = Math.pow(0.25, dt)
    let alive = 0
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i]
      if (burst && since >= d.release) {
        if (!d.out) {
          d.out = true
          let dx = d.x - burst.origin.x, dy = d.y - burst.origin.y
          const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len
          const speed = burst.ring ? 260 + hash01(i + 23) * 420 : 60 + hash01(i + 23) * 80
          d.vx = dx * speed - dy * speed * 0.18; d.vy = dy * speed + dx * speed * 0.18 - 40
        }
        d.vx *= loose; d.vy = d.vy * loose - 60 * dt
        d.x += d.vx * dt; d.y += d.vy * dt
        d.life -= dt / (0.7 + hash01(i + 29) * 0.5)
        if (d.life > 0) alive++
        continue
      }
      alive++
      d.fresh = Math.min(1, d.fresh + dt * 3)
      const slot = (i * GOLDEN) % 1
      const target = targets.length && slot < this.called ? targets[i % targets.length] : null
      if (target) {
        // 目标沿骨架流动；流到一根骨头尽头会跳到下一根的起点，这时直接换位并淡入，不拖一条线横穿身体。
        if (Math.hypot(target.x - d.tx, target.y - d.ty) > 40 && d.fresh >= 1 && Math.hypot(d.x - d.tx, d.y - d.ty) < 6) { d.x = target.x; d.y = target.y; d.vx = d.vy = 0; d.fresh = 0 }
        d.tx = target.x; d.ty = target.y
        d.vx += (target.x - d.x) * 60 * dt; d.vy += (target.y - d.y) * 60 * dt
        d.vx *= drag; d.vy *= drag
      } else {
        d.vx += Math.sin(now * 0.0005 + d.phase) * 8 * dt; d.vy += Math.cos(now * 0.0004 + d.phase * 1.3) * 8 * dt - 3 * dt
        d.vx *= Math.pow(0.5, dt); d.vy *= Math.pow(0.5, dt)
        if (d.x < -24) d.x = this.w + 20; else if (d.x > this.w + 24) d.x = -20
        if (d.y < -24) d.y = this.h + 20; else if (d.y > this.h + 24) d.y = -20
      }
      d.x += d.vx * dt; d.y += d.vy * dt
    }
    return Boolean(burst && since > 0.4 && alive === 0 && (!burst.ring || since > UNVEIL_SECONDS))
  }

  private draw(now: number) {
    const ctx = this.ctx, burst = this.burstState
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    const hasTargets = typeof this.targets === 'function' || this.targets.length > 0
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i]
      if (d.life <= 0) continue
      const settled = hasTargets && (i * GOLDEN) % 1 < this.called
      const alpha = (0.85 + 0.15 * Math.sin(now * 0.003 + d.phase)) * Math.max(0, d.life) * d.fresh * (settled || d.out ? 1 : 0.3)
      // 尾迹：速度越快越长，慢下来就只剩一个光点。
      const speed = Math.hypot(d.vx, d.vy)
      if (speed > 40) {
        const tail = Math.min(26, speed * 0.028) / speed
        ctx.globalAlpha = alpha * 0.55
        ctx.strokeStyle = `rgb(${MINT})`; ctx.lineWidth = d.size
        ctx.beginPath(); ctx.moveTo(d.x - d.vx * tail, d.y - d.vy * tail); ctx.lineTo(d.x, d.y); ctx.stroke()
      }
      const s = d.size * (d.out ? 0.5 + d.life * 0.6 : 1) * 3.2
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.drawImage(this.dot, d.x - s, d.y - s, s * 2, s * 2)
    }
    if (burst?.ring) {
      const t = (now - burst.at) / 1000 / UNVEIL_SECONDS
      if (t < 1) {
        const r = easeOutCubic(t) * unveilRadius(this.w, this.h)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = (1 - t) * 0.8
        ctx.lineWidth = 1.2 + (1 - t) * 1.8
        ctx.strokeStyle = 'rgb(255, 255, 255)'
        ctx.shadowColor = `rgba(${MINT}, 1)`; ctx.shadowBlur = 14
        ctx.beginPath(); ctx.arc(burst.origin.x, burst.origin.y, r, 0, Math.PI * 2); ctx.stroke()
        ctx.shadowBlur = 0
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
  }
}
