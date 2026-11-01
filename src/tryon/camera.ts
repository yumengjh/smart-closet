import type { RealtimeMediaStream, XmaxRealtimeManaging, XmaxRealtimeVideoView } from '@xmaxai/web-sdk'
import { bindControlPlane } from './sdkBridge'
import { request } from '../services/api'
import type { Prepared } from './api'
import { tryOnPrompt } from './context'
import { observeFirstFrame } from './firstFrame'
import { StartupDiagnostic, type StartupStage } from './diagnostic'

export class TryOnCamera {
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
  private readonly trace = new StartupDiagnostic(stage => this.onProgress(stage))
  get diagnostic() { return this.trace.snapshot() }
  private reportFrame() { if (!this.lease || this.reportedLease === this.lease) return; this.reportedLease = this.lease; this.host.classList.add('has-result'); this.trace.frame(); this.onFrame() }
  constructor(private host: HTMLElement, private onFrame: () => void, private onFailure: (error: Error) => void, private onProgress: (stage: StartupStage) => void = () => {}) {}
  get video() { return this.remoteView?.videoElement }
  get ready() { return Boolean(this.local) }
  async open(environment: 'china' | 'global' = 'china') {
    const revision = ++this.revision
    await this.release()
    const sdk = await import('@xmaxai/web-sdk')
    if (this.disposed || revision !== this.revision) return
    this.environment = environment
    // A deliberately non-provider placeholder. The bridge must be installed before any session operation.
    const client = new sdk.XmaxClient(new sdk.XmaxConfiguration({ apiKey: 'fish-closet-server-controlled', environment: environment === 'china' ? sdk.XmaxEnvironment.china : sdk.XmaxEnvironment.global, loggerOptions: 0 }))
    const manager = client.createRealtimeManager(new sdk.RealtimeConfiguration({ model: sdk.RealtimeModel.x2_1 }))
    try { bindControlPlane(manager, () => this.lease, async (path, init) => { const started = performance.now(); const data = await request(path, init); if (init.method === 'POST') this.trace.created(performance.now() - started); return data }) } catch (cause) { await manager.close(); throw cause }
    this.manager = manager
    this.localView = new sdk.XmaxRealtimeVideoView({ videoContentMode: sdk.VideoContentMode.fit, isInteractionEnabled: false, fadeInDurationMs: 0 })
    this.remoteView = new sdk.XmaxRealtimeVideoView({ videoContentMode: sdk.VideoContentMode.fit, isInteractionEnabled: false, fadeInDurationMs: 0 })
    this.localView.attach(this.host); this.remoteView.attach(this.host)
    this.localView.element.classList.add('tryon-local'); this.remoteView.element.classList.add('tryon-remote')
    this.localView.isMirrored = this.front; this.remoteView.isMirrored = false
    this.remoteView.frameDisplayHandler = () => this.reportFrame()
    await manager.setStateListener(state => {
      if (state.connectionState === sdk.RealtimeConnectionState.connected) this.trace.connected()
      if (state.reason?.kind === 'failure') this.onFailure(new Error(state.reason.error.message))
    })
    await manager.setTimingListener(timing => this.trace.timing(timing))
    await manager.setNetworkQualityListener(quality => { if (quality) this.trace.quality(quality.uplink, quality.downlink) })
    await manager.setUplinkVideoStatisticsListener(stats => { if (stats) this.trace.video({ sendFps:stats.sendFrameRate, uplinkKbps:stats.bitrateKbps, uplinkLoss:stats.packetLossPercent }) })
    await manager.setDownlinkVideoStatisticsListener(stats => { if (stats) this.trace.video({ decodeFps:stats.decodeFrameRate, downlinkKbps:stats.bitrateKbps, downlinkLoss:stats.packetLossPercent, mediaDelayMs:stats.endToEndDelayMs }) })
    await manager.setRemoteAudioVolume(0)
    const portrait = window.matchMedia('(max-width: 767px)').matches
    const local = await manager.createLocalCameraStream({ position: this.front ? sdk.CameraPosition.front : sdk.CameraPosition.back, useMicrophone: false, preset: portrait ? sdk.RealtimeCameraPreset.resolution1080x1920 : sdk.RealtimeCameraPreset.resolution1920x1080 })
    if (this.disposed || revision !== this.revision) { await manager.close(); return }
    this.local = local; this.localView.track = local.videoTrack
  }
  async start(lease: string, environment: 'china' | 'global', prepared: Prepared) {
    if (!this.manager || this.environment !== environment) await this.open(environment)
    if (!this.manager || !this.local) throw new Error('摄像头尚未就绪。')
    this.lease = lease; this.trace.start()
    await this.change(prepared)
  }
  async change(prepared: Prepared) {
    if (!this.manager || !this.local || !this.lease) throw new Error('请先开始试穿。')
    const sdk = await import('@xmaxai/web-sdk')
    const remote = await this.manager.startGeneration({ localStream: this.local, context: new sdk.RealtimeContext({ prompt: tryOnPrompt(prepared.items), referencePath: prepared.referencePath }), faceRestoration: true })
    if (this.remoteView) {
      this.cancelFrameObservation?.()
      const view = this.remoteView, lease = this.lease, track = remote.videoTrack
      view.track = track
      this.cancelFrameObservation = observeFirstFrame(view.videoElement, () => { if (this.lease === lease && view.track === track) this.reportFrame() })
    }
  }
  async switchCamera() { if (!this.manager) return; await this.manager.switchCamera(); this.front = !this.front; if (this.localView) this.localView.isMirrored = this.front }
  async stop() { this.trace.end(); this.lease = ''; this.cancelFrameObservation?.(); this.cancelFrameObservation = undefined; this.reportedLease = ''; this.host.classList.remove('has-result'); await this.manager?.disconnect(); if (this.remoteView) this.remoteView.track = undefined; this.lease = '' }
  async release() { this.trace.end(); this.lease = ''; this.cancelFrameObservation?.(); this.cancelFrameObservation = undefined; this.reportedLease = ''; this.host.classList.remove('has-result'); await this.manager?.close(); this.localView?.detach(); this.remoteView?.detach(); this.manager = undefined; this.local = undefined; this.localView = undefined; this.remoteView = undefined; this.lease = '' }
  async dispose() { this.disposed = true; this.revision++; await this.release() }
}
