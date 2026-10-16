import type { Garment, TaskStep } from '../services/api'

export type Point = { x: number; y: number }
export type Landmark = Point & { z: number; visibility: number }
/**
 * Sleeve anchors in normalized texture coordinates: pivot is the shoulder point where the sleeve's top seam starts,
 * tip the cuff centre and top the upper cuff corner, so pivot→top is the seam that rests on top of the arm. Reach (pivot to cuff) and extent (how far the sleeve sticks out past the body column) are in texture-height units; reach 0 means sleeveless. */
export type Sleeve = { pivot: Point; tip: Point; top: Point; limitY: number; reach: number; extent: number }
/** sleeves[0] is the image-left sleeve, sleeves[1] the image-right one. */
export type Geometry = { left: number; right: number; shoulderY: number; armpitY: number; hemY: number; sleeves: [Sleeve, Sleeve]; confidence: number; aspect: number }
export type Fit = { width: number; length: number; offset: number }
export type Vertex = { source: Point; target: Point }
export type Mesh = { divisions: number; uv: Float32Array; indices: Uint16Array }
/** Worn front views show less than a flat-lay width; 1.28× the shoulder-joint distance covers the deltoids. */
export const DEFAULT_FIT: Fit = { width: 1.28, length: 1.05, offset: 0 }
/** Shoulder landmarks are joint centres; the garment's shoulder line sits above them by this share of shoulder width. */
const SHOULDER_LIFT = .14

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
  const solid = (x: number, y: number) => rgba[(y * width + x) * 4 + 3]! > 80
  const rows: { left: number; right: number; count: number }[] = []
  let total = 0, opaque = 0
  for (let y = 0; y < height; y++) {
    let left = width, right = -1, count = 0
    for (let x = 0; x < width; x++) if (solid(x, y)) {
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
  const leftPx = median(middle.map(r => r.left)), rightPx = median(middle.map(r => r.right))
  const left = leftPx / width, right = rightPx / width, bodyWidth = right - left
  if (bodyWidth < .25 || bodyWidth > .94 || width / height < .55 || width / height > 2.3)
    throw new Error('当前轮廓不适合普通上衣模板，请用正面、袖子展开的 T 恤测试。')
  let hemPx = height - 1
  while (hemPx > height * .5 && rows[hemPx]!.count <= width * .15) hemPx--
  const tol = Math.max(2, Math.round(width * .02))
  const topAt = (x: number) => { for (let y = 0; y < height * .6; y++) if (solid(x, y)) return y; return Math.round(height * .12) }
  // The shoulder line is where the body column meets the top outline, which also follows drop shoulders.
  const shoulderPx = (topAt(Math.min(width - 1, leftPx + tol)) + topAt(Math.max(0, rightPx - tol))) / 2
  const sleeveFloor = shoulderPx + (hemPx - shoulderPx) * .75
  const sleeve = (side: 0 | 1) => {
    const edge = side ? rightPx : leftPx, probe = Math.max(0, Math.min(width - 1, edge + (side ? 2 : -2) * tol))
    // The armpit is the first row under the shoulder where just outside the body column turns transparent.
    let armpitPx = -1, seen = false
    for (let y = Math.ceil(shoulderPx); y < hemPx; y++) {
      if (solid(probe, y)) seen = true
      else if (seen) { armpitPx = y; break }
    }
    const fallback = shoulderPx + (hemPx - shoulderPx) * .25
    if (armpitPx < 0) armpitPx = fallback
    const pivotPx = { x: edge, y: topAt(Math.max(0, Math.min(width - 1, edge + (side ? -tol : tol)))) }
    // The sleeve's own axis runs from the middle of its root, not from the shoulder point above it.
    const rootPx = { x: edge, y: (pivotPx.y + armpitPx) / 2 }
    const points: Point[] = []
    for (let y = 0; y < sleeveFloor; y += 2) for (let x = side ? probe : 0; side ? x < width : x <= probe; x += 2) if (solid(x, y)) points.push({ x, y })
    const distance = (p: Point) => Math.hypot(p.x - rootPx.x, p.y - rootPx.y)
    const far = points.reduce((best, p) => Math.max(best, distance(p)), 0)
    const pivot = { x: pivotPx.x / width, y: pivotPx.y / height }
    if (!seen || points.length < 12 || far < tol * 2) return { sleeve: { pivot, tip: pivot, top: pivot, limitY: armpitPx / height, reach: 0, extent: 0 }, armpitPx: fallback }
    // The cuff centre is the middle of the outermost band measured along the sleeve, not its farthest corner;
    // a corner would tilt the axis and leave the sleeve hanging off the arm. Two passes settle the axis.
    const mean = (list: Point[]) => ({ x: list.reduce((s, p) => s + p.x, 0) / list.length, y: list.reduce((s, p) => s + p.y, 0) / list.length })
    let end = mean(points), cuff = points
    for (let pass = 0; pass < 2; pass++) {
      const axis = { x: end.x - rootPx.x, y: end.y - rootPx.y }, length = Math.hypot(axis.x, axis.y) || 1
      const along = (p: Point) => ((p.x - rootPx.x) * axis.x + (p.y - rootPx.y) * axis.y) / length
      const reach = points.reduce((best, p) => Math.max(best, along(p)), 0)
      cuff = points.filter(p => along(p) >= reach * .9); end = mean(cuff)
    }
    // The upper cuff corner lies on the side of the axis that faces up in the flat lay.
    const axis = { x: end.x - rootPx.x, y: end.y - rootPx.y }, length = Math.hypot(axis.x, axis.y) || 1
    let upward = { x: axis.y / length, y: -axis.x / length }
    if (upward.y > 0) upward = { x: -upward.x, y: -upward.y }
    const lift = (p: Point) => (p.x - end.x) * upward.x + (p.y - end.y) * upward.y
    const highest = cuff.reduce((best, p) => Math.max(best, lift(p)), 0)
    const corner = mean(cuff.filter(p => lift(p) >= highest * .85))
    const tip = { x: end.x / width, y: end.y / height }, top = { x: corner.x / width, y: corner.y / height }
    const extent = points.reduce((best, p) => Math.max(best, Math.abs(p.x - edge)), 0) / height
    return { sleeve: { pivot, tip, top, limitY: Math.max(armpitPx, ...points.map(p => p.y)) / height, reach: far / height, extent }, armpitPx }
  }
  const a = sleeve(0), b = sleeve(1)
  const widest = rows.slice(Math.floor(height * .06), Math.floor(height * .46)).reduce((best, row) => Math.max(best, row.right - row.left), 0)
  return { left, right, shoulderY: shoulderPx / height, armpitY: (a.armpitPx + b.armpitPx) / 2 / height, hemY: (hemPx + 1) / height,
    sleeves: [a.sleeve, b.sleeve], confidence: Math.min(.95, .55 + Math.min(.3, (widest / width - bodyWidth) * 1.5)), aspect: width / height }
}

const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }
const rotate = (p: Point, angle: number): Point => { const c = Math.cos(angle), s = Math.sin(angle); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c } }
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

/** How strongly a texture point follows its sleeve rather than the torso: 0 on the body column, 1 well into the sleeve. */
export function sleeveWeight(source: Point, geometry: Geometry) {
  const side = source.x < (geometry.left + geometry.right) / 2 ? 0 : 1, sleeve = geometry.sleeves[side]
  if (!sleeve.reach) return 0
  const outside = (side ? source.x - geometry.right : geometry.left - source.x) * geometry.aspect
  // The band starts just inside the seam so the shoulder bends instead of creasing. Drop-shoulder sleeves stick out
  // only a little past the body column, so the band scales with that width or the sleeve would barely turn.
  const band = Math.max(.03, Math.min(sleeve.reach * .4, sleeve.extent * .4))
  return smooth((outside + .015) / band) * (1 - smooth((source.y - sleeve.limitY) / .08))
}

/**
 * Maps garment texture coordinates to video coordinates for one pose. Work happens in pixel-proportional space
 * (x × aspect) so angles hold on portrait and landscape video. Image-left is the person's right in an unmirrored frame.
 */
export function garmentFrame(geometry: Geometry, pose: Landmark[], fit: Fit, aspect: number, rigid = false) {
  const px = (p: Point): Point => ({ x: p.x * aspect, y: p.y })
  const imageLeft = pose[11]!.x < pose[12]!.x ? 11 : 12, imageRight = imageLeft === 11 ? 12 : 11
  const sL = px(pose[imageLeft]!), sR = px(pose[imageRight]!)
  const hL = px(pose[imageLeft + 12]!), hR = px(pose[imageRight + 12]!)
  const axis = { x: sR.x - sL.x, y: sR.y - sL.y }, shoulderWidth = Math.max(1e-6, Math.hypot(axis.x, axis.y))
  let up = { x: axis.y / shoulderWidth, y: -axis.x / shoulderWidth }
  if (up.y > 0) up = { x: -up.x, y: -up.y }
  const center = mix(sL, sR, .5), hip = mix(hL, hR, .5), down = { x: hip.x - center.x, y: hip.y - center.y }
  const torsoLength = Math.max(1e-6, Math.hypot(down.x, down.y))
  // A body turned towards the side keeps its chest depth on screen while the shoulder span shrinks. Pose Lite
  // exaggerates depth (often beyond the shoulder span itself), so z only signals the turn and widens by at most 20%.
  const turn = Math.min(1, Math.abs(pose[imageRight]!.z - pose[imageLeft]!.z) * aspect / shoulderWidth / 3)
  const spread = 1 + .2 * turn
  const half = { x: axis.x * fit.width * spread / 2, y: axis.y * fit.width * spread / 2 }
  const shift = { x: down.x * fit.offset, y: down.y * fit.offset }
  const lift = { x: up.x * shoulderWidth * SHOULDER_LIFT, y: up.y * shoulderWidth * SHOULDER_LIFT }
  const topL = { x: center.x - half.x + lift.x + shift.x, y: center.y - half.y + lift.y + shift.y }
  const topR = { x: center.x + half.x + lift.x + shift.x, y: center.y + half.y + lift.y + shift.y }
  // The hem follows the hips from the joint line, so lifting the shoulders does not shorten the garment.
  const bottomL = { x: center.x - half.x + down.x * fit.length + shift.x, y: center.y - half.y + down.y * fit.length + shift.y }
  const bottomR = { x: center.x + half.x + down.x * fit.length + shift.x, y: center.y + half.y + down.y * fit.length + shift.y }
  const torso = (source: Point) => {
    const u = (source.x - geometry.left) / (geometry.right - geometry.left)
    const v = (source.y - geometry.shoulderY) / (geometry.hemY - geometry.shoulderY)
    return mix(mix(topL, topR, u), mix(bottomL, bottomR, u), v)
  }
  const arms = ([0, 1] as const).map(side => {
    const sleeve = geometry.sleeves[side], index = side ? imageRight : imageLeft
    if (rigid || !sleeve.reach) return null
    const pivot = torso(sleeve.pivot), top = torso(sleeve.top)
    const shoulder = pose[index]!, elbow = pose[index + 2]!, wrist = pose[index + 4]!
    let arm = { x: (elbow.x - shoulder.x) * aspect, y: elbow.y - shoulder.y }
    let depth = (elbow.z - shoulder.z) * aspect
    // An unseen arm hangs slightly away from the body instead of keeping the flat-lay angle.
    const outward = side ? 1 : -1
    const hanging = { x: down.x / torsoLength + axis.x / shoulderWidth * outward * .25, y: down.y / torsoLength + axis.y / shoulderWidth * outward * .25 }
    if (elbow.visibility < .2 || Math.hypot(arm.x, arm.y) < 1e-4) { arm = { x: hanging.x * torsoLength * .55, y: hanging.y * torsoLength * .55 }; depth = 0 }
    const planar = Math.hypot(arm.x, arm.y), full = Math.hypot(planar, depth)
    // An arm pointing at the camera has an unreliable on-screen angle; lean the sleeve towards hanging instead of
    // letting it swing across the chest.
    const trust = smooth((planar / full - .35) / .4)
    const blended = { x: arm.x / planar * trust + hanging.x / Math.hypot(hanging.x, hanging.y) * (1 - trust), y: arm.y / planar * trust + hanging.y / Math.hypot(hanging.x, hanging.y) * (1 - trust) }
    const blendedLength = Math.hypot(blended.x, blended.y) || 1
    const forearm = { x: (wrist.x - elbow.x) * aspect, y: wrist.y - elbow.y }
    const bend = elbow.visibility >= .3 && wrist.visibility >= .3 && Math.hypot(forearm.x, forearm.y) > 1e-4
      ? wrap(Math.atan2(forearm.y, forearm.x) - Math.atan2(arm.y, arm.x)) * trust : 0
    const direction = { x: blended.x / blendedLength, y: blended.y / blendedLength }
    // The sleeve's top seam rests along the top of the arm: the pivot moves onto the shoulder joint, raised by
    // roughly the arm's radius on the side facing the head, as the sleeve takes over from the torso.
    let armUp = { x: -direction.y, y: direction.x }
    if (armUp.x * up.x + armUp.y * up.y < 0) armUp = { x: -armUp.x, y: -armUp.y }
    const radius = shoulderWidth * SHOULDER_LIFT * .8
    const shift = { x: shoulder.x * aspect + armUp.x * radius - pivot.x, y: shoulder.y + armUp.y * radius - pivot.y }
    return { pivot, shift, angle: wrap(Math.atan2(direction.y, direction.x) - Math.atan2(top.y - pivot.y, top.x - pivot.x)), direction,
      // An arm pointing at the camera looks shorter, so the sleeve shortens with it instead of sticking out.
      foreshorten: Math.max(.45, Math.min(1, planar / full)), elbowAt: full, bend }
  })
  return (source: Point): Point => {
    const base = torso(source)
    const weight = rigid ? 0 : sleeveWeight(source, geometry)
    const arm = weight ? arms[source.x < (geometry.left + geometry.right) / 2 ? 0 : 1] : null
    if (!arm) return { x: base.x / aspect, y: base.y }
    // Blend the rotation angle rather than positions, so the seam band turns smoothly without collapsing.
    const turned = rotate({ x: base.x - arm.pivot.x, y: base.y - arm.pivot.y }, arm.angle * weight)
    const along = turned.x * arm.direction.x + turned.y * arm.direction.y
    const across = { x: turned.x - arm.direction.x * along, y: turned.y - arm.direction.y * along }
    const scale = 1 + weight * (arm.foreshorten - 1)
    const reach = Math.min(along, arm.elbowAt) * scale + Math.max(0, along - arm.elbowAt)
    const origin = { x: arm.pivot.x + arm.shift.x * weight, y: arm.pivot.y + arm.shift.y * weight }
    let point = { x: origin.x + arm.direction.x * reach + across.x, y: origin.y + arm.direction.y * reach + across.y }
    // Long sleeves bend at the elbow; short sleeves end before it and ignore the wrist.
    const bendWeight = arm.bend ? weight * smooth((along - arm.elbowAt * .8) / (arm.elbowAt * .4)) : 0
    if (bendWeight) {
      const elbow = { x: origin.x + arm.direction.x * arm.elbowAt * scale, y: origin.y + arm.direction.y * arm.elbowAt * scale }
      const bent = rotate({ x: point.x - elbow.x, y: point.y - elbow.y }, arm.bend * bendWeight)
      point = { x: elbow.x + bent.x, y: elbow.y + bent.y }
    }
    return { x: point.x / aspect, y: point.y }
  }
}

export function deformPoint(source: Point, geometry: Geometry, pose: Landmark[], fit: Fit, aspect: number, rigid = false): Point {
  return garmentFrame(geometry, pose, fit, aspect, rigid)(source)
}

/**
 * A shared grid over the texture. Triangles are ordered by sleeve weight so sleeves draw over the torso
 * when an arm hangs in front of the body.
 */
export function createMesh(geometry: Geometry, divisions = 24): Mesh {
  const row = divisions + 1, uv = new Float32Array(row * row * 2)
  for (let y = 0; y <= divisions; y++) for (let x = 0; x <= divisions; x++) uv.set([x / divisions, y / divisions], (y * row + x) * 2)
  const cells: { weight: number; indices: number[] }[] = []
  for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
    const a = y * row + x, b = a + 1, c = a + row + 1, d = a + row
    cells.push({ weight: sleeveWeight({ x: (x + .5) / divisions, y: (y + .5) / divisions }, geometry), indices: [a, b, c, a, c, d] })
  }
  cells.sort((p, q) => p.weight - q.weight)
  return { divisions, uv, indices: Uint16Array.from(cells.flatMap(c => c.indices)) }
}

/** Writes clip-space positions for every mesh vertex into out (same length as uv). */
export function deformMesh(mesh: Mesh, geometry: Geometry, pose: Landmark[], fit: Fit, aspect: number, rigid: boolean, out: Float32Array) {
  const map = garmentFrame(geometry, pose, fit, aspect, rigid)
  for (let i = 0; i < mesh.uv.length; i += 2) {
    const target = map({ x: mesh.uv[i]!, y: mesh.uv[i + 1]! })
    out[i] = target.x * 2 - 1; out[i + 1] = 1 - target.y * 2
  }
  return out
}

export function buildMesh(geometry: Geometry, pose: Landmark[], fit: Fit, aspect: number, rigid = false, divisions = 20): Vertex[] {
  const map = garmentFrame(geometry, pose, fit, aspect, rigid), mesh: Vertex[] = []
  for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
    const a = { x: x / divisions, y: y / divisions }, b = { x: (x + 1) / divisions, y: y / divisions }
    const c = { x: (x + 1) / divisions, y: (y + 1) / divisions }, d = { x: x / divisions, y: (y + 1) / divisions }
    for (const source of [a, b, c, a, c, d]) mesh.push({ source, target: map(source) })
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
