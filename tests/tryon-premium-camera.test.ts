import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['src/tryon/camera.ts'], bundle: true, format: 'esm', platform: 'node', write: false, external: ['@xmaxai/web-sdk', '@decartai/sdk'], define: { 'import.meta.env.VITE_USE_MOCKS': '"false"', 'import.meta.env.VITE_API_BASE_URL': '""' } })
// The runtime bundle supplies test environment values and leaves real SDKs external.
const { TryOnCamera } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))

class FakeStream {
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  private tracks: { kind: string; readyState: string }[]
  constructor(tracks: { kind: string; readyState: string }[]) { this.tracks = tracks }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
}
Object.defineProperty(globalThis, 'MediaStream', { value: FakeStream, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { matchMedia: () => ({ matches: false }) }, configurable: true })

test('高质量会话只发送视频轨道，实际输出首帧后上报，并可换图及停止', async () => {
  const track = { kind: 'video', readyState: 'live' }, incoming = new FakeStream([track])
  const video = { srcObject: null as unknown, muted: false, readyState: 2, videoWidth: 640, videoHeight: 480, play: async () => {}, addEventListener() {}, removeEventListener() {} }
  const attrs = new Set<string>(); const host = { classList: { add: (v: string) => attrs.add(v), remove: (v: string) => attrs.delete(v) } }
  let frames = 0, calls = 0, stopped = 0, oldDisconnect = 0
  let updated: { prompt: string; image: Blob } | undefined
  const premium = {
    async start(stream: FakeStream, _credential: unknown, prompt: string, image: Blob, callbacks: { onConnected: () => void; onRemote: (stream: FakeStream) => void }) {
      calls++; assert.deepEqual(stream.getVideoTracks(), [track]); assert.deepEqual(stream.getAudioTracks(), []); assert.ok(prompt); assert.ok(image instanceof Blob)
      callbacks.onConnected(); callbacks.onRemote(incoming)
    },
    async change(prompt: string, image: Blob) { updated = { prompt, image } },
    stop() { stopped++ },
    async replaceVideoTrack() {},
  }
  const camera = new TryOnCamera(host, () => { frames++ }, () => assert.fail('unexpected failure'), () => {}, () => premium)
  camera.manager = { disconnect: async () => { oldDisconnect++ } }
  camera.local = { videoTrack: { mediaStreamTrack: track } }
  camera.remoteView = { videoElement: video, track: undefined }
  const image = new Blob(['one'], { type: 'image/png' })
  const prepared = { id: 'p', revision: 1, items: [], referenceBlob: image }
  await camera.start('lease', 'china', prepared, { vendor: 'DECART', credential: { vendor: 'DECART', token: 'temporary', model: 'lucy-vton-3.6', maxSessionSeconds: 30, expiresAtMs: Date.now() + 60000, tokenTtlSeconds: 60 } })
  assert.equal(calls, 1); assert.equal(frames, 1); assert.equal(camera.diagnostic.stage, 'GENERATING'); assert.equal(video.srcObject, incoming); assert.equal(video.muted, true)
  const nextImage = new Blob(['two'])
  await camera.change({ ...prepared, referenceBlob: nextImage })
  assert.equal(updated?.image, nextImage)
  await camera.stop()
  assert.equal(stopped, 1); assert.equal(oldDisconnect, 0); assert.equal(video.srcObject, null); assert.equal(attrs.has('has-result'), false)
})
