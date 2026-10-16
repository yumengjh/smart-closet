import { mkdir, cp, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Explicit developer setup, never a server-start or camera-start download.
const root = new URL('../public/try-on/', import.meta.url)
await mkdir(root, { recursive: true })
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url), new URL('wasm/', root), { recursive: true })
const store = 'https://storage.googleapis.com/mediapipe-models/'
// Pose is required. Hands (with gesture labels) and the face mesh are optional and only load when switched on.
const models = [
  { file: 'pose_landmarker_lite.task', path: 'pose_landmarker/pose_landmarker_lite/float16/1', required: true, documentation: 'https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker' },
  { file: 'gesture_recognizer.task', path: 'gesture_recognizer/gesture_recognizer/float16/1', required: false, documentation: 'https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer' },
  { file: 'face_landmarker.task', path: 'face_landmarker/face_landmarker/float16/1', required: false, documentation: 'https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker' },
]
const entries = []
for (const model of models) {
  const target = new URL(model.file, root), source = `${store}${model.path}/${model.file}`
  let bytes
  try { bytes = await readFile(target) } catch {
    const response = await fetch(source)
    if (!response.ok) {
      if (model.required) throw new Error(`${model.file} download failed: ${response.status}`)
      console.warn(`Skipped optional ${model.file}: ${response.status}`); continue
    }
    bytes = Buffer.from(await response.arrayBuffer()); await writeFile(target, bytes)
  }
  const entry = { file: model.file, model: model.path.replace(/^[^/]+\//, ''), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), source, documentation: model.documentation }
  entries.push(entry)
  console.log(`${model.file}: ${entry.bytes} bytes, SHA256 ${entry.sha256}`)
}
await writeFile(new URL('manifest.json', root), JSON.stringify({ package: '@mediapipe/tasks-vision', version: '1.1.0', models: entries }, null, 2) + '\n')
