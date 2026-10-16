import type { Landmark } from './geometry'
import { PoseStabilizer, type TrackedPose } from './tracking'

export type PoseResult = TrackedPose & { inferenceMs: number }
export class PoseTracker {
  private worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
  private busy = false
  private closed = false
  private lastSubmit = 0
  private stabilizer = new PoseStabilizer()
  private aspect = 1
  private timer = 0
  constructor(private onPose: (pose: PoseResult) => void, private onError: (message: string) => void) {}
  initialize(): Promise<'GPU' | 'CPU'> {
    return new Promise((resolve, reject) => {
      this.timer = window.setTimeout(() => { reject(new Error('姿态模型加载超时，请检查本地模型文件。')); this.close() }, 45000)
      this.worker.onerror = () => { clearTimeout(this.timer); const error = '姿态检测未能启动，请重新开启试穿。'; reject(new Error(error)); this.onError(error) }
      this.worker.onmessage = ({ data }) => {
        if (this.closed) return
        if (data.type === 'READY') { clearTimeout(this.timer); resolve(data.delegate) }
        else if (data.type === 'ERROR') { this.busy = false; clearTimeout(this.timer); reject(new Error(data.message)); this.onError(data.message) }
        else if (data.type === 'POSE') {
          this.busy = false
          const points = data.landmarks as Landmark[]
          const pose = this.stabilizer.update(points, data.timestamp, performance.now(), this.aspect)
          this.onPose({ ...pose, timestamp: data.timestamp, inferenceMs: data.inferenceMs })
        }
      }
      this.worker.postMessage({ type: 'INIT' })
    })
  }
  async submit(video: HTMLVideoElement, timestamp: number) {
    if (this.closed || this.busy || timestamp - this.lastSubmit < 83 || video.readyState < 2) return
    this.busy = true; this.lastSubmit = timestamp; this.aspect = video.videoWidth / video.videoHeight
    try {
      const scale = Math.min(1, 480 / video.videoWidth)
      const bitmap = await createImageBitmap(video, { resizeWidth: Math.round(video.videoWidth * scale), resizeHeight: Math.round(video.videoHeight * scale) })
      if (this.closed) { bitmap.close(); return }
      this.worker.postMessage({ type: 'FRAME', bitmap, timestamp }, [bitmap])
    } catch (cause) { this.busy = false; if (!this.closed) this.onError(cause instanceof Error ? cause.message : String(cause)) }
  }
  current(now: number) { return this.stabilizer.current(now) }
  close() { if (this.closed) return; this.closed = true; clearTimeout(this.timer); this.worker.postMessage({ type: 'CLOSE' }); this.worker.terminate(); this.stabilizer = new PoseStabilizer() }
}
