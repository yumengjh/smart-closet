import test from 'node:test'
import assert from 'node:assert/strict'
import type * as DecartSdk from '@decartai/sdk'
import type { DecartClientOptions, RealTimeClientConnectOptions } from '@decartai/sdk'
import { DecartSession } from '../src/tryon/decart.ts'

const secret = 'private-token-value'
const credential = { vendor: 'DECART' as const, token: secret, model: 'lucy-vton-3.6', maxSessionSeconds: 60, expiresAtMs: Date.now() + 60_000, tokenTtlSeconds: 60 }
const busy = '高质量现在有点忙，稍后再试或换成标准'
const unavailable = '高质量试穿启动失败，本次未计时，可以稍后重试或换成标准。'

class FakeStream {
  tracks: MediaStreamTrack[]
  constructor(tracks: MediaStreamTrack[] = []) { this.tracks = tracks }
  getTracks() { return this.tracks }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
}
Object.defineProperty(globalThis, 'MediaStream', { value: FakeStream, configurable: true })
const video = { kind: 'video' } as MediaStreamTrack
const audio = { kind: 'audio' } as MediaStreamTrack
const source = new FakeStream([video, audio]) as unknown as MediaStream

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture() {
  const listeners: Record<string, (event: unknown) => void> = {}
  const calls = { disconnect: 0, sets: [] as unknown[], tracks: [] as MediaStreamTrack[], connected: 0, remote: 0, waiting: 0, limit: 0, errors: [] as Error[] }
  const connected = {
    disconnect: () => { calls.disconnect++ },
    on: (event: string, listener: (event: unknown) => void) => { listeners[event] = listener },
    set: async (state: unknown) => { calls.sets.push(state) },
    replaceVideoTrack: async (track: MediaStreamTrack) => { calls.tracks.push(track) },
  }
  const dial = deferred<typeof connected>()
  let payload: { stream: MediaStream; options: RealTimeClientConnectOptions } | undefined
  let clientOptions: DecartClientOptions | undefined
  const sdk = {
    isRealtimeModel: (model: string) => model === credential.model,
    models: { realtime: (model: string) => ({ name: model }) },
    noopLogger: { debug() {}, info() {}, warn() {}, error() {} },
    createDecartClient: (options: DecartClientOptions) => {
      clientOptions = options
      return { realtime: { connect: (stream: MediaStream, options: RealTimeClientConnectOptions) => { payload = { stream, options }; return dial.promise } } }
    },
  } as unknown as typeof DecartSdk
  const callbacks = {
    onRemote: () => { calls.remote++ },
    onConnected: () => { calls.connected++ },
    onCapacityWait: () => { calls.waiting++ },
    onLimit: () => { calls.limit++ },
    onError: (error: Error) => { calls.errors.push(error) },
  }
  return { session: new DecartSession(sdk), dial, connected, calls, callbacks, listeners, payload: () => payload!, clientOptions: () => clientOptions! }
}

test('connect sends video only and complete initial state, then changes without reconnecting', async () => {
  const f = fixture()
  const firstImage = new Blob(['first'], { type: 'image/png' }), secondImage = new Blob(['second'], { type: 'image/jpeg' })
  const start = f.session.start(source, credential, 'first', firstImage, f.callbacks, 12_000)
  const { stream, options } = f.payload()
  assert.deepEqual(stream.getTracks(), [video])
  assert.deepEqual(options.model, { name: credential.model })
  assert.deepEqual(options.initialState, { prompt: { text: 'first', enhance: false }, image: firstImage })
  assert.equal(options.capacityRetryBudgetMs, 12_000)
  assert.equal(options.speed, undefined)
  assert.equal(f.clientOptions().apiKey, undefined)
  assert.equal(f.clientOptions().telemetry, false)
  assert.equal(f.clientOptions().apiKeyProvider!(), secret)
  options.onConnectionChange?.('connected')
  options.onConnectionChange?.('generating')
  options.onRemoteStream(stream)
  options.onCapacityWait?.({ retryAfterMs: 1000, attempt: 1 })
  assert.deepEqual([f.calls.connected, f.calls.remote, f.calls.waiting], [2, 1, 1])
  const changing = f.session.change('second', secondImage)
  f.dial.resolve(f.connected)
  await start
  await changing
  assert.deepEqual(f.calls.sets, [{ prompt: 'second', image: secondImage, enhance: false }])
  await f.session.replaceVideoTrack(video)
  assert.deepEqual(f.calls.tracks, [video])
  f.session.stop()
  assert.equal(f.calls.disconnect, 1)
})

test('stop cancels pending operations and disconnects a late connection without callbacks', async () => {
  const f = fixture()
  const start = f.session.start(source, credential, 'first', 'image', f.callbacks, 60_000)
  const changing = f.session.change('second', 'image')
  f.session.stop()
  await assert.rejects(start, /试穿已停止/)
  await assert.rejects(changing, /试穿已停止/)
  assert.throws(() => f.clientOptions().apiKeyProvider!(), { message: unavailable })
  f.payload().options.onRemoteStream(source)
  f.payload().options.onConnectionChange?.('connected')
  f.payload().options.onCapacityWait?.({ retryAfterMs: 1000, attempt: 1 })
  f.dial.resolve(f.connected)
  await Promise.resolve()
  assert.equal(f.calls.disconnect, 1)
  assert.deepEqual([f.calls.remote, f.calls.connected, f.calls.waiting], [0, 0, 0])
})

test('session limit timer stops even when connect is pending', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const start = f.session.start(source, { ...credential, maxSessionSeconds: 0 }, 'first', 'image', f.callbacks, 60_000)
  t.mock.timers.tick(0)
  await assert.rejects(start, /试穿已停止/)
  assert.equal(f.calls.limit, 1)
  f.dial.resolve(f.connected)
  await Promise.resolve()
  assert.equal(f.calls.disconnect, 1)
})

test('expired credentials cannot be used for a later dial', async () => {
  const f = fixture()
  const start = f.session.start(source, { ...credential, expiresAtMs: Date.now() - 1 }, 'first', 'image', f.callbacks, 60_000)
  assert.throws(() => f.clientOptions().apiKeyProvider!(), { message: unavailable })
  f.session.stop()
  await assert.rejects(start, /试穿已停止/)
  f.dial.reject(new Error('cancelled'))
})

test('session limit disconnects a connected client once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const start = f.session.start(source, { ...credential, maxSessionSeconds: 1 }, 'first', 'image', f.callbacks, 60_000)
  f.dial.resolve(f.connected)
  await start
  t.mock.timers.tick(1000)
  assert.equal(f.calls.disconnect, 1)
  assert.equal(f.calls.limit, 1)
  f.session.stop()
  assert.equal(f.calls.disconnect, 1)
})

test('1013 session limit and exhausted capacity both use the busy message', async () => {
  for (const error of [new Error('Concurrent session limit reached.'), new Error('WebSocket closed: 1013 Try Again Later')]) {
    const f = fixture()
    const start = f.session.start(source, credential, 'first', 'image', f.callbacks, 60_000)
    f.dial.reject(error)
    await assert.rejects(start, { message: busy })
  }
  const f = fixture()
  const start = f.session.start(source, credential, 'first', 'image', f.callbacks, 60_000)
  f.dial.resolve(f.connected)
  await start
  f.listeners.sessionEnded({ reason: 'session_limit' })
  assert.equal(f.calls.errors[0].message, busy)
  assert.equal(f.calls.disconnect, 1)
})

test('SDK failures are sanitized for connect, events and set', async () => {
  const f = fixture()
  const start = f.session.start(source, credential, 'first', 'image', f.callbacks, 60_000)
  f.dial.resolve(f.connected)
  await start
  f.listeners.error({ message: `failed with ${secret}` })
  assert.equal(f.calls.errors[0].message, unavailable)
  f.connected.set = async () => { throw new Error(`failed with ${secret}`) }
  await assert.rejects(f.session.change('second', 'image'), { message: unavailable })
  f.session.stop()
  const failed = fixture()
  const failedStart = failed.session.start(source, credential, 'first', 'image', failed.callbacks, 60_000)
  failed.dial.reject(new Error(`failed with ${secret}`))
  await assert.rejects(failedStart, { message: unavailable })
})
