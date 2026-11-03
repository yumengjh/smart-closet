import type { StartupStage } from './diagnostic'

/** 手机竖屏与手机横屏都走全屏相机；同一条件也决定外壳隐藏导航、助手挂起。 */
export const CAMERA_LAYOUT_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)'

export type TryOnPhase = 'off' | 'cover' | 'preview' | 'queued' | 'offered' | 'connecting' | 'live' | 'recording' | 'stopping'
export type CaptureMode = '拍照' | '录像'
export type PhaseInput = {
  enabled: boolean; cameraReady: boolean; busy: boolean; live: boolean; queued: boolean; offered: boolean
  reclaiming: boolean; frameReady: boolean; recording: boolean
}

/** 页面展示相位。计费、拍摄是否可用仍以服务端租约状态为准，这里只决定画面和控件。 */
export function tryOnPhase(s: PhaseInput): TryOnPhase {
  if (s.reclaiming) return 'stopping'
  if (s.recording) return 'recording'
  if (s.offered) return 'offered'
  if (s.queued) return 'queued'
  if (s.live && s.frameReady) return 'live'
  if (s.live || s.busy && s.cameraReady) return 'connecting'
  if (!s.enabled) return 'off'
  return s.cameraReady ? 'preview' : 'cover'
}

export type ShutterIntent = 'disabled' | 'open' | 'pick' | 'start' | 'accept' | 'cancel' | 'wait' | 'photo' | 'record' | 'stop-record'

/** 同一个快门承担开始、取消、拍摄：位置不变，连接中也能取消。 */
export function shutterIntent(phase: TryOnPhase, mode: CaptureMode, hasSelection: boolean, canStart: boolean): ShutterIntent {
  switch (phase) {
    case 'off': return 'disabled'
    case 'cover': return 'open'
    case 'preview': return !hasSelection ? 'pick' : canStart ? 'start' : 'disabled'
    case 'offered': return 'accept'
    case 'queued': case 'connecting': return 'cancel'
    case 'live': return mode === '录像' ? 'record' : 'photo'
    case 'recording': return 'stop-record'
    default: return 'wait'
  }
}

export type CameraPresetKey = 'resolution1080x1920' | 'resolution1152x1536' | 'resolution1408x1408' | 'resolution1536x1152' | 'resolution1920x1080'
export type AspectValue = '9:16' | '3:4' | '1:1' | '4:3' | '16:9'
export const ASPECTS: readonly { value: AspectValue; preset: CameraPresetKey; ratio: number }[] = [
  { value: '9:16', preset: 'resolution1080x1920', ratio: 9 / 16 },
  { value: '3:4', preset: 'resolution1152x1536', ratio: 3 / 4 },
  { value: '1:1', preset: 'resolution1408x1408', ratio: 1 },
  { value: '4:3', preset: 'resolution1536x1152', ratio: 4 / 3 },
  { value: '16:9', preset: 'resolution1920x1080', ratio: 16 / 9 },
]
export const defaultAspect = (narrow: boolean): AspectValue => narrow ? '9:16' : '16:9'
export const aspectOf = (value: string) => ASPECTS.find(a => a.value === value)
export const presetOf = (value: AspectValue) => aspectOf(value)!.preset

export type Fit = 'cover' | 'contain'
/** 画幅接近屏幕时铺满；裁切超过四分之一会丢身体，退回完整显示，留黑边给控件。 */
export function autoFit(width: number, height: number, ratio: number): Fit {
  if (width <= 0 || height <= 0 || ratio <= 0) return 'contain'
  const stage = width / height
  return 1 - Math.min(stage, ratio) / Math.max(stage, ratio) <= 0.25 ? 'cover' : 'contain'
}

export type Box = { width: number; height: number }
/** 在可用区域内取真实画幅最大矩形，舞台不留黑边。 */
export function fitBox(area: Box, ratio: number): Box {
  if (area.width <= 0 || area.height <= 0 || ratio <= 0) return { width: 0, height: 0 }
  const width = Math.min(area.width, area.height * ratio)
  return { width: Math.round(width), height: Math.round(width / ratio) }
}

export type Insets = { top: number; right: number; bottom: number; left: number }
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export function pipSize(stage: Box, ratio: number, compact: boolean): Box {
  const longest = compact ? 148 : Math.min(260, Math.max(170, Math.round(Math.max(stage.width, stage.height) * 0.24)))
  const safe = ratio > 0 ? ratio : 9 / 16
  return safe >= 1 ? { width: longest, height: Math.round(longest / safe) } : { width: Math.round(longest * safe), height: longest }
}

export function cornerPosition(corner: Corner, stage: Box, pip: Box, insets: Insets) {
  const maxX = Math.max(insets.left, stage.width - pip.width - insets.right)
  const maxY = Math.max(insets.top, stage.height - pip.height - insets.bottom)
  return { x: corner.endsWith('left') ? insets.left : maxX, y: corner.startsWith('top') ? insets.top : maxY }
}

/** 松手时吸附到小窗中心最近的角，不留在挡身体的位置。 */
export function nearestCorner(x: number, y: number, stage: Box, pip: Box): Corner {
  const horizontal = x + pip.width / 2 < stage.width / 2 ? 'left' : 'right'
  const vertical = y + pip.height / 2 < stage.height / 2 ? 'top' : 'bottom'
  return `${vertical}-${horizontal}`
}

export const CONNECT_STEPS = ['准备衣物', '连接服务', '推送画面', '生成试穿'] as const
export function connectStep(stage?: StartupStage) {
  if (stage === 'CREATING_SESSION' || stage === 'JOINING_RTC') return 1
  if (stage === 'PUBLISHING') return 2
  if (stage === 'WAITING_FRAME' || stage === 'GENERATING') return 3
  return 0
}

export type SwipeResult = 'left' | 'right' | null
export function swipeDirection(dx: number, dy: number): SwipeResult {
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return null
  return dx < 0 ? 'left' : 'right'
}
