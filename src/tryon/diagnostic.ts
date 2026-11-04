export type StartupStage = 'CREATING_SESSION' | 'JOINING_RTC' | 'PUBLISHING' | 'WAITING_FRAME' | 'GENERATING' | 'STOPPING' | 'FAILED'
export type NetworkQuality = 'Unknown' | 'Excellent' | 'Good' | 'Poor' | 'Bad' | 'VeryBad' | 'Down'
export type ConnectionDiagnostic = { stage: StartupStage; timings: Record<string, number>; video: Record<string, number>; uplink?: NetworkQuality; downlink?: NetworkQuality }
const timingKeys = ['sessionMs', 'rtcJoinMs', 'publishMs', 'firstFrameMs'] as const
const videoKeys = ['sendFps', 'decodeFps', 'uplinkKbps', 'downlinkKbps', 'uplinkLoss', 'downlinkLoss', 'mediaDelayMs'] as const
const qualities = new Set(['Unknown','Excellent','Good','Poor','Bad','VeryBad','Down'])
export const stageLabel: Record<StartupStage,string> = {
  CREATING_SESSION:'正在创建实时会话', JOINING_RTC:'正在连接 RTC 媒体通道', PUBLISHING:'正在推送摄像头画面',
  WAITING_FRAME:'媒体通道已连接，等待试穿画面', GENERATING:'已收到试穿画面', STOPPING:'正在结束实时连接', FAILED:'实时连接未完成',
}
function pick(source: object, keys: readonly string[], max: number) {
  const result: Record<string,number> = {}
  for (const key of keys) { const value = (source as Record<string,unknown>)[key]; if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max) result[key] = value }
  return result
}
/** Finite stages and numeric statistics only. Never copy an SDK state, credential, user ID, URL or error message. */
export class StartupDiagnostic {
  private value: ConnectionDiagnostic = { stage:'CREATING_SESSION', timings:{}, video:{} }
  private active = false
  private rtc = false
  private latestTiming: Record<string,number> = {}
  private readonly onStage: (stage: StartupStage) => void
  constructor(onStage: (stage: StartupStage) => void = () => {}) { this.onStage = onStage }
  start() { this.active = true; this.rtc = false; this.latestTiming = {}; this.value = {stage:'CREATING_SESSION',timings:{},video:{}}; this.onStage(this.value.stage) }
  end() { this.active = false }
  private stage(next: StartupStage) { if (this.value.stage !== next) { this.value.stage = next; this.onStage(next) } }
  created(milliseconds: number) { if (!this.active) return; this.value.timings = pick({sessionMs:milliseconds},timingKeys,3_600_000); this.stage('JOINING_RTC') }
  timing(input: object) {
    if (!this.active) return
    this.latestTiming = pick(input,timingKeys,3_600_000)
    if (this.rtc) Object.assign(this.value.timings,this.latestTiming)
    else {
      if (this.latestTiming.sessionMs !== undefined) this.value.timings.sessionMs = this.latestTiming.sessionMs
      if (this.latestTiming.rtcJoinMs !== undefined && this.latestTiming.publishMs === undefined && this.value.stage === 'JOINING_RTC') this.stage('PUBLISHING')
    }
  }
  connected() { if (!this.active) return; this.rtc = true; Object.assign(this.value.timings,this.latestTiming); this.stage('WAITING_FRAME') }
  frame() { if (this.active) this.stage('GENERATING') }
  quality(uplink: string, downlink: string) { if (!this.active) return; if (qualities.has(uplink)) this.value.uplink = uplink as NetworkQuality; if (qualities.has(downlink)) this.value.downlink = downlink as NetworkQuality }
  video(input: object) { if (this.active) Object.assign(this.value.video,pick(input,videoKeys,1_000_000)) }
  snapshot(): ConnectionDiagnostic { return { ...this.value, timings:{...this.value.timings}, video:{...this.value.video} } }
}
