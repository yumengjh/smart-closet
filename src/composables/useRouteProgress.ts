import { ref } from 'vue'
import type { Router } from 'vue-router'

// Target of the navigation in flight; set as soon as a link is clicked so the UI can react before lazy chunks arrive.
export const pendingPath = ref<string | null>(null)

const prefetched = new Set<string>()

export function prefetchRoute(router: Router, path: string) {
  if (prefetched.has(path)) return
  prefetched.add(path)
  for (const record of router.resolve(path).matched) {
    const loader = record.components?.default
    // Lazy records hold a loader function until vue-router swaps in the resolved component.
    if (typeof loader === 'function') void (loader as () => Promise<unknown>)().catch(() => prefetched.delete(path))
  }
}

function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message)
}

export function installRouteProgress(router: Router) {
  router.beforeEach((to, from) => {
    if (to.path !== from.path) pendingPath.value = to.path
  })
  router.afterEach(() => { pendingPath.value = null })
  router.onError((error, to) => {
    pendingPath.value = null
    // A stale deployment or dropped connection loses the chunk; a full load fetches the current one.
    if (isChunkLoadError(error) && navigator.onLine) window.location.assign(to.fullPath)
  })
}

export function prefetchWhenIdle(router: Router, paths: string[]) {
  const run = () => paths.forEach(path => prefetchRoute(router, path))
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(run, { timeout: 4000 })
  else window.setTimeout(run, 1500)
}
