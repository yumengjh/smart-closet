/// <reference lib="webworker" />
// 借自 codex/realtime-tryon-poc 的 pose.worker.ts，只保留姿态模型。关键点只回传给本页，不上传、不保存。
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const BASE = `${self.location.origin}/tryon-pose`
let pose: PoseLandmarker | undefined
// The 1.1 runtime loads its WASM through an ES-module loader; keep the URL out of Vite's import rewriting.
// MediaPipe clears the loader's global factory after creating a model, so a second attempt (GPU failed, retry on CPU)
// needs a fresh module instance; the file itself still comes from the browser cache.
let instance = 0
;(self as typeof self & { import: (url: string) => Promise<unknown> }).import = url =>
  import(/* @vite-ignore */ `${url}${url.includes('?') ? '&' : '?'}instance=${++instance}`)

async function create(delegate: 'GPU' | 'CPU') {
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`, true)
  const response = await fetch(`${BASE}/pose_landmarker_lite.task`)
  if (!response.ok) throw new Error(`姿态模型无法读取（${response.status}）`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  return PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: buffer, delegate }, runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 })
}

self.onmessage = async (event: MessageEvent) => {
  const message = event.data
  try {
    if (message.type === 'INIT') {
      const started = performance.now()
      let delegate: 'GPU' | 'CPU' = 'GPU'
      try { pose = await create('GPU') } catch { delegate = 'CPU'; pose = await create('CPU') }
      self.postMessage({ type: 'READY', delegate, loadMs: performance.now() - started })
    } else if (message.type === 'FRAME') {
      try {
        if (!pose) return
        const started = performance.now(), result = pose.detectForVideo(message.bitmap, message.timestamp)
        const points = (result.landmarks[0] || []).map(p => ({ x: p.x, y: p.y, visibility: p.visibility ?? 1 }))
        self.postMessage({ type: 'POSE', points, inferenceMs: performance.now() - started })
      } finally { message.bitmap.close() }
    } else if (message.type === 'CLOSE') { pose?.close(); pose = undefined; self.close() }
  } catch (cause) { self.postMessage({ type: 'ERROR', message: cause instanceof Error ? cause.message : String(cause) }) }
}
