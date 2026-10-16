import type { Garment, TaskStep } from '../services/api'

export type Point = { x: number; y: number }
export type Landmark = Point & { z: number; visibility: number }
export type Geometry = { left: number; right: number; shoulderY: number; cuffY: number; hemY: number; sleeve: number; confidence: number; aspect: number }
export type Fit = { width: number; length: number; offset: number }
export type Vertex = { source: Point; target: Point }
export const DEFAULT_FIT: Fit = { width: 1.12, length: 1.05, offset: 0 }

export function textureWorkflowId(url: string) {
  return url.match(/\/api\/workflows\/([\da-f-]{36})\/files\//i)?.[1]
}
type TextureWorkflow = { id: string; steps: Pick<TaskStep, 'type' | 'status' | 'outputUrl'>[] }

/** AI_ENHANCED labels both the clean generation and its outlined sticker. Use the actual producing step. */
export function cleanTextureCandidates(garment: Pick<Garment, 'images' | 'sourceUrl'> & Partial<Pick<Garment, 'displayUrl'>>, workflows: TextureWorkflow[] = []) {
  const steps = new Map(workflows.flatMap(w => w.steps.filter(s => s.outputUrl).map(s => [s.outputUrl!, s] as const)))
  const rank: Record<string, number> = { ENSURE_TRANSPARENCY: 0, AI_ENHANCED: 1, GENERATE: 1, SEGMENT: 2, BASE: 3, INPUT: 4 }
  const displayedWorkflow = textureWorkflowId(garment.displayUrl || '')
  return garment.images.map((asset, index) => ({ ...asset, index })).filter(a => {
    const step = steps.get(a.url)
    if (!(a.kind in rank) || a.reviewStatus === 'REJECTED' || step?.type === 'STICKER') return false
    if (step && step.status !== 'completed') return false
    return a.kind !== 'AI_ENHANCED' || !!step && ['GENERATE', 'ENSURE_TRANSPARENCY', 'SEGMENT'].includes(step.type || '')
  }).sort((a, b) => Number(textureWorkflowId(b.url) === displayedWorkflow) - Number(textureWorkflowId(a.url) === displayedWorkflow)
    || rank[a.kind]! - rank[b.kind]! || b.index - a.index)
    .map(a => ({ id: a.id, url: a.url, kind: a.kind }))
}

/** One-time silhouette analysis of a cropped clean RGBA texture. No person data or remote model calls. */
export function analyzeAlpha(rgba: Uint8ClampedArray, width: number, height: number): Geometry {
  const rows: { left: number; right: number; count: number }[] = []
  let total = 0, opaque = 0
  for (let y = 0; y < height; y++) {
    let left = width, right = -1, count = 0
    for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3]! > 80) {
      left = Math.min(left, x); right = x; count++; total++
      if (rgba[(y * width + x) * 4 + 3]! > 245) opaque++
    }
    rows.push({ left, right, count })
  }
  if (total < width * height * .12 || total > width * height * .94 || opaque < total * .6)
    throw new Error('这张素材没有清晰的透明衣物轮廓。请选无白边抠图，或导入透明 PNG。')
  const middle = rows.slice(Math.floor(height * .58), Math.floor(height * .86)).filter(r => r.count > width * .15)
  if (!middle.length) throw new Error('没有找到稳定的衣身轮廓，请换一件正面展开的上衣。')
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
  const left = median(middle.map(r => r.left)) / width, right = median(middle.map(r => r.right)) / width
  const upper = rows.slice(Math.floor(height * .06), Math.floor(height * .46))
  const widest = upper.reduce((best, row, index) => row.right - row.left > best.span ? { span: row.right - row.left, y: index } : best, { span: 0, y: 0 })
  const bodyWidth = right - left
  if (bodyWidth < .25 || bodyWidth > .94 || width / height < .55 || width / height > 2.3)
    throw new Error('当前轮廓不适合普通上衣模板，请用正面、袖子展开的 T 恤测试。')
  return { left, right, shoulderY: .12, cuffY: Math.max(.21, Math.min(.42, .06 + widest.y / height + .08)),
    hemY: .97, sleeve: Math.max(.06, Math.min(.34, Math.max(left, 1 - right))),
    confidence: Math.min(.95, .55 + Math.min(.3, (widest.span / width - bodyWidth) * 1.5)), aspect: width / height }
}

const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }

/** Image-left is the person's right in an unmirrored camera frame. All output uses the same video coordinates. */
export function deformPoint(source: Point, geometry: Geometry, pose: Landmark[], fit: Fit, aspect: number, rigid = false): Point {
  const a = pose[11]!, b = pose[12]!, hipA = pose[23]!, hipB = pose[24]!
  const imageLeft = a.x < b.x ? 11 : 12, imageRight = imageLeft === 11 ? 12 : 11
  const shoulderL = pose[imageLeft]!, shoulderR = pose[imageRight]!
  const hipL = imageLeft === 11 ? hipA : hipB, hipR = imageLeft === 11 ? hipB : hipA
  const center = mix(shoulderL, shoulderR, .5), bottomCenter = mix(hipL, hipR, .5)
  const dx = (shoulderR.x - shoulderL.x) * fit.width, dy = (shoulderR.y - shoulderL.y) * fit.width
  const offsetY = (bottomCenter.y - center.y) * fit.offset
  const topL = { x: center.x - dx / 2, y: center.y - dy / 2 + offsetY }
  const topR = { x: center.x + dx / 2, y: center.y + dy / 2 + offsetY }
  const u = (source.x - geometry.left) / (geometry.right - geometry.left)
  const v = (source.y - geometry.shoulderY) / (geometry.hemY - geometry.shoulderY)
  const top = mix(topL, topR, u)
  const bottom = { x: top.x + (bottomCenter.x - center.x) * fit.length,
    y: top.y + (bottomCenter.y - center.y) * fit.length }
  const torso = mix(top, bottom, v)
  if (rigid) return torso
  const leftSide = source.x < (geometry.left + geometry.right) / 2
  const edge = leftSide ? geometry.left : geometry.right
  const weight = smooth((leftSide ? edge - source.x : source.x - edge) / Math.max(.04, geometry.sleeve * .7))
    * (1 - smooth((source.y - geometry.cuffY) / .16))
  if (!weight) return torso
  const index = leftSide ? imageLeft : imageRight
  const shoulder = leftSide ? topL : topR, elbow = pose[index + 2]!
  if (elbow.visibility < .45) return torso
  // Rotate a sleeve around its shoulder, preserving pixel-space angles on portrait and landscape video.
  const restX = (leftSide ? -geometry.sleeve : geometry.sleeve), restY = (geometry.cuffY - geometry.shoulderY) / geometry.aspect
  const restLength = Math.hypot(restX, restY)
  const sx = source.x - edge, sy = (source.y - geometry.shoulderY) / geometry.aspect
  const along = (sx * restX + sy * restY) / restLength
  const across = (-sx * restY + sy * restX) / restLength
  const armX = (elbow.x - pose[index]!.x) * aspect, armY = elbow.y - pose[index]!.y
  const armLength = Math.max(.001, Math.hypot(armX, armY))
  const scale = Math.hypot(dx * aspect, dy) / (geometry.right - geometry.left)
  const arm = { x: shoulder.x + (along * armX - across * armY) / armLength * scale / aspect,
    y: shoulder.y + (along * armY + across * armX) / armLength * scale }
  return mix(torso, arm, weight)
}

export function buildMesh(geometry: Geometry, pose: Landmark[], fit: Fit, aspect: number, rigid = false, divisions = 20): Vertex[] {
  const mesh: Vertex[] = []
  for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
    const a = { x: x / divisions, y: y / divisions }, b = { x: (x + 1) / divisions, y: y / divisions }
    const c = { x: (x + 1) / divisions, y: (y + 1) / divisions }, d = { x: x / divisions, y: (y + 1) / divisions }
    for (const source of [a, b, c, a, c, d]) mesh.push({ source, target: deformPoint(source, geometry, pose, fit, aspect, rigid) })
  }
  return mesh
}

export function usablePose(points: Landmark[], minVisibility = .4) {
  // Upper-body try-on must not require hips that may be outside the camera frame.
  return [11, 12].every(i => {
    const p = points[i]
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
      && p.visibility >= minVisibility && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y < .95
  }) && Math.abs(points[11]!.x - points[12]!.x) > .025
}
