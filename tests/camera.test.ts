import test from 'node:test'
import assert from 'node:assert/strict'
import { hasCamera, cameraError, prefersNativeCamera } from '../src/services/camera.ts'

test('camera detection never starts a stream and requires a video input', async () => {
  assert.equal(await hasCamera(), false)
  assert.equal(await hasCamera({ enumerateDevices: async () => [{ kind: 'audioinput' }] as MediaDeviceInfo[] }), false)
  assert.equal(await hasCamera({ enumerateDevices: async () => [{ kind: 'videoinput' }] as MediaDeviceInfo[] }), true)
  assert.equal(await hasCamera({ enumerateDevices: async () => { throw new Error('blocked') } }), false)
})
test('camera errors explain recovery without losing the upload option', () => {
  for (const name of ['NotAllowedError', 'SecurityError', 'NotFoundError', 'NotReadableError', 'AbortError']) {
    const error = new Error(); error.name = name
    assert.match(cameraError(error), /相册/)
  }
  const error = new Error(); error.name = 'NotReadableError'
  assert.match(cameraError(error), /占用/)
})

test('phones and touch iPads use native capture independently of mediaDevices', () => {
  assert.equal(prefersNativeCamera('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), true)
  assert.equal(prefersNativeCamera('Mozilla/5.0 (Linux; Android 15)', 5), true)
  assert.equal(prefersNativeCamera('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5), true)
  assert.equal(prefersNativeCamera('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0), false)
})
