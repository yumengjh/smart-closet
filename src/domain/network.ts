/**
 * A request that got no response at all (TypeError from fetch). Safari reports it as "Load failed" and logs the
 * cross-origin request as an access-control (CORS) error; Chrome says "Failed to fetch". It happens when an iPhone
 * app or tab goes to the background, the network switches, or a connection drops mid-request, and is not a
 * server answer, so it gets a clear message instead of the browser's wording.
 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('网络连接中断，请检查网络后重试。')
    this.name = 'NetworkError'
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause
  }
}

/** True for fetch's own "no response" failures; an abort the caller asked for is not one of them. */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && !(error as { name?: string }).name?.includes('Abort')
}

type Options = {
  fetch?: typeof fetch
  /** Waits before a retry; the default also waits until the page is visible again. */
  wait?: (ms: number) => Promise<void>
  /** Delays before each retry; reads (GET/HEAD) only, a write could otherwise be applied twice. */
  retryDelays?: number[]
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const go = () => setTimeout(resolve, ms)
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return go()
    const onVisible = () => { if (document.visibilityState !== 'hidden') { document.removeEventListener('visibilitychange', onVisible); go() } }
    document.addEventListener('visibilitychange', onVisible)
  })
}

/** fetch that retries reads after a dropped connection and turns a final failure into NetworkError. */
export async function fetchWithRetry(url: string, init: RequestInit = {}, options: Options = {}): Promise<Response> {
  const run = options.fetch ?? fetch
  const wait = options.wait ?? defaultWait
  const method = (init.method || 'GET').toUpperCase()
  const delays = ['GET', 'HEAD'].includes(method) ? (options.retryDelays ?? [400, 1500]) : []
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(url, init)
    } catch (error) {
      if (!isNetworkFailure(error) || init.signal?.aborted) throw error
      if (attempt >= delays.length) throw new NetworkError(error)
      await wait(delays[attempt])
    }
  }
}
