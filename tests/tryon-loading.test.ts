import test from 'node:test'
import assert from 'node:assert/strict'
import { targetSize, canKeepOriginal, hasTransparency, preferShrunk, formatBytes } from '../src/tryon/shrink.ts'
import { median, estimateDownlink, classify, describeProbe } from '../src/tryon/network.ts'

test('temporary garments shrink to a 1024 px long side and are never enlarged', () => {
  assert.deepEqual(targetSize(3024, 4032), { width: 768, height: 1024, scale: 1024 / 4032 })
  assert.equal(targetSize(4000, 1000).width, 1024)
  assert.deepEqual(targetSize(600, 800), { width: 600, height: 800, scale: 1 })
  assert.equal(targetSize(5000, 1).height, 1)
})
test('small JPEG or PNG is kept as is; HEIC or WebP is always re-encoded', () => {
  assert.ok(canKeepOriginal('image/jpeg', 1024, 700))
  assert.ok(!canKeepOriginal('image/jpeg', 1025, 700))
  assert.ok(!canKeepOriginal('image/heic', 800, 600))
  assert.ok(!canKeepOriginal('image/webp', 800, 600))
  assert.ok(preferShrunk('image/heic', 100, 200), 'the server only reads JPEG and PNG')
  assert.ok(!preferShrunk('image/png', 100, 200))
  assert.ok(preferShrunk('image/jpeg', 5_000_000, 200_000))
})
test('transparency is found in sampled RGBA bytes', () => {
  const opaque = new Uint8ClampedArray(4 * 100).fill(255)
  assert.ok(!hasTransparency(opaque, 7))
  const cut = opaque.slice(); cut[3 + 4 * 42] = 0
  assert.ok(hasTransparency(cut, 1))
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB'); assert.equal(formatBytes(300 * 1024), '300 KB')
})
test('round trip uses the median and ignores failed pings', () => {
  assert.equal(median([300, 80, 90]), 90)
  assert.equal(median([NaN, 120, 80]), 100)
  assert.equal(median([NaN, NaN]), null)
})
test('downlink is estimated from the fastest large network download only', () => {
  const entries = [
    { transferSize: 0, responseStart: 0, responseEnd: 10 },               // cached
    { transferSize: 10_000, responseStart: 0, responseEnd: 1 },           // too small
    { transferSize: 1_000_000, responseStart: 0, responseEnd: 8000 },     // 1 Mbps
    { transferSize: 250_000, responseStart: 100, responseEnd: 600 },      // 4 Mbps
  ]
  assert.equal(estimateDownlink(entries), 4)
  assert.equal(estimateDownlink([]), null)
})
test('levels: good, fair, poor, offline; unknown speed does not lower the level', () => {
  assert.equal(classify(120, null), 'good')
  assert.equal(classify(120, 1.5), 'fair')
  assert.equal(classify(600, 5), 'fair')
  assert.equal(classify(1200, 5), 'poor')
  assert.equal(classify(200, 0.3), 'poor')
  assert.equal(classify(null, 50), 'offline')
  assert.equal(describeProbe({ level: 'good', rttMs: 86.4, downlinkMbps: 12.3, at: 0 }), '往返 86 ms · 下行约 12 Mbps · 良好')
  assert.equal(describeProbe({ level: 'offline', rttMs: null, downlinkMbps: null, at: 0 }), '无法连接服务器')
})
