// 反馈的工作量证明（smart-closet-server docs/design/2026-11-23-用户反馈：匿名提交与后台处理设计.md 4.2 节）：
// 找一个十进制 nonce，使 SHA-256(token + ":" + nonce) 的前 difficulty 位为 0。用纯 JS 计算，不依赖 crypto.subtle
// （局域网 http 访问时不可用）；题目前缀里完整的 64 字节块只算一次，之后每个 nonce 只压缩剩下的一到两块。

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

function compress(state: Uint32Array, bytes: Uint8Array, offset: number, w: Uint32Array) {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4
    w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]
  }
  for (let i = 16; i < 64; i++) {
    const x = w[i - 15], y = w[i - 2]
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
  }
  let a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7]
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
  }
  state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0; state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0
  state[4] = (state[4] + e) | 0; state[5] = (state[5] + f) | 0; state[6] = (state[6] + g) | 0; state[7] = (state[7] + h) | 0
}

/** 哈希“固定前缀 + 变化的 ASCII 后缀”；返回 8 个 32 位字（大端）。后缀最多 20 个字符。 */
export function prefixHasher(prefix: string) {
  const pre = new TextEncoder().encode(prefix)
  const whole = pre.length - (pre.length % 64)
  const mid = new Uint32Array(IV), w = new Uint32Array(64)
  for (let offset = 0; offset < whole; offset += 64) compress(mid, pre, offset, w)
  const rest = pre.subarray(whole)
  const buffer = new Uint8Array(192), state = new Uint32Array(8)
  return (suffix: string): Uint32Array => {
    buffer.fill(0)
    buffer.set(rest)
    for (let i = 0; i < suffix.length; i++) buffer[rest.length + i] = suffix.charCodeAt(i) & 0xff
    const used = rest.length + suffix.length
    buffer[used] = 0x80
    const blocks = used + 9 <= 64 ? 1 : used + 9 <= 128 ? 2 : 3
    const bits = (pre.length + suffix.length) * 8, end = blocks * 64
    buffer[end - 4] = (bits >>> 24) & 0xff; buffer[end - 3] = (bits >>> 16) & 0xff; buffer[end - 2] = (bits >>> 8) & 0xff; buffer[end - 1] = bits & 0xff
    state.set(mid)
    for (let block = 0; block < blocks; block++) compress(state, buffer, block * 64, w)
    return state
  }
}

export function sha256Hex(text: string): string {
  return Array.from(prefixHasher(text)(''), word => (word >>> 0).toString(16).padStart(8, '0')).join('')
}

export function leadingZeroBits(state: Uint32Array): number {
  let bits = 0
  for (const word of state) {
    if (word === 0) { bits += 32; continue }
    return bits + Math.clz32(word)
  }
  return bits
}

/** 从 start 开始最多试 budget 个 nonce，找到就返回，否则返回 null（让调用方分段、可以中途停下）。 */
export function solve(token: string, difficulty: number, start = 0, budget = Number.MAX_SAFE_INTEGER): string | null {
  const hash = prefixHasher(token + ':')
  const stop = Math.min(start + budget, Number.MAX_SAFE_INTEGER)
  for (let nonce = start; nonce < stop; nonce++) {
    const value = String(nonce)
    if (leadingZeroBits(hash(value)) >= difficulty) return value
  }
  return null
}
