// 情绪价值（ToC 改版（二）第五节，T10/T11）：只在真实完成时庆祝——右滑穿上、首次看到搭配、到账或开通、上身图做好。
// canvas-confetti 按需动态加载，首屏不打包；减少动态效果时不放彩带，只留音效（音效自身遵守开关）。
import { playSound } from './sound'

type Kind = 'wear' | 'milestone' | 'paid'
type Origin = { x: number; y: number }

const PALETTE = ['#111111', '#3b6cf6', '#9db5f7', '#f2c94c', '#d9d9d6']
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
type Confetti = typeof import('canvas-confetti')
let loader: Promise<Confetti> | undefined
const load = () => (loader ??= import('canvas-confetti').then(m => (m as unknown as { default: Confetti }).default))

/** Where on screen an element sits, as the 0..1 origin canvas-confetti expects. */
export function originOf(el: Element | null | undefined): Origin | undefined {
  if (!el || typeof window === 'undefined') return undefined
  const box = el.getBoundingClientRect()
  return { x: (box.left + box.width / 2) / window.innerWidth, y: (box.top + box.height / 2) / window.innerHeight }
}

export async function celebrate(kind: Kind = 'wear', origin?: Origin) {
  playSound(kind === 'paid' ? 'complete' : 'success')
  if (reduced()) return
  try {
    const confetti = await load()
    const base = { colors: PALETTE, disableForReducedMotion: true, zIndex: 2400, ticks: 220, scalar: 0.9 }
    if (kind === 'milestone') {
      // Two side cannons: a bigger moment (first outfit, first week).
      confetti({ ...base, particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } })
      confetti({ ...base, particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } })
      return
    }
    confetti({ ...base, particleCount: kind === 'paid' ? 110 : 80, spread: 70, startVelocity: 38, origin: origin ?? { x: 0.5, y: 0.6 } })
  } catch { /* Celebration is decoration; never interrupt the action. */ }
}

/** A light tap when a swipe crosses its threshold; silently does nothing where vibration is unsupported (iOS Safari). */
export function haptic(ms = 8) {
  try { if (!reduced()) navigator.vibrate?.(ms) } catch { /* unsupported */ }
}
