import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { getLogger, LoggerNames, setLogLevel } from 'livekit-client'
import type { DecartClientOptions, RealTimeClientConnectOptions } from '@decartai/sdk'

// Exercise both application adapters. Only the browser media and external SDK entry points are substituted.
const bundle = await build({
  entryPoints: ['src/tryon/camera.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  define: { 'import.meta.env.VITE_USE_MOCKS': '"false"', 'import.meta.env.VITE_API_BASE_URL': '""' },
  plugins: [{ name: 'media-sdk-boundaries', setup(build) {
    build.onResolve({ filter: /^(@xmaxai\/web-sdk|@decartai\/sdk)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    build.onResolve({ filter: /^livekit-client$/ }, () => ({ path: import.meta.resolve('livekit-client'), external: true }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === '@decartai/sdk' ? `
      export const models = { realtime: name => ({ name }) }, isRealtimeModel = () => true, noopLogger = {};
      export const createDecartClient = options => globalThis.premiumClient(options);
    ` : `
      export class XmaxClient { createRealtimeManager() { return globalThis.previewManager() } }
      export class XmaxConfiguration {} export class RealtimeConfiguration {}
      export const XmaxEnvironment = {}, RealtimeModel = {}, VideoContentMode = {}, CameraPosition = {}, RealtimeCameraPreset = {}, RealtimeConnectionState = {};
      export class XmaxRealtimeVideoView { constructor() { Object.assign(this, globalThis.previewView()) } attach() {} detach() {} }
    ` }))
  } }],
})
const { TryOnCamera } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))

class Track {
  kind = 'video'
  readyState = 'live'
  stop() { this.readyState = 'ended' }
  clone() { return new Track() }
}
class Stream {
  tracks: Track[]
  constructor(tracks: Track[]) { this.tracks = tracks }
  getVideoTracks() { return this.tracks }
  getAudioTracks() { return [] }
}
class Video extends EventTarget {
  srcObject: Stream | null = null
  muted = false
  readyState = 0
  videoWidth = 0
  videoHeight = 0
  async play() {}
  displayFrame() { this.readyState = 2; this.videoWidth = 640; this.videoHeight = 480; this.dispatchEvent(new Event('loadeddata')) }
}
Object.defineProperty(globalThis, 'MediaStream', { value: Stream, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { matchMedia: () => ({ matches: false }) }, configurable: true })
const image = new Blob(['one'], { type: 'image/png' })
const prepared = { id: 'p', revision: 1, items: [], referenceBlob: image }
const options = { vendor: 'DECART', credential: { vendor: 'DECART', token: 'temporary', model: 'lucy-vton-3.6', maxSessionSeconds: 30, expiresAtMs: Date.now() + 60_000, tokenTtlSeconds: 60 } }

function fixture(t: { after(fn: () => Promise<void>): void }) {
  const classes = new Set<string>(), classList = { add: (s: string) => classes.add(s), remove: (s: string) => classes.delete(s) }
  const local = { videoTrack: { mediaStreamTrack: new Track() } }
  const access = Promise.withResolvers<void>(), dialed = Promise.withResolvers<void>(), handshake = Promise.withResolvers<void>()
  const errors: Error[] = [], outgoing: Track[] = [], changes: { image: Blob }[] = []
  let mediaRequests = 0
  let frames = 0, disconnects = 0, delayedCamera = false, dialNotice = () => {}
  let dialOptions!: RealTimeClientConnectOptions, clientOptions!: DecartClientOptions
  let published: Track | undefined
  const connected = {
    on() {}, disconnect() { disconnects++; published?.stop() },
    async set(value: { image: Blob }) { changes.push(value) },
    async replaceVideoTrack(track: Track) { outgoing.push(track); published = track },
  }
  Object.assign(globalThis, {
    previewView: () => ({ element: { classList }, videoElement: new Video() }),
    previewManager: () => ({
      connectionManager: { dependencies: { sessionService: { apiService: { post() {} }, createSession() {}, heartbeatSession() {}, closeSession() {} }, streamController: { rtcManager: { configureVideoEncoding() {}, restoreCameraSender() {} } } } },
      setStateListener() {}, setTimingListener() {}, setNetworkQualityListener() {}, setUplinkVideoStatisticsListener() {}, setDownlinkVideoStatisticsListener() {}, setRemoteAudioVolume() {},
      async createLocalCameraStream() { mediaRequests++; if (delayedCamera) { dialed.resolve(); await access.promise } return local },
      async switchCamera() { local.videoTrack.mediaStreamTrack = new Track() }, async close() {}, async disconnect() {},
    }),
    premiumClient: (init: DecartClientOptions) => {
      clientOptions = init
      return { realtime: { async connect(stream: Stream, options: RealTimeClientConnectOptions) {
        dialOptions = options; published = stream.getVideoTracks()[0]; outgoing.push(published)
        assert.deepEqual(stream.getAudioTracks(), []); assert.ok(options.initialState?.prompt?.text); assert.equal(options.initialState?.image, image)
        dialNotice(); dialed.resolve(); await handshake.promise; return connected
      } } }
    },
  })
  const camera = new TryOnCamera({ classList }, () => { frames++ }, (error: Error) => errors.push(error))
  t.after(() => camera.dispose())
  return { camera, local, connected, errors, dialed, access, handshake, outgoing, changes, classes, get mediaRequests() { return mediaRequests },
    get frames() { return frames }, get disconnects() { return disconnects }, get options() { return dialOptions }, get client() { return clientOptions },
    delayCamera() { delayedCamera = true }, atDial(fn: () => void) { dialNotice = fn },
    start: (environment = 'china', renewCredential?: () => Promise<unknown>) => camera.start('lease', environment, prepared, { ...options, renewCredential }),
    remoteFrame() {
      const incoming = new Stream([new Track()]); dialOptions.onRemoteStream(incoming as unknown as MediaStream)
      assert.equal(frames, 0, 'attaching a stream does not prove a frame'); camera.video.displayFrame(); assert.equal(frames, 1)
      assert.equal(camera.video.srcObject, incoming); assert.equal(camera.video.muted, true)
    },
  }
}

test('cancelling a region change never starts a premium dial after stop', async t => {
  const f = fixture(t)
  await f.camera.open('china'); f.delayCamera()
  const start = f.start('global').catch(() => {})
  await f.dialed.promise
  const dialsBeforeCancel = f.outgoing.length
  await f.camera.stop(); f.access.resolve(); f.handshake.resolve(); await start
  assert.equal(f.outgoing.length, dialsBeforeCancel, 'a cancelled camera reopen must not acquire a premium lease')
  await assert.rejects(f.camera.change(prepared), /请先开始试穿/)
  assert.equal(f.mediaRequests, 1, 'premium reuses the live preview across regions')
})

test('cancelling during initial camera acquisition never starts a premium dial', async t => {
  const f = fixture(t); f.delayCamera()
  const start = f.start().catch(() => {})
  await f.dialed.promise; await f.camera.stop(); f.access.resolve(); f.handshake.resolve(); await start
  assert.equal(f.outgoing.length, 0)
})

test('ending or replacing a premium send track keeps the current preview live', async t => {
  const f = fixture(t); await f.camera.open()
  const start = f.start(); await f.dialed.promise; f.handshake.resolve(); await start
  f.options.onConnectionChange?.('connected'); f.remoteFrame()
  const firstPreview = f.local.videoTrack.mediaStreamTrack
  const nextImage = new Blob(['two']); await f.camera.change({ ...prepared, referenceBlob: nextImage })
  assert.equal(f.changes[0].image, nextImage)
  await f.camera.switchCamera(); const currentPreview = f.local.videoTrack.mediaStreamTrack
  assert.equal(f.outgoing[0].readyState, 'ended', 'the replaced sender must stop before the session ends')
  assert.equal(f.outgoing[1].readyState, 'live')
  await f.camera.stop()
  assert.equal(currentPreview.readyState, 'live', 'SDK disconnect stopped the local preview')
  assert.notEqual(f.outgoing[0], firstPreview); assert.notEqual(f.outgoing[1], currentPreview)
  assert.deepEqual(f.outgoing.map(t => t.readyState), ['ended', 'ended']); assert.equal(f.disconnects, 1)
  assert.equal(f.camera.video.srcObject, null); assert.equal(f.classes.has('has-result'), false)
  await f.start(); assert.equal(f.outgoing.length, 3); assert.equal(f.outgoing[2].readyState, 'live')
  await f.camera.dispose(); assert.equal(f.outgoing[2].readyState, 'ended')
})

test('a failed camera flip releases both send tracks without stopping the new preview', async t => {
  const f = fixture(t); await f.camera.open()
  const start = f.start(); await f.dialed.promise; f.handshake.resolve(); await start
  f.remoteFrame()
  f.connected.replaceVideoTrack = async track => { f.outgoing.push(track); throw new Error('replace failed') }
  await assert.rejects(f.camera.switchCamera(), /已中断/)
  assert.deepEqual(f.outgoing.map(track => track.readyState), ['ended', 'ended'])
  assert.equal(f.local.videoTrack.mediaStreamTrack.readyState, 'live')
  assert.equal(f.disconnects, 1); assert.equal(f.errors.length, 1)
})

test('cancellation stops the publish track while the SDK handshake is still pending', async t => {
  const f = fixture(t); await f.camera.open()
  const start = f.start(); await f.dialed.promise; const rejected = assert.rejects(start, /试穿已停止/)
  await f.camera.stop(); await rejected
  assert.equal(f.outgoing[0].readyState, 'ended', 'a late handshake could still publish a camera frame')
  assert.equal(f.local.videoTrack.mediaStreamTrack.readyState, 'live'); assert.equal(f.disconnects, 0)
  f.handshake.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.disconnects, 1)
})

test('a rejected handshake releases the publish track and preserves preview', async t => {
  const f = fixture(t); await f.camera.open()
  const start = f.start(); await f.dialed.promise; f.handshake.reject(new Error('failed dial'))
  await assert.rejects(start); assert.equal(f.outgoing[0].readyState, 'ended'); assert.equal(f.local.videoTrack.mediaStreamTrack.readyState, 'live')
})

test('reconnecting after a decoded frame closes the session and disables token requests', async t => {
  const f = fixture(t); await f.camera.open(); let renewals = 0
  const start = f.start('china', async () => { renewals++; return options.credential })
  await f.dialed.promise; f.handshake.resolve(); await start
  f.options.onConnectionChange?.('connected'); f.remoteFrame(); f.options.onConnectionChange?.('reconnecting')
  assert.equal(f.disconnects, 1, 'reconnecting left the framed session connected')
  assert.equal(f.errors.length, 1); assert.doesNotMatch(f.errors[0].message, /启动失败|未计时/)
  await assert.rejects(Promise.resolve(f.client.apiKeyProvider!()), /试穿已停止/); assert.equal(renewals, 0)
  assert.equal(f.outgoing[0].readyState, 'ended')
})

test('late generating status cannot regress a rendered frame to waiting', async t => {
  const f = fixture(t); await f.camera.open()
  const start = f.start(); await f.dialed.promise; f.handshake.resolve(); await start
  f.remoteFrame(); f.options.onConnectionChange?.('generating')
  assert.equal(f.camera.diagnostic.stage, 'GENERATING')
})

test('the LiveKit signal logger is silent before the premium dial', async t => {
  const messages: unknown[] = []; t.mock.method(console, 'info', (...args: unknown[]) => messages.push(...args))
  setLogLevel('info'); t.after(() => setLogLevel('info'))
  const logger = getLogger(LoggerNames.Signal), marker = 'wss://media.example.invalid/'
  logger.info(marker); assert.ok(messages.includes(marker)); messages.length = 0
  const f = fixture(t); f.atDial(() => logger.info(marker)); await f.camera.open()
  const start = f.start(); await f.dialed.promise; f.handshake.resolve(); await start
  assert.deepEqual(messages, [])
})
