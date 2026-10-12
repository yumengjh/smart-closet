import type { Pose, PoseJoint } from '../services/platform'

/** Card frame is 3:4; joint coordinates are 0–1 of that frame. */
export const FRAME = { width: 120, height: 160 }
type Side = 'left' | 'right' | 'core'
export const BONES: [PoseJoint, PoseJoint, Side][] = [
  ['NECK', 'L_SHOULDER', 'core'], ['NECK', 'R_SHOULDER', 'core'],
  ['L_SHOULDER', 'L_ELBOW', 'left'], ['L_ELBOW', 'L_WRIST', 'left'],
  ['R_SHOULDER', 'R_ELBOW', 'right'], ['R_ELBOW', 'R_WRIST', 'right'],
  ['L_HIP', 'L_KNEE', 'left'], ['L_KNEE', 'L_ANKLE', 'left'],
  ['R_HIP', 'R_KNEE', 'right'], ['R_KNEE', 'R_ANKLE', 'right'],
]
export type Segment = { x1: number; y1: number; x2: number; y2: number; side: Side; key: string }
export type Figure = { segments: Segment[]; torso: string | null; head: { x: number; y: number; r: number } | null; joints: { x: number; y: number; key: string }[]; ground: number }

function point(pose: Pose, joint: PoseJoint) {
  const p = pose.keypoints[joint]
  return p ? { x: p[0] * FRAME.width, y: p[1] * FRAME.height } : null
}

/** Turns joint positions into drawable bones, a soft torso shape, the head and a ground line. */
export function figure(pose: Pose): Figure | null {
  if (Object.keys(pose.keypoints || {}).length < 4) return null
  const segments: Segment[] = []
  for (const [a, b, side] of BONES) {
    const p = point(pose, a), q = point(pose, b)
    if (p && q) segments.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, side, key: `${a}-${b}` })
  }
  const corners = (['L_SHOULDER', 'R_SHOULDER', 'R_HIP', 'L_HIP'] as PoseJoint[]).map(j => point(pose, j))
  const torso = corners.every(Boolean) ? corners.map(c => `${c!.x.toFixed(1)},${c!.y.toFixed(1)}`).join(' ') : null
  const headPoint = point(pose, 'HEAD'), neck = point(pose, 'NECK')
  const head = headPoint ? { ...headPoint, r: neck ? Math.min(11, Math.max(6, Math.hypot(headPoint.x - neck.x, headPoint.y - neck.y) * 0.62)) : 8 } : null
  if (head && neck) segments.push({ x1: neck.x, y1: neck.y, x2: head.x + (neck.x - head.x) * (head.r / Math.max(1, Math.hypot(neck.x - head.x, neck.y - head.y))), y2: head.y + (neck.y - head.y) * (head.r / Math.max(1, Math.hypot(neck.x - head.x, neck.y - head.y))), side: 'core', key: 'neck' })
  const joints = (['L_ELBOW', 'R_ELBOW', 'L_WRIST', 'R_WRIST', 'L_KNEE', 'R_KNEE', 'L_ANKLE', 'R_ANKLE'] as PoseJoint[])
    .map(j => ({ key: j, p: point(pose, j) })).filter(j => j.p).map(j => ({ key: j.key, x: j.p!.x, y: j.p!.y }))
  const ankles = [point(pose, 'L_ANKLE'), point(pose, 'R_ANKLE')].filter(Boolean).map(p => p!.y)
  return { segments, torso, head, joints, ground: ankles.length ? Math.max(...ankles) + 4 : FRAME.height * 0.93 }
}

/** Stable soft palette per card so a grid of cards does not look uniform. */
const PALETTES = [['#fde8df', '#f7c9b8'], ['#e3f0ff', '#c4dcfb'], ['#e8f5ec', '#c6e6d1'], ['#f3e8fb', '#dcc7f1'], ['#fff4d9', '#f8dfa2'], ['#e6f6f6', '#bfe4e4']]
export function palette(id: string) {
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return PALETTES[hash % PALETTES.length]
}

export const SOURCE_LABEL: Record<Pose['source'], string> = { PRESET: '预设', PHOTO: '图片提取', TEXT: '文字' }
