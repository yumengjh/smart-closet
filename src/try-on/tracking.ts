import { usablePose, type Landmark } from './geometry.ts'

export type TrackingStatus = 'tracking' | 'upper-body' | 'holding' | 'searching' | 'shoulders' | 'slow'
export type TrackedPose = { landmarks: Landmark[]; timestamp: number; status: TrackingStatus }
const HOLD_MS = 700
const MAX_RESULT_AGE_MS = 1200

/** Only clothing anchors are estimated; this is a preview template, not a body measurement. */
export function preparePose(points: Landmark[], aspect: number, minVisibility = .4) {
  if (!usablePose(points, minVisibility) || !Number.isFinite(aspect) || aspect <= 0) return null
  const landmarks = Array.from({ length: 33 }, (_, i) => {
    const p = points[i]
    return p && [p.x, p.y, p.z, p.visibility].every(Number.isFinite) ? { ...p } : { x: 0, y: 0, z: 0, visibility: 0 }
  })
  const a = landmarks[11]!, b = landmarks[12]!, hipA = landmarks[23]!, hipB = landmarks[24]!
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const dx = (b.x - a.x) * aspect, dy = b.y - a.y, width = Math.hypot(dx, dy)
  const hipX = (hipA.x + hipB.x) / 2, hipY = (hipA.y + hipB.y) / 2
  const length = Math.hypot((hipX - center.x) * aspect, hipY - center.y)
  const hipsInFrame = [hipA, hipB].every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)
  const estimatedTorso = !hipsInFrame || hipA.visibility < .35 || hipB.visibility < .35 || hipY <= center.y
    || length < width * .6 || length > width * 3.2
  if (estimatedTorso) {
    const sign = dx >= 0 ? 1 : -1
    // Extend downwards perpendicular to the shoulders, in pixel space on either camera aspect.
    const offsetX = -dy * sign * 1.55 / aspect, offsetY = Math.abs(dx) * 1.55
    for (const [hip, shoulder] of [[23, a], [24, b]] as const) landmarks[hip] = {
      x: center.x + (shoulder.x - center.x) * .72 + offsetX,
      y: center.y + (shoulder.y - center.y) * .72 + offsetY,
      z: shoulder.z, visibility: 0,
    }
  }
  return { landmarks, estimatedTorso }
}

/** Keep brief detection gaps from flashing, while bounding the age of any frozen garment. */
export class PoseStabilizer {
  private landmarks: Landmark[] = []
  private timestamp = 0
  private acceptedAt = -Infinity
  private status: TrackingStatus = 'searching'

  update(points: Landmark[], timestamp: number, receivedAt: number, aspect: number): TrackedPose {
    const retained = receivedAt - this.acceptedAt <= HOLD_MS
    const timely = receivedAt - timestamp <= MAX_RESULT_AGE_MS
    const prepared = timely ? preparePose(points, aspect, retained ? .3 : .4) : null
    if (prepared) {
      const old = retained ? this.landmarks : []
      // Do not drag a newly acquired person across the screen from a previous location.
      const jump = old[11] && Math.hypot((prepared.landmarks[11]!.x - old[11].x) * aspect, prepared.landmarks[11]!.y - old[11].y) > .25
      this.landmarks = prepared.landmarks.map((p, i) => {
        const previous = !jump && old[i]
        return previous ? { ...p, x: previous.x + (p.x - previous.x) * .65, y: previous.y + (p.y - previous.y) * .65, z: previous.z + (p.z - previous.z) * .65 } : p
      })
      this.timestamp = timestamp; this.acceptedAt = receivedAt
      this.status = prepared.estimatedTorso ? 'upper-body' : 'tracking'
    } else {
      this.status = !timely ? 'slow' : points.length ? 'shoulders' : 'searching'
      if (!retained) this.landmarks = []
      else this.status = 'holding'
    }
    return this.current(receivedAt)
  }

  current(now: number): TrackedPose {
    const fresh = now - this.acceptedAt <= HOLD_MS && now - this.timestamp <= MAX_RESULT_AGE_MS + HOLD_MS
    return { landmarks: fresh ? this.landmarks : [], timestamp: this.timestamp,
      status: fresh ? this.status : this.status === 'holding' ? 'searching' : this.landmarks.length ? 'slow' : this.status }
  }
}
