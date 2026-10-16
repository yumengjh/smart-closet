import type { Landmark } from './geometry'

/**
 * The line under the chin that the garment must stay below. With the optional face mesh, it runs from forehead (10)
 * to chin (152); otherwise the pose model's nose and mouth corners give it, with the chin about 1.6 nose-to-mouth
 * lengths below the mouth.
 */
export function chinLine(pose: Landmark[], face: Landmark[] = []) {
  const forehead = face[10], chin = face[152]
  if (forehead && chin) {
    const dx = chin.x - forehead.x, dy = chin.y - forehead.y
    return Math.hypot(dx, dy) > 1e-4 ? { x: chin.x, y: chin.y, dx, dy } : null
  }
  const nose = pose[0], a = pose[9], b = pose[10]
  if (!nose || !a || !b || [nose, a, b].some(p => p.visibility < .5)) return null
  const mouth = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dx = mouth.x - nose.x, dy = mouth.y - nose.y
  if (Math.hypot(dx, dy) < 1e-4 || dy <= 0) return null
  return { x: mouth.x + dx * 1.6, y: mouth.y + dy * 1.6, dx, dy }
}

/** Circles around detected hands, in video coordinates with the radius in video-height units. */
export function handCircles(hands: { landmarks: Landmark[] }[], aspect: number) {
  return hands.filter(h => h.landmarks.length >= 21).map(({ landmarks }) => {
    const x = landmarks.reduce((s, p) => s + p.x, 0) / landmarks.length, y = landmarks.reduce((s, p) => s + p.y, 0) / landmarks.length
    const r = landmarks.reduce((best, p) => Math.max(best, Math.hypot((p.x - x) * aspect, p.y - y)), 0) * 1.1
    return { x, y, r }
  })
}
