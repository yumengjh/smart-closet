/// <reference lib="webworker" />
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

let detector: PoseLandmarker | undefined
// The 1.1 runtime exposes an ES-module WASM loader. Keep its runtime URL out of Vite's source-import rewriting.
;(self as typeof self & { import: (url: string) => Promise<unknown> }).import = url => import(/* @vite-ignore */ url)
self.onmessage = async (event: MessageEvent) => {
  const message = event.data
  try {
    if (message.type === 'INIT') {
      const vision = await FilesetResolver.forVisionTasks(`${self.location.origin}/try-on/wasm`, true)
      let delegate: 'GPU' | 'CPU' = 'GPU'
      const options = { baseOptions: { modelAssetPath: '/try-on/pose_landmarker_lite.task', delegate },
        runningMode: 'VIDEO' as const, numPoses: 1, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5 }
      try { detector = await PoseLandmarker.createFromOptions(vision, options) }
      catch { delegate = 'CPU'; detector = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate } }) }
      self.postMessage({ type: 'READY', delegate })
    } else if (message.type === 'FRAME') {
      const start = performance.now()
      try {
        if (!detector) throw new Error('姿态模型尚未就绪。')
        const result = detector.detectForVideo(message.bitmap, message.timestamp)
        self.postMessage({ type: 'POSE', timestamp: message.timestamp, inferenceMs: performance.now() - start,
          landmarks: (result.landmarks[0] || []).map((p, i) => [11, 12, 13, 14, 15, 16, 23, 24].includes(i)
            ? { x: p.x, y: p.y, z: p.z, visibility: p.visibility } : { x: 0, y: 0, z: 0, visibility: 0 }) })
      } finally { message.bitmap.close() }
    } else if (message.type === 'CLOSE') { detector?.close(); detector = undefined; self.close() }
  } catch (cause) { self.postMessage({ type: 'ERROR', message: cause instanceof Error ? cause.message : String(cause) }) }
}
