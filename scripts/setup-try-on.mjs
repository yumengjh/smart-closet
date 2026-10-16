import { mkdir, cp, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Explicit developer setup, never a server-start or camera-start download.
const root = new URL('../public/try-on/', import.meta.url)
await mkdir(root, { recursive: true })
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url), new URL('wasm/', root), { recursive: true })
const model = new URL('pose_landmarker_lite.task', root)
let bytes
try { bytes = await readFile(model) } catch {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task')
  if (!response.ok) throw new Error(`Pose Lite download failed: ${response.status}`)
  bytes = Buffer.from(await response.arrayBuffer()); await writeFile(model, bytes)
}
const manifest = { package: '@mediapipe/tasks-vision', version: '1.1.0', model: 'pose_landmarker_lite/float16/1',
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  source: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  documentation: 'https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker' }
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Pose Lite ready: ${manifest.bytes} bytes, SHA256 ${manifest.sha256}`)
