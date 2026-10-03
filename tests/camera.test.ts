import test from 'node:test'
import assert from 'node:assert/strict'
import { hasCamera, cameraError } from '../src/services/camera.ts'

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
