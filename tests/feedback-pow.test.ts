import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { leadingZeroBits, prefixHasher, sha256Hex, solve } from '../src/feedback/pow.ts'

const reference = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

test('SHA-256 与标准向量和 Node 实现一致（含跨块的前缀与中文）', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 200]) {
    const text = 'x'.repeat(length)
    assert.equal(sha256Hex(text), reference(text), `length ${length}`)
  }
  const token = 'v1.1763900000000.18.AbCdEfGhIjKlMnOpQrStUv.0123456789abcdef0123456789abcdef:'
  const hash = prefixHasher(token)
  for (const nonce of ['0', '7', '123456', '99999999999999999999']) {
    const hex = Array.from(hash(nonce), w => (w >>> 0).toString(16).padStart(8, '0')).join('')
    assert.equal(hex, reference(token + nonce))
  }
  assert.equal(sha256Hex('意见反馈'), reference('意见反馈'))
})

test('找到的 nonce 满足难度，服务端同样的算法能验证', () => {
  const token = 'v1.1763900000000.12.AbCdEfGhIjKlMnOpQrStUv.0123456789abcdef0123456789abcdef'
  const nonce = solve(token, 12)
  assert.ok(nonce)
  const digest = createHash('sha256').update(`${token}:${nonce}`).digest()
  let bits = 0
  for (const byte of digest) { if (byte === 0) { bits += 8; continue } bits += Math.clz32(byte) - 24; break }
  assert.ok(bits >= 12)
  assert.equal(solve(token, 12, 0, Number(nonce)), null, '预算内找不到时返回 null')
})

test('前导零位数', () => {
  assert.equal(leadingZeroBits(new Uint32Array([0, 0x80000000])), 32)
  assert.equal(leadingZeroBits(new Uint32Array([0x0000ffff])), 16)
  assert.equal(leadingZeroBits(new Uint32Array([0xffffffff])), 0)
})
