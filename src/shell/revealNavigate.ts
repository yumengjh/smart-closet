import { nextTick, ref } from 'vue'
import type { Router } from 'vue-router'

/** Where the reveal starts: a point on screen and the radius of the thing that was tapped. */
export type RevealOrigin = { x: number; y: number; from: number }

type ViewTransition = { ready: Promise<void>; finished: Promise<void> }
type WithViewTransition = Document & { startViewTransition?: (update: () => Promise<void>) => ViewTransition }

// Timers, not animation frames: while a View Transition update runs the document does not render, so rAF would stall.
const tick = (ms = 0) => new Promise<void>(resolve => window.setTimeout(resolve, ms))
/** True during a reveal; the shell turns the route <Transition> into an instant swap so nothing waits for a frame. */
export const revealing = ref(false)
function settled() { return document.querySelectorAll('.route-content .route-view').length === 1 }

/**
 * Navigate so the next page grows out of the tapped element: a View Transition whose new snapshot is clipped by a
 * circle that expands from the origin to the farthest corner, while the old page sinks back and dims. The route's own
 * fade is switched off for this one change ({@link revealing}) so the new page is in place when the snapshot is taken.
 * {@code beforeSwap} runs inside the update, so whatever it hides (an open menu) is still part of the old picture.
 * Without View Transitions, or with reduced motion, it is a plain navigation.
 */
export async function revealNavigate(router: Router, to: string, origin: RevealOrigin, beforeSwap?: () => void) {
  const doc = document as WithViewTransition
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || reduce) { beforeSwap?.(); await router.push(to); return }
  const root = document.documentElement
  const transition = doc.startViewTransition(async () => {
    revealing.value = true
    beforeSwap?.()
    await router.push(to)
    // out-in: the old view leaves, then the new one mounts on a later tick; give it a few turns, at most ~300 ms.
    for (let i = 0; i < 20; i++) { await nextTick(); await tick(i ? 16 : 0); if (i >= 2 && settled()) break }
  })
  try {
    await transition.ready
    const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y))
    const at = `at ${origin.x}px ${origin.y}px`
    root.animate({ clipPath: [`circle(${origin.from}px ${at})`, `circle(${Math.ceil(radius)}px ${at})`] },
      { duration: 520, easing: 'cubic-bezier(.7, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' })
    root.animate({ transform: ['scale(1)', 'scale(.92)'], filter: ['brightness(1)', 'brightness(.62)'] },
      { duration: 520, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards', pseudoElement: '::view-transition-old(root)' })
    await transition.finished
  } catch { /* The navigation itself already happened; only the animation was skipped. */ }
  finally { revealing.value = false }
}
