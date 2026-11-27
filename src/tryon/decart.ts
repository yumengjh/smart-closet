import type * as DecartSdk from '@decartai/sdk'
import type { RealTimeClient } from '@decartai/sdk'

export type DecartCredential = { vendor: 'DECART'; token: string; model: string; maxSessionSeconds: number; expiresAtMs: number; tokenTtlSeconds: number }
export type DecartCallbacks = {
  onRemote: (stream: MediaStream) => void
  onConnected: () => void
  onError: (error: Error) => void
  onCapacityWait: () => void
  onLimit: () => void
}

type Sdk = typeof DecartSdk
const unavailable = '高质量试穿启动失败，本次未计时，可以稍后重试或换成标准。'
const busy = '高质量现在有点忙，稍后再试或换成标准'
const cancelled = '试穿已停止。'

function safeError(cause: unknown): Error {
  const value = cause as { message?: unknown; reason?: unknown; errorType?: unknown } | null
  const message = typeof value?.message === 'string' ? value.message.toLowerCase() : ''
  const reason = typeof value?.reason === 'string' ? value.reason.toLowerCase() : ''
  const isBusy = value?.errorType === 'capacity' || reason === 'session_limit' ||
    /concurrent session limit|session limit reached|try again later/.test(`${message} ${reason}`)
  return new Error(isBusy ? busy : unavailable)
}

export class DecartSession {
  private client: RealTimeClient | null = null
  private pending: Promise<RealTimeClient> | null = null
  private cancel: (() => void) | null = null
  private timer: number | undefined
  private generation = 0

  private readonly injectedSdk?: Sdk

  constructor(injectedSdk?: Sdk) { this.injectedSdk = injectedSdk }

  async start(stream: MediaStream, credential: DecartCredential, prompt: string, image: string | Blob, callbacks: DecartCallbacks, capacityRetryBudgetMs: number): Promise<void> {
    this.stop()
    const generation = this.generation
    const active = () => this.generation === generation
    let cancel!: () => void
    const cancellation = new Promise<never>((_, reject) => { cancel = () => reject(new Error(cancelled)) })
    this.cancel = cancel
    this.timer = setTimeout(() => {
      if (!active()) return
      this.stop()
      callbacks.onLimit()
    }, credential.maxSessionSeconds * 1000)

    const connect = async (): Promise<RealTimeClient> => {
      // Load the SDK only for high-quality sessions.
      const sdk = this.injectedSdk ?? await import('@decartai/sdk')
      if (!active()) throw new Error(cancelled)
      if (!sdk.isRealtimeModel(credential.model)) throw new Error(unavailable)
      const client = sdk.createDecartClient({
        apiKeyProvider: () => {
          if (!active() || Date.now() >= credential.expiresAtMs) throw new Error(unavailable)
          return credential.token
        },
        logger: sdk.noopLogger,
        telemetry: false,
      })
      const video = new MediaStream(stream.getVideoTracks())
      const connected = await client.realtime.connect(video, {
        model: sdk.models.realtime(credential.model),
        initialState: { prompt: { text: prompt, enhance: false }, image },
        capacityRetryBudgetMs: Math.max(0, capacityRetryBudgetMs),
        onRemoteStream: remote => { if (active()) callbacks.onRemote(remote) },
        onConnectionChange: state => { if (active() && (state === 'connected' || state === 'generating')) callbacks.onConnected() },
        onCapacityWait: () => { if (active()) callbacks.onCapacityWait() },
      })
      if (!active()) {
        connected.disconnect()
        throw new Error(cancelled)
      }
      connected.on('error', error => { if (active()) callbacks.onError(safeError(error)) })
      connected.on('sessionEnded', event => {
        if (!active()) return
        const error = safeError(event)
        this.stop()
        callbacks.onError(error)
      })
      this.client = connected
      return connected
    }
    const pending = Promise.race([connect().catch(cause => { throw safeError(cause) }), cancellation])
    this.pending = pending
    try {
      await pending
    } catch (error) {
      if (active()) this.stop()
      throw error
    } finally {
      if (this.pending === pending) this.pending = null
      if (this.cancel === cancel) this.cancel = null
    }
  }

  async change(prompt: string, image: string | Blob): Promise<void> {
    const client = this.client ?? await this.pending
    if (!client || client !== this.client) throw new Error(cancelled)
    try { await client.set({ prompt, image, enhance: false }) }
    catch (error) { throw safeError(error) }
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    const client = this.client ?? await this.pending
    if (!client || client !== this.client) throw new Error(cancelled)
    try { await client.replaceVideoTrack(track) }
    catch (error) { throw safeError(error) }
  }

  stop(): void {
    this.generation++
    clearTimeout(this.timer)
    this.timer = undefined
    const cancel = this.cancel
    this.cancel = null
    cancel?.()
    const client = this.client
    this.client = null
    this.pending = null
    client?.disconnect()
  }
}
