import type { Point } from './checks'

/**
 * 从摄像头原画定时取帧交给 Worker 做姿态识别。只在打开相机后启动；页面隐藏时不取帧；
 * 单次识别过慢时自动降频，优先保证实时试穿本身流畅。任何失败都只让检查消失，不影响试穿。
 */
/** 只给本页“连接状态”弹层看：不含关键点，不上传（2026-11-06 加载提速设计 §3.4）。 */
export type PoseStatus =
  | { state: 'loading'; since: number }
  | { state: 'ready'; delegate: 'GPU' | 'CPU'; loadMs: number; inferenceMs: number | null; perSecond: number }
  | { state: 'unavailable'; reason: 'timeout' | 'unsupported' | 'failed' }
export const poseFailureLabel = { timeout: '加载超时', unsupported: '浏览器不支持', failed: '识别文件加载失败' } as const

export class PoseSampler {
  private worker?: Worker
  private timer = 0
  private initTimer = 0
  private busy = false
  private ready = false
  private closed = false
  private perSecond = 5
  private cap = 5
  private delegate: 'GPU' | 'CPU' = 'GPU'
  private loadMs = 0
  private recent: number[] = []
  private frames = 0
  onPoints: (points: Point[], at: number) => void = () => {}
  onUnavailable: () => void = () => {}
  onStatus: (status: PoseStatus) => void = () => {}
  constructor(private readonly source: () => HTMLVideoElement | undefined) {}

  start() {
    if (this.worker || this.closed) return
    if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') { this.fail('unsupported'); return }
    try { this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) } catch { this.fail('unsupported'); return }
    this.onStatus({ state: 'loading', since: performance.now() })
    this.initTimer = window.setTimeout(() => this.fail('timeout'), 45_000)
    this.worker.onerror = () => this.fail('failed')
    this.worker.onmessage = ({ data }) => {
      if (this.closed) return
      if (data.type === 'READY') {
        clearTimeout(this.initTimer); this.ready = true
        if (data.delegate === 'CPU') this.delegate = 'CPU'
        if (typeof data.loadMs === 'number') this.loadMs = data.loadMs
        this.schedule()
      } else if (data.type === 'POSE') {
        this.busy = false
        if (typeof data.inferenceMs === 'number') { this.recent.push(data.inferenceMs); if (this.recent.length > 10) this.recent.shift() }
        if (data.inferenceMs > 150 && this.perSecond > 1) { this.perSecond = Math.max(1, Math.floor(this.perSecond / 2)); this.schedule() }
        if (++this.frames === 1 || this.frames % 5 === 0) this.report()
        this.onPoints(data.points, performance.now())
      } else if (data.type === 'ERROR') { if (!this.ready) this.fail('failed'); else this.busy = false }
    }
    this.worker.postMessage({ type: 'INIT' })
  }
  /** 开始前每秒 5 次，试穿中每秒 2 次；降过频的不会再升回去。 */
  setRate(perSecond: number) { this.cap = perSecond; const next = Math.min(this.perSecond, perSecond); if (next !== this.perSecond || !this.timer) { this.perSecond = next; this.schedule() } }
  /** 从试穿回到预览时恢复上限内的频率。 */
  resetRate(perSecond: number) { this.cap = perSecond; this.perSecond = perSecond; this.schedule() }
  get active() { return this.ready && !this.closed }

  private report() {
    if (!this.ready || this.closed) return
    const inferenceMs = this.recent.length ? this.recent.reduce((a, b) => a + b, 0) / this.recent.length : null
    this.onStatus({ state: 'ready', delegate: this.delegate, loadMs: this.loadMs, inferenceMs, perSecond: Math.min(this.perSecond, this.cap) })
  }
  private schedule() {
    clearInterval(this.timer); this.timer = 0
    if (!this.ready || this.closed) return
    this.report()
    this.timer = window.setInterval(() => { void this.sample() }, Math.round(1000 / Math.min(this.perSecond, this.cap)))
  }
  private async sample() {
    const video = this.source()
    if (this.busy || document.hidden || !video || video.readyState < 2 || !video.videoWidth) return
    this.busy = true
    try {
      const bitmap = await createImageBitmap(video)
      if (this.closed || !this.worker) { bitmap.close(); return }
      this.worker.postMessage({ type: 'FRAME', bitmap, timestamp: performance.now() }, [bitmap])
    } catch { this.busy = false }
  }
  private fail(reason: 'timeout' | 'unsupported' | 'failed') { if (this.closed) return; this.close(); this.onStatus({ state: 'unavailable', reason }); this.onUnavailable() }
  close() {
    this.closed = true; this.ready = false; clearInterval(this.timer); clearTimeout(this.initTimer)
    this.worker?.postMessage({ type: 'CLOSE' }); this.worker?.terminate(); this.worker = undefined
  }
}
