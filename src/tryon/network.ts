/**
 * 本机网络检查（smart-closet-server docs/design/2026-11-06-实时试穿加载提速与网络提示设计.md §3.5）。
 * 只在本页显示，不上传、不写进连接诊断。往返延迟测匿名的 GET /api/health（固定返回、不查库）。
 */
export type NetworkLevel = 'good' | 'fair' | 'poor' | 'offline'
export type NetworkProbe = { level: NetworkLevel; rttMs: number | null; downlinkMbps: number | null; at: number }
export const networkLabel: Record<NetworkLevel, string> = { good: '良好', fair: '一般', poor: '较差', offline: '无法连接服务器' }

export function median(values: number[]) {
  const sorted = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

type TimingLike = { transferSize?: number; responseStart: number; responseEnd: number }
/** 用本页最近下载的较大资源估算下行速度（Mbps）：只看实际走网络（transferSize ≥ 50 KB）且耗时可测的条目，取最快的一次。 */
export function estimateDownlink(entries: TimingLike[], minBytes = 50 * 1024) {
  let best: number | null = null
  for (const entry of entries) {
    const bytes = entry.transferSize ?? 0, ms = entry.responseEnd - entry.responseStart
    if (bytes < minBytes || !(ms > 5)) continue
    const mbps = (bytes * 8) / (ms / 1000) / 1_000_000
    if (best === null || mbps > best) best = mbps
  }
  return best
}

/** 分档：≤300 ms 且 ≥2 Mbps（或未知）良好；≤800 ms 且 ≥0.8 Mbps（或未知）一般；否则较差；测不到延迟视为连不上。 */
export function classify(rttMs: number | null, downlinkMbps: number | null): NetworkLevel {
  if (rttMs === null) return 'offline'
  const speedOk = (min: number) => downlinkMbps === null || downlinkMbps >= min
  if (rttMs <= 300 && speedOk(2)) return 'good'
  if (rttMs <= 800 && speedOk(0.8)) return 'fair'
  return 'poor'
}

export function describeProbe(probe: NetworkProbe) {
  const parts = [] as string[]
  if (probe.rttMs !== null) parts.push(`往返 ${Math.round(probe.rttMs)} ms`)
  if (probe.downlinkMbps !== null) parts.push(`下行约 ${probe.downlinkMbps >= 10 ? Math.round(probe.downlinkMbps) : probe.downlinkMbps.toFixed(1)} Mbps`)
  parts.push(networkLabel[probe.level])
  return parts.join(' · ')
}

type Connection = { downlink?: number; saveData?: boolean }
export const connectionInfo = () => (navigator as Navigator & { connection?: Connection }).connection
export const saveData = () => Boolean(connectionInfo()?.saveData)

async function ping(url: string, timeoutMs: number) {
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const started = performance.now()
  try {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store', credentials: 'omit', signal: controller.signal })
    await response.arrayBuffer()
    return response.ok ? performance.now() - started : NaN
  } catch { return NaN } finally { clearTimeout(timer) }
}

/** 对 url（调用方传 apiUrl('/api/health')）测 3 次取中位数；全部失败为“无法连接服务器”。 */
export async function probeNetwork(url: string, times = 3, timeoutMs = 5000): Promise<NetworkProbe> {
  const samples: number[] = []
  for (let i = 0; i < times; i++) samples.push(await ping(url, timeoutMs))
  const rttMs = median(samples)
  const reported = connectionInfo()?.downlink
  const fromPage = estimateDownlink(performance.getEntriesByType('resource') as PerformanceResourceTiming[])
  const downlinkMbps = typeof reported === 'number' && reported > 0 ? reported : fromPage
  return { level: classify(rttMs, downlinkMbps), rttMs, downlinkMbps, at: Date.now() }
}

/** 试穿中 SDK 回报的质量（Excellent…Down）。 */
export const sdkQualityLabel: Record<string, string> = { Excellent: '很好', Good: '良好', Poor: '一般', Bad: '较差', VeryBad: '很差', Down: '断开', Unknown: '未知' }

type Stream = { width?: number; height?: number; fps?: number; kbps?: number; loss?: number; delayMs?: number }
/** 画质一行：分辨率 · 帧率 · 码率 · 丢包 · 延迟；缺的项不写，全缺时为空串。 */
export function describeStream(s: Stream) {
  const parts = [] as string[]
  if (s.width && s.height) parts.push(`${Math.round(s.width)}×${Math.round(s.height)}`)
  if (s.fps !== undefined) parts.push(`${Math.round(s.fps)} 帧/秒`)
  if (s.kbps !== undefined) parts.push(s.kbps >= 1000 ? `${(s.kbps / 1000).toFixed(1)} Mbps` : `${Math.round(s.kbps)} kbps`)
  if (s.loss !== undefined) parts.push(`丢包 ${s.loss.toFixed(1)}%`)
  if (s.delayMs !== undefined) parts.push(`延迟 ${Math.round(s.delayMs)} ms`)
  return parts.join(' · ')
}
