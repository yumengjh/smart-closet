import type { Landmark } from './geometry'
import { PoseStabilizer, type TrackedPose } from './tracking'

export type Hand = { side: string; landmarks: Landmark[]; gesture: string; score: number }
type Connection = { start: number; end: number }
export type Connections = { pose: Connection[]; hand: Connection[]; face: Connection[] }
export type PerceptionOptions = { hands: boolean; face: boolean }
export type PoseResult = TrackedPose & { inferenceMs: number; timings: Record<string, number> }
/** Extra perception results feed the overlay and gestures; they expire quickly instead of freezing on screen. */
const EXTRA_MAX_AGE_MS = 400

export class PoseTracker {
  private worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
  private busy = false
  private closed = false
  private lastSubmit = 0
  private stabilizer = new PoseStabilizer()
  private aspect = 1
  private timer = 0
  private raw: Landmark[] = []
  private rawAt = 0
  private hands: Hand[] = []
  private handsAt = 0
  private face: Landmark[] = []
  private faceAt = 0
  connections: Connections | null = null
  enabled: PerceptionOptions = { hands: false, face: false }
  constructor(private onPose: (pose: PoseResult) => void, private onError: (message: string) => void, private onNotice: (message: string) => void = () => {}) {}
  initialize(options: PerceptionOptions = { hands: false, face: false }): Promise<'GPU' | 'CPU'> {
    return new Promise((resolve, reject) => {
      // Optional models add their own loading time.
      this.timer = window.setTimeout(() => { reject(new Error('姿态模型加载超时，请检查本地模型文件。')); this.close() }, options.hands || options.face ? 90000 : 45000)
      this.worker.onerror = () => { clearTimeout(this.timer); const error = '姿态检测未能启动，请重新开启试穿。'; reject(new Error(error)); this.onError(error) }
      this.worker.onmessage = ({ data }) => {
        if (this.closed) return
        if (data.type === 'READY') {
          clearTimeout(this.timer); this.connections = data.connections; this.enabled = { hands: data.hands, face: data.face }
          if (data.warning) this.onNotice(data.warning)
          resolve(data.delegate)
        } else if (data.type === 'CONFIGURED') { this.enabled = { hands: data.hands, face: data.face }; this.busy = false; if (data.warning) this.onNotice(data.warning) }
        else if (data.type === 'ERROR') { this.busy = false; clearTimeout(this.timer); reject(new Error(data.message)); this.onError(data.message) }
        else if (data.type === 'POSE') {
          this.busy = false
          const now = performance.now()
          this.raw = data.landmarks as Landmark[]; this.rawAt = now
          if (data.hands) { this.hands = data.hands; this.handsAt = now }
          if (data.face) { this.face = data.face; this.faceAt = now }
          const pose = this.stabilizer.update(this.raw, data.timestamp, now, this.aspect)
          this.onPose({ ...pose, timestamp: data.timestamp, inferenceMs: data.inferenceMs, timings: data.timings })
        }
      }
      this.worker.postMessage({ type: 'INIT', options })
    })
  }
  /** Loads or releases optional models without restarting the camera. Frames pause while the worker reconfigures. */
  configure(options: PerceptionOptions) {
    if (this.closed) return
    this.busy = true
    this.worker.postMessage({ type: 'CONFIG', options })
    if (!options.hands) this.hands = []
    if (!options.face) this.face = []
  }
  async submit(video: HTMLVideoElement, timestamp: number) {
    if (this.closed || this.busy || timestamp - this.lastSubmit < 83 || video.readyState < 2) return
    this.busy = true; this.lastSubmit = timestamp; this.aspect = video.videoWidth / video.videoHeight
    try {
      // Hands and faces are small in a full-body frame, so the optional models get a sharper input.
      const target = this.enabled.hands || this.enabled.face ? 720 : 480
      const scale = Math.min(1, target / video.videoWidth)
      const bitmap = await createImageBitmap(video, { resizeWidth: Math.round(video.videoWidth * scale), resizeHeight: Math.round(video.videoHeight * scale) })
      if (this.closed) { bitmap.close(); return }
      this.worker.postMessage({ type: 'FRAME', bitmap, timestamp }, [bitmap])
    } catch (cause) { this.busy = false; if (!this.closed) this.onError(cause instanceof Error ? cause.message : String(cause)) }
  }
  current(now: number) { return this.stabilizer.current(now) }
  /** Unfiltered full-body points plus hands and face, for the debug overlay, gestures and face protection. */
  extras(now: number) {
    return { raw: now - this.rawAt <= EXTRA_MAX_AGE_MS ? this.raw : [],
      hands: now - this.handsAt <= EXTRA_MAX_AGE_MS ? this.hands : [], face: now - this.faceAt <= EXTRA_MAX_AGE_MS * 2 ? this.face : [] }
  }
  close() { if (this.closed) return; this.closed = true; clearTimeout(this.timer); this.worker.postMessage({ type: 'CLOSE' }); this.worker.terminate(); this.stabilizer = new PoseStabilizer() }
}
