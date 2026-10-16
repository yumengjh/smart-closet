import type { Landmark } from './geometry'

export type GestureAction = 'next' | 'previous'
export type GestureHand = { side: string; gesture: string; score: number }
export type GestureState = { pending: { action: GestureAction; label: string; progress: number } | null; fired: { action: GestureAction; label: string } | null }
type Candidate = { action: GestureAction; label: string; key: string }

/** Hand gestures recognised by the optional MediaPipe GestureRecognizer model. */
const HAND_ACTIONS: Record<string, { action: GestureAction; label: string }> = {
  Thumb_Up: { action: 'next', label: '点赞 · 下一件' },
  Victory: { action: 'previous', label: '比耶 · 上一件' },
}

/** A wrist clearly above the nose with its elbow above the shoulder; a hand brushing the face does not count. */
function raised(pose: Landmark[], wrist: number, elbow: number, shoulder: number) {
  const w = pose[wrist], e = pose[elbow], s = pose[shoulder], nose = pose[0]
  if (!w || !e || !s || !nose) return false
  const span = Math.abs((pose[11]?.x ?? 0) - (pose[12]?.x ?? 0)) || .1
  return w.visibility > .5 && e.visibility > .4 && nose.visibility > .4 && w.y < nose.y - span * .25 && e.y < s.y
}

/**
 * Turns held poses into one-shot actions. A gesture must be held for holdMs, fires once, and must be released before
 * it can fire again; a cooldown stops one long hold from paging through the whole wardrobe.
 */
export class GestureDetector {
  private candidate: Candidate | null = null
  private since = 0
  private lastFired = -Infinity
  private armed = true
  private holdMs: number
  private cooldownMs: number
  constructor(holdMs = 600, cooldownMs = 1200) { this.holdMs = holdMs; this.cooldownMs = cooldownMs }

  private pick(pose: Landmark[], hands: GestureHand[]): Candidate | null {
    for (const hand of hands) {
      const mapped = HAND_ACTIONS[hand.gesture]
      if (mapped && hand.score >= .6) return { ...mapped, key: `hand:${hand.gesture}` }
    }
    // Landmark 16 is the person's right wrist; with a mirrored preview it is the hand on the right of the screen.
    const right = raised(pose, 16, 14, 12), left = raised(pose, 15, 13, 11)
    if (right === left) return null
    return right ? { action: 'next', label: '举起右手 · 下一件', key: 'pose:right' } : { action: 'previous', label: '举起左手 · 上一件', key: 'pose:left' }
  }

  update(pose: Landmark[], hands: GestureHand[], now: number): GestureState {
    const found = this.pick(pose, hands)
    if (!found) { this.candidate = null; this.armed = true; return { pending: null, fired: null } }
    if (!this.candidate || this.candidate.key !== found.key) { this.candidate = found; this.since = now }
    if (!this.armed || now - this.lastFired < this.cooldownMs) return { pending: null, fired: null }
    const progress = Math.min(1, (now - this.since) / this.holdMs)
    if (progress < 1) return { pending: { action: found.action, label: found.label, progress }, fired: null }
    this.lastFired = now; this.armed = false
    return { pending: null, fired: { action: found.action, label: found.label } }
  }
}
