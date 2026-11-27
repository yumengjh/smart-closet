import type { RealtimeMediaStream, XmaxRealtimeManaging, XmaxRealtimeVideoView } from '@xmaxai/web-sdk'
import { bindControlPlane, tolerateSenderRace, type TryOnStartOptions, type TryOnVendor } from './sdkBridge'
import { DecartSession } from './decart'
import { request } from '../services/api'
import type { Prepared } from './api'
import { tryOnPrompt } from './context'
import { observeFirstFrame } from './firstFrame'
import { StartupDiagnostic, type StartupStage } from './diagnostic'
import { CAMERA_LAYOUT_QUERY, defaultAspect, presetOf, type CameraPresetKey } from './stage'

/** 只给本页“连接状态”看的画质数字，不进连接诊断、不上传（2026-11-06 加载提速设计 §3.6）。 */
export type StreamStats = { width?: number; height?: number; fps?: number; kbps?: number; loss?: number; delayMs?: number }
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined

export class TryOnCamera implements TryOnVendor {
  /** 试穿中 SDK 回报的上行（摄像头 → 云端）与下行（试穿画面 → 本机）统计。 */
  uplinkStats: StreamStats = {}
  downlinkStats: StreamStats = {}
  private manager?: XmaxRealtimeManaging
  private local?: RealtimeMediaStream
  private localView?: XmaxRealtimeVideoView
  private remoteView?: XmaxRealtimeVideoView
  private lease = ''
  private environment = 'china'
  private front = true
  private disposed = false
  private revision = 0
  private reportedLease = ''
  private cancelFrameObservation?: () => void
  private premium?: DecartSession
  private sessionVersion = 0
  private preset: CameraPresetKey = presetOf(defaultAspect(window.matchMedia(CAMERA_LAYOUT_QUERY).matches))
  /** 真实画面尺寸；舞台、小窗都以它为准，不假定摄像头遵守预设。 */
  onSize?: (source: 'local' | 'remote', width: number, height: number) => void
  private readonly trace = new StartupDiagnostic(stage => this.onProgress(stage))
  get diagnostic() { return this.trace.snapshot() }
  private reportFrame() { if (!this.lease || this.reportedLease === this.lease) return; this.reportedLease = this.lease; this.host.classList.add('has-result'); this.trace.frame(); this.onFrame() }
  constructor(private host: HTMLElement, private onFrame: () => void, private onFailure: (error: Error) => void, private onProgress: (stage: StartupStage) => void = () => {}) {}
  get video() { return this.remoteView?.videoElement }
  /** 摄像头原画（未经生成），只给本地姿态检查读帧。 */
  get localVideo() { return this.localView?.videoElement }
  get ready() { return Boolean(this.local) }
  /** 本地预览的实际分辨率与帧率（读摄像头轨道设置，读不到时只给分辨率）。 */
  get previewStats(): StreamStats {
    const video = this.localView?.videoElement
    if (!video) return {}
    const track = (video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined)
    const settings = track?.getSettings?.() ?? {}
    return { width: finite(video.videoWidth) || finite(settings.width), height: finite(video.videoHeight) || finite(settings.height), fps: finite(settings.frameRate) }
  }
  get isFront() { return this.front }
  private watchSize(video: HTMLVideoElement, source: 'local' | 'remote') {
    const report = () => { if (video.videoWidth && video.videoHeight) this.onSize?.(source, video.videoWidth, video.videoHeight) }
    video.addEventListener('loadedmetadata', report); video.addEventListener('resize', report)
  }
  /** 只在未连接时生效：连接后改画幅需要新会话，页面在试穿中禁用入口。 */
  async setAspect(preset: CameraPresetKey) {
    if (this.lease) throw new Error('试穿中不能切换画幅，请先结束。')
    const before = this.preset
    this.preset = preset
    if (!this.manager || !this.local) return
    try { const sdk = await import('@xmaxai/web-sdk'); await this.manager.updateCameraFormat(sdk.RealtimeCameraPreset[preset]) }
    catch (cause) { this.preset = before; throw cause }
  }
  async open(environment: 'china' | 'global' = 'china') {
    this.sessionVersion++
    await this.openPreview(environment)
  }
  private async openPreview(environment: 'china' | 'global') {
    const revision = ++this.revision
    await this.closePreview()
    const sdk = await import('@xmaxai/web-sdk')
    if (this.disposed || revision !== this.revision) return
    this.environment = environment
    // A deliberately non-provider placeholder. The bridge must be installed before any session operation.
    const client = new sdk.XmaxClient(new sdk.XmaxConfiguration({ apiKey: 'fish-closet-server-controlled', environment: environment === 'china' ? sdk.XmaxEnvironment.china : sdk.XmaxEnvironment.global, loggerOptions: 0 }))
    const manager = client.createRealtimeManager(new sdk.RealtimeConfiguration({ model: sdk.RealtimeModel.x2_1 }))
    try { bindControlPlane(manager, () => this.lease, async (path, init) => { const started = performance.now(); const data = await request(path, init); if (init.method === 'POST') this.trace.created(performance.now() - started); return data }); tolerateSenderRace(manager, () => console.warn('实时发送参数未生效，已沿用浏览器当前编码设置。')) } catch (cause) { await manager.close(); throw cause }
    this.manager = manager
    this.localView = new sdk.XmaxRealtimeVideoView({ videoContentMode: sdk.VideoContentMode.fit, isInteractionEnabled: false, fadeInDurationMs: 0 })
    this.remoteView = new sdk.XmaxRealtimeVideoView({ videoContentMode: sdk.VideoContentMode.fit, isInteractionEnabled: false, fadeInDurationMs: 0 })
    this.localView.attach(this.host); this.remoteView.attach(this.host)
    this.localView.element.classList.add('tryon-local'); this.remoteView.element.classList.add('tryon-remote')
    this.localView.isMirrored = this.front; this.remoteView.isMirrored = false
    this.watchSize(this.localView.videoElement, 'local'); this.watchSize(this.remoteView.videoElement, 'remote')
    this.remoteView.frameDisplayHandler = () => this.reportFrame()
    await manager.setStateListener(state => {
      if (state.connectionState === sdk.RealtimeConnectionState.connected) this.trace.connected()
      if (state.reason?.kind === 'failure') this.onFailure(new Error(state.reason.error.message))
    })
    await manager.setTimingListener(timing => this.trace.timing(timing))
    await manager.setNetworkQualityListener(quality => { if (quality) this.trace.quality(quality.uplink, quality.downlink) })
    await manager.setUplinkVideoStatisticsListener(stats => {
      if (!stats) { this.uplinkStats = {}; return }
      this.trace.video({ sendFps:stats.sendFrameRate, uplinkKbps:stats.bitrateKbps, uplinkLoss:stats.packetLossPercent })
      this.uplinkStats = { width: finite(stats.width), height: finite(stats.height), fps: finite(stats.sendFrameRate), kbps: finite(stats.bitrateKbps), loss: finite(stats.packetLossPercent) }
    })
    await manager.setDownlinkVideoStatisticsListener(stats => {
      if (!stats) { this.downlinkStats = {}; return }
      this.trace.video({ decodeFps:stats.decodeFrameRate, downlinkKbps:stats.bitrateKbps, downlinkLoss:stats.packetLossPercent, mediaDelayMs:stats.endToEndDelayMs })
      this.downlinkStats = { width: finite(stats.width), height: finite(stats.height), fps: finite(stats.renderFrameRate ?? stats.decodeFrameRate), kbps: finite(stats.bitrateKbps), loss: finite(stats.packetLossPercent), delayMs: finite(stats.endToEndDelayMs) }
    })
    await manager.setRemoteAudioVolume(0)
    const local = await manager.createLocalCameraStream({ position: this.front ? sdk.CameraPosition.front : sdk.CameraPosition.back, useMicrophone: false, preset: sdk.RealtimeCameraPreset[this.preset] })
    if (this.disposed || revision !== this.revision) { await manager.close(); return }
    this.local = local; this.localView.track = local.videoTrack
  }
  async start(lease: string, environment: 'china' | 'global', prepared: Prepared, options?: TryOnStartOptions) {
    const version = ++this.sessionVersion
    // Premium only needs the preview track. The region selects the standard SDK's control plane.
    if (!this.manager || !this.local || (options?.vendor !== 'DECART' && this.environment !== environment)) await this.openPreview(environment)
    if (version !== this.sessionVersion || this.disposed) throw new Error('试穿已停止。')
    if (!this.manager || !this.local) throw new Error('摄像头尚未就绪。')
    this.lease = lease; this.trace.start()
    if (options?.vendor !== 'DECART') { await this.change(prepared); return }
    if (!options.credential || !prepared.referenceBlob) throw new Error('高质量试穿启动失败，请稍后再试。')
    const track = this.local.videoTrack?.mediaStreamTrack
    if (!track || track.readyState !== 'live') throw new Error('摄像头尚未就绪。')
    const premium = new DecartSession()
    this.premium = premium
    const current = () => this.premium === premium && this.lease === lease && this.sessionVersion === version && !this.disposed
    await premium.start(new MediaStream([track]), options.credential, tryOnPrompt(prepared.items), prepared.referenceBlob, {
      hasFrame: () => current() && this.reportedLease === lease,
      onRemote: stream => {
        if (!current() || !this.remoteView) return
        const video = this.remoteView.videoElement
        this.cancelFrameObservation?.()
        video.srcObject = stream; video.muted = true; void video.play().catch(() => {})
        this.cancelFrameObservation = observeFirstFrame(video, () => { if (current() && video.srcObject === stream) this.reportFrame() })
      },
      onConnected: () => { if (current()) this.trace.connected() },
      onError: error => { if (current()) this.onFailure(error) },
      onCapacityWait: () => {},
      onLimit: () => { if (current()) this.onFailure(new Error('本次试穿时间已到，连接已结束。')) },
    }, options.capacityRetryBudgetMs ?? 60_000, options.renewCredential)
  }
  setDeadline(lease: string, deadlineAtMs: number) {
    if (this.lease === lease) this.premium?.setDeadline(deadlineAtMs)
  }
  async change(prepared: Prepared) {
    if (!this.manager || !this.local || !this.lease) throw new Error('请先开始试穿。')
    if (this.premium) { if (!prepared.referenceBlob) throw new Error('衣服参考图尚未就绪。'); await this.premium.change(tryOnPrompt(prepared.items), prepared.referenceBlob); return }
    if (!prepared.referencePath) throw new Error('衣服参考图尚未就绪。')
    const sdk = await import('@xmaxai/web-sdk')
    const remote = await this.manager.startGeneration({ localStream: this.local, context: new sdk.RealtimeContext({ prompt: tryOnPrompt(prepared.items), referencePath: prepared.referencePath }), faceRestoration: true })
    if (this.remoteView) {
      this.cancelFrameObservation?.()
      const view = this.remoteView, lease = this.lease, track = remote.videoTrack
      view.track = track
      this.cancelFrameObservation = observeFirstFrame(view.videoElement, () => { if (this.lease === lease && view.track === track) this.reportFrame() })
    }
  }
  async switchCamera() {
    const manager = this.manager, premium = this.premium
    if (!manager) return
    await manager.switchCamera()
    if (this.manager !== manager) return
    this.front = !this.front
    if (this.localView) this.localView.isMirrored = this.front
    if (premium && this.premium === premium) {
      const track = this.local?.videoTrack?.mediaStreamTrack
      if (!track || track.readyState !== 'live') throw new Error('摄像头尚未就绪。')
      await premium.replaceVideoTrack(track)
    }
  }
  private endSession() {
    this.trace.end(); this.lease = ''; this.reportedLease = ''; this.host.classList.remove('has-result')
    this.cancelFrameObservation?.(); this.cancelFrameObservation = undefined
    const premium = this.premium
    this.premium = undefined
    premium?.stop()
    if (this.remoteView) {
      if (premium) this.remoteView.videoElement.srcObject = null
      this.remoteView.track = undefined
    }
    return premium
  }
  async stop() {
    this.sessionVersion++
    this.uplinkStats = {}; this.downlinkStats = {}
    if (!this.endSession()) await this.manager?.disconnect()
  }
  private async closePreview() {
    this.endSession()
    const manager = this.manager
    this.localView?.detach(); this.remoteView?.detach()
    this.manager = undefined; this.local = undefined; this.localView = undefined; this.remoteView = undefined
    await manager?.close()
  }
  async release() { this.sessionVersion++; this.revision++; await this.closePreview() }
  async dispose() { this.disposed = true; await this.release() }
}
