import test from 'node:test'
import assert from 'node:assert/strict'
import type * as DecartSdk from '@decartai/sdk'
import type { DecartClientOptions, RealTimeClientConnectOptions } from '@decartai/sdk'
import { DecartSession } from '../src/tryon/decart.ts'

const secret = 'private-token-value'
const credential = { vendor: 'DECART' as const, token: secret, model: 'lucy-vton-3.6', maxSessionSeconds: 60, expiresAtMs: Date.now() + 60_000, tokenTtlSeconds: 60 }
const busy = '高质量现在有点忙，稍后再试或换成标准'
const unavailable = '高质量试穿启动失败，可以稍后重试或换成标准。'
const interrupted = '高质量试穿已中断，请重新开始。'

class FakeStream {
  tracks: MediaStreamTrack[]
  constructor(tracks: MediaStreamTrack[] = []) { this.tracks = tracks }
  getTracks() { return this.tracks }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
}
Object.defineProperty(globalThis, 'MediaStream', { value: FakeStream, configurable: true })
class VideoTrack {
  kind = 'video'
  readyState = 'live'
  clone() { return new VideoTrack() }
  stop() { this.readyState = 'ended' }
}
const video = new VideoTrack() as unknown as MediaStreamTrack
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
    hasFrame: () => false,
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
  assert.equal(stream.getTracks().length, 1); assert.notEqual(stream.getVideoTracks()[0], video)
  assert.deepEqual(options.model, { name: credential.model })
  assert.deepEqual(options.initialState, { prompt: { text: 'first', enhance: false }, image: firstImage })
  assert.equal(options.capacityRetryBudgetMs, 12_000)
  assert.equal(options.speed, undefined)
  assert.equal(f.clientOptions().apiKey, undefined)
  assert.equal(f.clientOptions().telemetry, false)
  assert.equal(await f.clientOptions().apiKeyProvider!(), secret)
  options.onConnectionChange?.('connected')
  options.onConnectionChange?.('generating')
  options.onRemoteStream(stream)
  options.onCapacityWait?.({ retryAfterMs: 1000, attempt: 1 })
  assert.deepEqual([f.calls.connected, f.calls.remote, f.calls.waiting], [1, 1, 1])
  const changing = f.session.change('second', secondImage)
  f.dial.resolve(f.connected)
  await start
  await changing
  assert.deepEqual(f.calls.sets, [{ prompt: 'second', image: secondImage, enhance: false }])
  await f.session.replaceVideoTrack(video)
  assert.equal(f.calls.tracks.length, 1); assert.notEqual(f.calls.tracks[0], video)
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
  await assert.rejects(Promise.resolve(f.clientOptions().apiKeyProvider!()), /试穿已停止/)
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

test('expired credentials without renewal stop the pending connection', async () => {
  const f = fixture()
  const start = f.session.start(source, { ...credential, expiresAtMs: Date.now() - 1 }, 'first', 'image', f.callbacks, 60_000)
  const stopped = assert.rejects(start, /连接失败次数太多/)
  await assert.rejects(Promise.resolve(f.clientOptions().apiKeyProvider!()), /连接失败次数太多/)
  await stopped
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

test('a replayed capacity refusal after a successful redial leaves the session running', async t => {
  const f = fixture(); t.after(() => f.session.stop())
  const start = f.session.start(source, credential, 'first', 'image', f.callbacks, 60_000)
  f.payload().options.onCapacityWait?.({ retryAfterMs: 500, attempt: 1 })
  f.payload().options.onConnectionChange?.('connected'); f.dial.resolve(f.connected); await start
  // The SDK buffers pre-connect events in delivery order and strips errorType from WEBRTC_SERVER_ERROR.
  const refusal = { code: 'WEBRTC_SERVER_ERROR', message: 'All slots occupied' }
  f.listeners.error(refusal)
  assert.deepEqual(f.calls.errors, [], 'the recovered dial was reported as a current failure')
  f.listeners.connectionChange('connected')
  await f.session.change('second', 'next-image'); assert.equal(f.calls.sets.length, 1)
  f.listeners.error({ code: 'WEBRTC_SERVER_ERROR', message: 'Current connection failed' }); assert.equal(f.calls.errors.length, 1)
  f.listeners.sessionEnded({ reason: 'session_limit' }); assert.equal(f.calls.disconnect, 1)
  assert.equal(f.calls.errors.at(-1)?.message, busy)
})

test('SDK failures are sanitized for connect, events and set', async t => {
  const f = fixture(); t.after(() => f.session.stop())
  const start = f.session.start(source, credential, 'first', 'image', f.callbacks, 60_000)
  f.dial.resolve(f.connected)
  await start
  f.callbacks.hasFrame = () => true
  f.listeners.error({ message: `failed with ${secret}` })
  assert.equal(f.calls.errors[0].message, interrupted)
  f.connected.set = async () => { throw new Error(`failed with ${secret}`) }
  await assert.rejects(f.session.change('second', 'image'), { message: interrupted })
  f.session.stop()
  const failed = fixture()
  const failedStart = failed.session.start(source, credential, 'first', 'image', failed.callbacks, 60_000)
  failed.dial.reject(new Error(`failed with ${secret}`))
  await assert.rejects(failedStart, { message: unavailable })
})

test('reuses valid token and renews at most once after expiry', async t => {
  let now = Date.now(), calls = 0
  t.mock.method(Date, 'now', () => now)
  const f = fixture(), renewal = deferred<typeof credential>()
  const start = f.session.start(source, { ...credential, expiresAtMs: now + 15_000 }, 'first', 'image', f.callbacks, 60_000, () => { calls++; return renewal.promise })
  f.dial.resolve(f.connected)
  await start
  const provider = f.clientOptions().apiKeyProvider!
  assert.equal(await provider(), secret)
  assert.equal(await provider(), secret)
  assert.equal(calls, 0)
  now += 15_001
  const first = provider(), second = provider()
  assert.equal(calls, 1)
  renewal.resolve({ ...credential, token: 'renewed', expiresAtMs: now + 15_000 })
  assert.deepEqual(await Promise.all([first, second]), ['renewed', 'renewed'])
  now += 15_001
  await assert.rejects(Promise.resolve(provider()), /连接失败次数太多/)
  assert.equal(calls, 1)
  assert.equal(f.calls.disconnect, 1)
  assert.match(f.calls.errors[0].message, /连接失败次数太多/)
})

test('renewal refreshes the local cap until the server reports its generation deadline', async t => {
  const now = 100_000
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now })
  const f = fixture(); t.after(() => f.session.stop())
  const first = { ...credential, maxSessionSeconds: 30, expiresAtMs: now + 15_000 }
  const start = f.session.start(source, first, 'first', 'image', f.callbacks, 60_000,
    async () => ({ ...first, token: 'renewed', expiresAtMs: Date.now() + 15_000 }))
  t.mock.timers.tick(16_000); assert.equal(await f.clientOptions().apiKeyProvider!(), 'renewed')
  f.dial.resolve(f.connected); await start
  t.mock.timers.tick(14_001); assert.equal(f.calls.limit, 0, 'first token still controlled the local deadline')
  // The server stamped issuance earlier than the browser received the renewed token.
  const serverDeadline = now + 45_600
  f.session.setDeadline(serverDeadline)
  t.mock.timers.tick(serverDeadline - Date.now() - 1); assert.equal(f.calls.limit, 0)
  t.mock.timers.tick(1); assert.equal(f.calls.limit, 1); assert.equal(f.calls.disconnect, 1)
})

test('token rejection ends the connection and preserves the server-specific message', async t => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  for (const [code, text] of [['TRYON_TOKEN_ACTIVE', '连接还在建立中，请稍等几秒再试。'], ['TRYON_RETRY_LIMIT', '这次高质量试穿连接失败次数太多，请结束后重新开始。']]) {
    const f = fixture()
    let requests = 0
    const start = f.session.start(source, { ...credential, expiresAtMs: now + 15_000 }, 'first', 'image', f.callbacks, 60_000, async () => { requests++; throw { code, message: secret } })
    f.dial.resolve(f.connected)
    await start
    now += 15_001
    await assert.rejects(Promise.resolve(f.clientOptions().apiKeyProvider!()), { message: text })
    await assert.rejects(Promise.resolve(f.clientOptions().apiKeyProvider!()), /试穿已停止/)
    assert.equal(requests, 1)
    assert.equal(f.calls.disconnect, 1)
    assert.equal(f.calls.errors[0].message, text)
  }
})

test('a renewal that resolves after stopping never releases a token', async () => {
  const f = fixture(), renewal = deferred<typeof credential>()
  const start = f.session.start(source, { ...credential, expiresAtMs: Date.now() - 1 }, 'first', 'image', f.callbacks, 60_000, () => renewal.promise)
  const dial = Promise.resolve(f.clientOptions().apiKeyProvider!())
  const stopped = assert.rejects(start, /试穿已停止/)
  f.session.stop()
  renewal.resolve({ ...credential, token: 'late-token', expiresAtMs: Date.now() + 15_000 })
  await assert.rejects(dial)
  await stopped
  f.dial.resolve(f.connected)
})
