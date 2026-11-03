import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Explicit build-time setup for the local pose check (never at server start or camera start).
// The model is pinned by SHA256 in public/tryon-pose/manifest.json; a mismatch fails the build instead of shipping it.
const root = new URL('../public/tryon-pose/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

await mkdir(new URL('wasm/', root), { recursive: true })
const wasm = new URL(`../node_modules/${manifest.package}/wasm/`, import.meta.url)
// Only the ES-module SIMD runtime is loaded (FilesetResolver.forVisionTasks(base, true)); the other two builds are not shipped.
for (const file of manifest.wasm) await copyFile(new URL(file, wasm), new URL(`wasm/${file}`, root))

for (const model of manifest.models) {
  const target = new URL(model.file, root)
  let bytes = await readFile(target).catch(() => null)
  if (bytes && sha(bytes) === model.sha256) { console.log(`${model.file}: present, SHA256 verified`); continue }
  if (process.env.CLOSET_POSE_OFFLINE === '1') throw new Error(`${model.file} is missing or changed and downloads are disabled`)
  const response = await fetch(model.source)
  if (!response.ok) throw new Error(`${model.file} download failed: ${response.status}`)
  bytes = Buffer.from(await response.arrayBuffer())
  if (sha(bytes) !== model.sha256) throw new Error(`${model.file} SHA256 mismatch; refusing to use it`)
  await writeFile(target, bytes)
  console.log(`${model.file}: downloaded ${bytes.length} bytes, SHA256 verified`)
}
