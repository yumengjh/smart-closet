/// <reference lib="webworker" />
import { FaceLandmarker, FilesetResolver, GestureRecognizer, PoseLandmarker } from '@mediapipe/tasks-vision'

type Delegate = 'GPU' | 'CPU'
type Options = { hands: boolean; face: boolean }
let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | undefined
let pose: PoseLandmarker | undefined, hands: GestureRecognizer | undefined, face: FaceLandmarker | undefined
let delegate: Delegate = 'GPU', poseDelegate: Delegate = 'GPU', frame = 0
// The 1.1 runtime exposes an ES-module WASM loader. Keep its runtime URL out of Vite's source-import rewriting.
// MediaPipe clears the loader's global factory after each model is created, and a cached ES module does not run
// again, so every model after the first needs its own module instance; the file itself still comes from cache.
let loaderInstance = 0
;(self as typeof self & { import: (url: string) => Promise<unknown> }).import = url =>
  import(/* @vite-ignore */ `${url}${url.includes('?') ? '&' : '?'}instance=${++loaderInstance}`)

async function create<T>(make: (d: Delegate) => Promise<T>): Promise<T> {
  try { return await make(delegate) } catch { delegate = 'CPU'; return make(delegate) }
}
const base = (file: string, d: Delegate) => ({ modelAssetPath: `/try-on/${file}`, delegate: d })
/**
 * Optional models load on demand, so plain try-on keeps the cost of the single pose model. A missing or failing
 * optional model is reported but never stops pose tracking.
 */
async function configure(options: Options) {
  const problems: string[] = []
  try {
    if (options.hands && !hands) hands = await create(d => GestureRecognizer.createFromOptions(fileset!, { baseOptions: base('gesture_recognizer.task', d), runningMode: 'VIDEO', numHands: 2 }))
  } catch (cause) { problems.push(`手部模型（${cause instanceof Error ? cause.message : cause}）`) }
  if (!options.hands && hands) { hands.close(); hands = undefined }
  try {
    if (options.face && !face) face = await create(d => FaceLandmarker.createFromOptions(fileset!, { baseOptions: base('face_landmarker.task', d), runningMode: 'VIDEO', numFaces: 1 }))
  } catch (cause) { problems.push(`面部模型（${cause instanceof Error ? cause.message : cause}）`) }
  if (!options.face && face) { face.close(); face = undefined }
  return problems.length ? `${problems.join('、')}未能加载，请先运行 npm run setup:try-on。姿态追踪不受影响。` : ''
}
const point = (p: { x: number; y: number; z: number; visibility?: number }) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 })

self.onmessage = async (event: MessageEvent) => {
  const message = event.data
  try {
    if (message.type === 'INIT') {
      fileset = await FilesetResolver.forVisionTasks(`${self.location.origin}/try-on/wasm`, true)
      pose = await create(d => PoseLandmarker.createFromOptions(fileset!, { baseOptions: base('pose_landmarker_lite.task', d),
        runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5 }))
      poseDelegate = delegate
      const warning = await configure(message.options || { hands: false, face: false })
      self.postMessage({ type: 'READY', delegate: poseDelegate, warning, hands: !!hands, face: !!face, connections: {
        pose: PoseLandmarker.POSE_CONNECTIONS, hand: GestureRecognizer.HAND_CONNECTIONS, face: FaceLandmarker.FACE_LANDMARKS_CONTOURS } })
    } else if (message.type === 'CONFIG') {
      const warning = await configure(message.options)
      self.postMessage({ type: 'CONFIGURED', warning, hands: !!hands, face: !!face })
    } else if (message.type === 'FRAME') {
      const started = performance.now(), timings: Record<string, number> = {}
      try {
        if (!pose) throw new Error('姿态模型尚未就绪。')
        const result = pose.detectForVideo(message.bitmap, message.timestamp)
        timings.pose = performance.now() - started
        frame++
        let handResults: { side: string; landmarks: ReturnType<typeof point>[]; gesture: string; score: number }[] | undefined
        // Hands run every frame so gestures stay responsive; the face mesh is only displayed, so every third frame.
        if (hands) {
          const t = performance.now(), r = hands.recognizeForVideo(message.bitmap, message.timestamp)
          handResults = r.landmarks.map((landmarks, i) => ({ side: r.handedness[i]?.[0]?.categoryName || '', landmarks: landmarks.map(point),
            gesture: r.gestures[i]?.[0]?.categoryName || 'None', score: r.gestures[i]?.[0]?.score || 0 }))
          timings.hands = performance.now() - t
        }
        let faceResult: ReturnType<typeof point>[] | undefined
        if (face && frame % 3 === 0) {
          const t = performance.now(), r = face.detectForVideo(message.bitmap, message.timestamp)
          faceResult = (r.faceLandmarks[0] || []).map(point)
          timings.face = performance.now() - t
        }
        self.postMessage({ type: 'POSE', timestamp: message.timestamp, inferenceMs: performance.now() - started, timings,
          landmarks: (result.landmarks[0] || []).map(point), hands: handResults, face: faceResult })
      } finally { message.bitmap.close() }
    } else if (message.type === 'CLOSE') { pose?.close(); hands?.close(); face?.close(); pose = hands = face = undefined; self.close() }
  } catch (cause) { self.postMessage({ type: 'ERROR', message: cause instanceof Error ? cause.message : String(cause) }) }
}
