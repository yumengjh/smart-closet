import type { Landmark } from './geometry'
import type { Connections, Hand } from './tracker'

export type OverlayInput = { pose: Landmark[]; garmentPose: Landmark[]; hands: Hand[]; face: Landmark[]; connections: Connections | null; mirror: boolean }

/**
 * Debug drawing of everything the perception models see. The overlay canvas is never CSS-mirrored; points are flipped
 * here instead so the labels stay readable.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, input: OverlayInput) {
  ctx.clearRect(0, 0, width, height)
  const x = (p: Landmark) => (input.mirror ? 1 - p.x : p.x) * width
  const at = (p: Landmark) => [x(p), p.y * height] as const
  const lines = (points: Landmark[], pairs: { start: number; end: number }[] | undefined, color: string, lineWidth: number, minVisibility = .3) => {
    if (!pairs || !points.length) return
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath()
    for (const { start, end } of pairs) {
      const a = points[start], b = points[end]
      if (!a || !b || a.visibility < minVisibility || b.visibility < minVisibility) continue
      ctx.moveTo(...at(a)); ctx.lineTo(...at(b))
    }
    ctx.stroke()
  }
  const dots = (points: Landmark[], color: string, radius: number, minVisibility = .3) => {
    ctx.fillStyle = color
    for (const p of points) if (p.visibility >= minVisibility) { ctx.beginPath(); ctx.arc(...at(p), radius, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.lineCap = 'round'
  lines(input.face, input.connections?.face, '#9ad1ff99', 1, 0)
  // Raw model output in cyan; the smoothed points that place the garment in amber.
  lines(input.pose, input.connections?.pose, '#36e2c8', 3)
  dots(input.pose, '#ffffff', 3.5)
  dots([11, 12, 13, 14, 15, 16, 23, 24].map(i => input.garmentPose[i]).filter((p): p is Landmark => !!p), '#ffb02e', 5, .01)
  for (const hand of input.hands) {
    lines(hand.landmarks, input.connections?.hand, '#ff6fb1', 2, 0)
    dots(hand.landmarks, '#ffe1ef', 2.5, 0)
    const wrist = hand.landmarks[0]
    if (wrist && hand.gesture !== 'None') {
      ctx.font = '600 14px system-ui'; ctx.fillStyle = '#ff6fb1'
      ctx.fillText(`${hand.gesture} ${Math.round(hand.score * 100)}%`, x(wrist) + 8, wrist.y * height + 18)
    }
  }
}
