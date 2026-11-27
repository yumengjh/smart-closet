import type * as DecartSdk from '@decartai/sdk'
import type { RealTimeClient } from '@decartai/sdk'

export type DecartCredential = { vendor: 'DECART'; token: string; model: string; maxSessionSeconds: number; expiresAtMs: number; tokenTtlSeconds: number }
export type DecartCallbacks = {
  hasFrame: () => boolean
  onRemote: (stream: MediaStream) => void
  onConnected: () => void
  onError: (error: Error) => void
  onCapacityWait: () => void
  onLimit: () => void
}

type Sdk = typeof DecartSdk
const unavailable = '高质量试穿启动失败，可以稍后重试或换成标准。'
const interrupted = '高质量试穿已中断，请重新开始。'
const busy = '高质量现在有点忙，稍后再试或换成标准'
const cancelled = '试穿已停止。'
const tokenActive = '连接还在建立中，请稍等几秒再试。'
const retryLimit = '这次高质量试穿连接失败次数太多，请结束后重新开始。'
class CredentialError extends Error {}

function safeError(cause: unknown, hasFrame = false): Error {
  if (cause instanceof CredentialError) return cause
  if (cause && typeof cause === 'object' && 'code' in cause) {
    if (cause.code === 'TRYON_TOKEN_ACTIVE') return new CredentialError(tokenActive)
    if (cause.code === 'TRYON_RETRY_LIMIT') return new CredentialError(retryLimit)
  }
  const value = cause as { message?: unknown; reason?: unknown; errorType?: unknown } | null
  const message = typeof value?.message === 'string' ? value.message.toLowerCase() : ''
  const reason = typeof value?.reason === 'string' ? value.reason.toLowerCase() : ''
  const isBusy = value?.errorType === 'capacity' || reason === 'session_limit' ||
    /concurrent session limit|session limit reached|try again later/.test(`${message} ${reason}`)
  return new Error(isBusy ? busy : hasFrame ? interrupted : unavailable)
}

async function loadSdk() {
  // Both RTC libraries are optional and must only load after a premium session is requested.
  const [sdk, livekit] = await Promise.all([import('@decartai/sdk'), import('livekit-client')])
  livekit.setLogLevel('silent')
  return sdk
}

export class DecartSession {
  private client: RealTimeClient | null = null
  private pending: Promise<RealTimeClient> | null = null
  private cancel: ((error?: Error) => void) | null = null
  private timer: number | undefined
  private generation = 0
  private sendingTrack?: MediaStreamTrack
  private callbacks?: DecartCallbacks

  private readonly injectedSdk?: Sdk

  constructor(injectedSdk?: Sdk) { this.injectedSdk = injectedSdk }

  setDeadline(deadlineAtMs: number) {
    const callbacks = this.callbacks
    if (!callbacks) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.stop()
      callbacks.onLimit()
    }, Math.max(0, deadlineAtMs - Date.now()))
  }

  private cloneForSending(preview: MediaStreamTrack) {
    const copy = preview.clone()
    this.sendingTrack?.stop()
    this.sendingTrack = copy
    return copy
  }

  async start(stream: MediaStream, credential: DecartCredential, prompt: string, image: string | Blob, callbacks: DecartCallbacks, capacityRetryBudgetMs: number, renew?: () => Promise<DecartCredential>): Promise<void> {
    this.stop()
    const generation = this.generation
    const active = () => this.generation === generation
    let cancel!: (error?: Error) => void
    const cancellation = new Promise<never>((_, reject) => { cancel = error => reject(error ?? new Error(cancelled)) })
    this.cancel = cancel
    this.callbacks = callbacks
    this.setDeadline(Date.now() + credential.maxSessionSeconds * 1000)

    const connect = async (): Promise<RealTimeClient> => {
      const sdk = this.injectedSdk ?? await loadSdk()
      if (!active()) throw new Error(cancelled)
      if (!sdk.isRealtimeModel(credential.model)) throw new Error(unavailable)
      let current = credential, renewed = false
      let renewal: Promise<DecartCredential> | undefined
      let reportedConnected = false, bufferedRefusals = 0
      const client = sdk.createDecartClient({
        apiKeyProvider: async () => {
          if (!active()) throw new Error(cancelled)
          if (Date.now() < current.expiresAtMs) return current.token
          try {
            if (!renewal) {
              if (renewed || !renew) throw new CredentialError(retryLimit)
              renewed = true
              renewal = renew()
            }
            const next = await renewal
            renewal = undefined
            if (!active()) throw new Error(cancelled)
            if (next.model !== credential.model || Date.now() >= next.expiresAtMs) throw new Error(unavailable)
            current = next
            this.setDeadline(Date.now() + next.maxSessionSeconds * 1000)
            return current.token
          } catch (cause) {
            const error = safeError(cause, callbacks.hasFrame())
            if (active()) {
              const connected = this.client !== null
              this.cancel?.(error)
              this.stop()
              if (connected) callbacks.onError(error)
            }
            throw error
          }
        },
        logger: sdk.noopLogger,
        telemetry: false,
      })
      const video = new MediaStream([this.cloneForSending(stream.getVideoTracks()[0]!)])
      const connected = await client.realtime.connect(video, {
        model: sdk.models.realtime(credential.model),
        initialState: { prompt: { text: prompt, enhance: false }, image },
        capacityRetryBudgetMs: Math.max(0, capacityRetryBudgetMs),
        onRemoteStream: remote => { if (active()) callbacks.onRemote(remote) },
        onConnectionChange: state => {
          if (!active()) return
          if (state === 'reconnecting' && callbacks.hasFrame()) {
            this.stop()
            callbacks.onError(new Error(interrupted))
          } else if (!reportedConnected && (state === 'connected' || state === 'generating')) {
            reportedConnected = true
            callbacks.onConnected()
          }
        },
        onCapacityWait: () => {
          if (!active()) return
          bufferedRefusals++
          callbacks.onCapacityWait()
        },
      })
      if (!active()) {
        connected.disconnect()
        throw new Error(cancelled)
      }
      // SDK 0.2.14 replays dial errors in order, before its buffered 'connected' event.
      // It keeps the server-error code but drops errorType when delivering the capacity refusal.
      connected.on('connectionChange', state => { if (state === 'connected') bufferedRefusals = 0 })
      connected.on('error', error => {
        if (!active()) return
        if (bufferedRefusals > 0 && error.code === 'WEBRTC_SERVER_ERROR') { bufferedRefusals--; return }
        callbacks.onError(safeError(error, callbacks.hasFrame()))
      })
      connected.on('sessionEnded', event => {
        if (!active()) return
        const error = safeError(event, callbacks.hasFrame())
        this.stop()
        callbacks.onError(error)
      })
      this.client = connected
      return connected
    }
    const pending = Promise.race([connect().catch(cause => { throw safeError(cause, callbacks.hasFrame()) }), cancellation])
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
    catch (error) { throw safeError(error, this.callbacks?.hasFrame()) }
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    const client = this.client ?? await this.pending
    if (!client || client !== this.client) throw new Error(cancelled)
    try { await client.replaceVideoTrack(this.cloneForSending(track)) }
    catch (cause) {
      const callbacks = this.callbacks, error = safeError(cause, callbacks?.hasFrame())
      if (this.client === client) { this.stop(); callbacks?.onError(error) }
      throw error
    }
  }

  stop(): void {
    this.generation++
    clearTimeout(this.timer)
    this.timer = undefined
    this.callbacks = undefined
    this.sendingTrack?.stop()
    this.sendingTrack = undefined
    const cancel = this.cancel
    this.cancel = null
    cancel?.()
    const client = this.client
    this.client = null
    this.pending = null
    client?.disconnect()
  }
}
