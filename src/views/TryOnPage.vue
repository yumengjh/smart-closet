<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { CameraOutlined, SwapOutlined, LeftOutlined, PictureOutlined, DownloadOutlined, DeleteOutlined, PlusOutlined, ExpandOutlined, CompressOutlined, InfoCircleOutlined, LoadingOutlined, BorderOutlined, ColumnWidthOutlined, EyeOutlined, EyeInvisibleOutlined, RightOutlined, PoweroffOutlined } from '@ant-design/icons-vue'
import { tryOnApi, emergencyStop, duration, finished, mediaUrl, type Candidate, type Capabilities, type Media, type Prepared, type Selection, type Session } from '../tryon/api'
import { TryOnCamera } from '../tryon/camera'
import { frameCanvas, photo, startRecording, type Recorder } from '../tryon/recording'
import { refreshTryOnAccess } from '../tryon/access'
import { onAccountChange, accountIsStale } from '../domain/accountSession'
import MediaPreview from '../tryon/MediaPreview.vue'
import TryOnPicker from '../tryon/TryOnPicker.vue'
import { framingHint, WEAR_GROUPS } from '../tryon/context'
import { stageLabel, type StartupStage } from '../tryon/diagnostic'
import TryOnShutter from '../tryon/TryOnShutter.vue'
import TryOnFilmstrip from '../tryon/TryOnFilmstrip.vue'
import { playSound } from '../services/sound'
import { ASPECTS, CAMERA_LAYOUT_QUERY, CONNECT_STEPS, aspectOf, autoFit, connectStep, cornerPosition, defaultAspect, nearestCorner, pipSize, presetOf, shutterIntent, swipeDirection, tryOnPhase, type AspectValue, type Box, type CaptureMode, type Corner, type Fit, type Insets } from '../tryon/stage'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import type { Outfit } from '../domain/outfit'

const route = useRoute(), router = useRouter(), { message, modal } = App.useApp()
const host = ref<HTMLElement>(), stage = ref<HTMLElement>(), stageArea = ref<HTMLElement>(), body = ref<HTMLElement>(), topbar = ref<HTMLElement>(), dock = ref<HTMLElement>(), historySlot = ref<HTMLElement>(), freezeCanvas = ref<HTMLCanvasElement>(), cap = ref<Capabilities | null>(null)
const loading = ref(true), cameraReady = ref(false), busy = ref(false), error = ref(''), frameReady = ref(false)
const garments = ref<Candidate[]>([]), outfits = ref<Outfit[]>([]), selected = ref<Selection[]>([])
const prepared = ref<Prepared | null>(null), lease = ref<Session | null>(null), picker = ref(false), tab = ref('衣柜'), historyOpen = ref(false)
const media = ref<Media[]>([]), sessionHistory = ref<Session[]>([]), historyPage = ref(1), garmentPage = ref(1), historyBusy = ref(false), search = ref('')
const temporary = ref<{ id: string; imageUrl: string; expiresAtMs: number; role?: string }[]>([]), uploading = ref(false), importChoice = ref<File | null>(null), importRole = ref<string>()
const recording = ref(false), recordingBusy = ref(false), recordingSeconds = ref(0), uploadedBytes = ref(0), recordingError = ref('')
const selectedOutfit = ref<string | null>(null), selectingOutfit = ref<string | null>(null), pendingOutfit = ref<string | null>(null), preparing = ref(false)
const captureMode = ref<CaptureMode>('拍照'), busyPhase = ref(''), latestBusy = ref(false), startupStage = ref<StartupStage | undefined>()
const silentChoice = ref(false), microphoneError = ref(''), now = ref(Date.now()), historyFilter = ref('全部')
let camera: TryOnCamera | undefined, recorder: Recorder | undefined, action = 0, pulseRunning = false, pulseAgain = false, pulseTimer = 0, clockTimer = 0, rebuildTimer = 0, disposed = false, searchTimer = 0, garmentRequest = 0
const live = computed(() => !finished(lease.value))
const queued = computed(() => lease.value?.state === 'QUEUED')
const offered = computed(() => lease.value?.state === 'OFFERED')
const generating = computed(() => frameReady.value && ['WAITING_FRAME', 'GENERATING'].includes(lease.value?.state || ''))
const reclaiming = computed(() => ['STOPPING', 'UNKNOWN'].includes(lease.value?.state || ''))
const visibleMedia = computed(() => media.value.filter(m => historyFilter.value === '全部' || m.type === (historyFilter.value === '照片' ? 'PHOTO' : 'VIDEO')))
const remaining = computed(() => {
  const s = lease.value
  if (!s || finished(s)) return cap.value?.quota.remaining || 0
  if (s.connectedAtMs) return Math.max(0, s.reservedPoints - Math.floor((now.value - s.connectedAtMs) / 1000))
  return s.reservedPoints
})
const waitSeconds = computed(() => Math.max(0, Math.ceil(((lease.value?.deadlineAtMs || 0) - now.value) / 1000)))
const phase = computed(() => tryOnPhase({ enabled: Boolean(cap.value?.enabled), cameraReady: cameraReady.value, busy: busy.value, live: live.value, queued: queued.value, offered: offered.value, reclaiming: reclaiming.value, frameReady: frameReady.value, recording: recording.value }))
const status = computed(() => {
  switch (phase.value) {
    case 'preview': return `本地预览 · 今日 ${duration(remaining.value)}`
    case 'queued': return `排队中 · ${waitSeconds.value} 秒`
    case 'offered': return `轮到你了 · ${waitSeconds.value} 秒`
    case 'connecting': return lease.value ? `连接中 · ${waitSeconds.value} 秒` : '准备中'
    case 'live': case 'recording': return `试穿中 · ${duration(remaining.value)}`
    case 'stopping': return '正在结束'
    default: return cap.value ? `今日剩余 ${duration(remaining.value)}` : '实时试穿'
  }
})
const chosenOutfit = computed(() => outfits.value.find(o => o.id === selectedOutfit.value))
const canUseLatest = computed(() => /确认使用最新|成品.*改变|衣物已经更新/.test(error.value))
const selectionTitle = computed(() => chosenOutfit.value?.name || (selected.value.length ? `${selected.value.length} 件试穿衣物` : '选择衣物或搭配'))
const selectionSummary = computed(() => selected.value.map(selectionName).join('、'))
const captureImage = computed(() => media.value.find(m => m.type === 'PHOTO' && m.state === 'READY'))
// 拍摄引导按已选衣物算：选了位置用选的，否则用上次准备时的分类；不必等到开始。
const selectedRoles = computed(() => selected.value.map(s => ({ wearingRole: s.role || prepared.value?.items.find(i => i.id === s.id)?.wearingRole })))
const startHint = computed(() => {
  if (!cap.value?.enabled) return '由管理员开通实时试穿，已有结果仍可在历史中查看。'
  if (preparing.value) return '正在核对这套搭配的成品图片，选好后不会自动开始计费。'
  if (busyPhase.value) return busyPhase.value
  if (generating.value) return '正在消耗试穿额度。选衣期间也会计时，可随时停止。'
  if (queued.value) return '排队不计费，轮到你时需要再次点击开始。'
  if (offered.value) return '名额已保留，点击开始后连接实时服务。'
  if (live.value) return '连接成功后开始计时，首帧仍在生成，请保持人在画面中。'
  if (!selected.value.length) return '先选一套搭配或几件衣物，再打开相机。'
  if (!cameraReady.value) return '衣物已选好。打开相机先看本地预览，不消耗额度。'
  return `${framingHint(selectedRoles.value)} 点击开始后连接计时。`
})
const intent = computed(() => shutterIntent(phase.value, captureMode.value, selected.value.length > 0, Boolean(cap.value?.ready) && !preparing.value))
const shutterLabel = computed(() => ({ disabled: cap.value?.reason || '暂不可开始', open: '打开相机预览', pick: '选择试穿衣物', start: '开始试穿', accept: `开始试穿，还剩 ${waitSeconds.value} 秒`, cancel: queued.value ? '取消排队' : '取消连接', wait: '正在结束', photo: '拍下试穿效果', record: '开始录像', 'stop-record': '结束录像' }[intent.value]))
const shutterText = computed(() => intent.value === 'start' ? '开始' : intent.value === 'accept' ? String(waitSeconds.value) : undefined)
const shutterProgress = computed(() => {
  if (intent.value === 'stop-record') return recordingSeconds.value / (cap.value?.limits.recordingSeconds || 60)
  if (intent.value === 'accept') return waitSeconds.value / (cap.value?.limits.offerSeconds || 10)
  return undefined
})
const stepIndex = computed(() => connectStep(startupStage.value))
const notice = computed(() => {
  if (error.value && !picker.value) return 'error'
  if (phase.value === 'connecting' || phase.value === 'queued' || phase.value === 'stopping' || phase.value === 'offered') return phase.value
  return 'hint'
})
const narrow = ref(window.matchMedia(CAMERA_LAYOUT_QUERY).matches)
const aspect = ref<AspectValue>(readAspect()), fitChoice = ref<Fit | null>(null), area = ref<Box>({ width: 0, height: 0 }), fullscreen = ref(false)
const sizes = ref<{ local?: number; remote?: number }>({})
const dockBox = ref({ top: 72, bottom: 16, right: 12 })
const pipOpen = ref(true), swapped = ref(false), corner = ref<Corner>('top-right'), dragPosition = ref<{ x: number; y: number } | null>(null)
const revealing = ref(false), flipping = ref(false), freezing = ref(false), flashKey = ref(0), bumpKey = ref(0), fly = ref<{ url: string; x: number; y: number } | null>(null)
const showsResult = computed(() => phase.value === 'live' || phase.value === 'recording')
const mainRatio = computed(() => (showsResult.value ? sizes.value.remote : sizes.value.local) || sizes.value.local || aspectOf(aspect.value)!.ratio)
const pipRatio = computed(() => (swapped.value ? sizes.value.remote : sizes.value.local) || mainRatio.value)
// 舞台始终顶满可用区域：画幅与舞台接近时铺满，差得多时完整显示，可随时切换。
const stageBox = computed(() => area.value)
const fit = computed<Fit>(() => fitChoice.value || autoFit(stageBox.value.width, stageBox.value.height, mainRatio.value))
const railOpen = ref(readRail())
const railShown = computed(() => !narrow.value && Boolean(cap.value?.enabled) && !loading.value)
const pipBox = computed(() => pipSize(stageBox.value, pipRatio.value, narrow.value))
const pipInsets = computed<Insets>(() => ({ top: dockBox.value.top, right: dockBox.value.right, bottom: dockBox.value.bottom, left: railShown.value && railOpen.value ? 200 : 12 }))
const pipPoint = computed(() => dragPosition.value || cornerPosition(corner.value, stageBox.value, pipBox.value, pipInsets.value))
const stageStyle = computed(() => ({
  '--pip-x': `${pipPoint.value.x}px`, '--pip-y': `${pipPoint.value.y}px`, '--pip-w': `${pipBox.value.width}px`, '--pip-h': `${pipBox.value.height}px`,
}))
function readRail() { try { return localStorage.getItem('yuda.tryon.rail') !== '0' } catch { return true } }
function setRail(open: boolean) { railOpen.value = open; try { localStorage.setItem('yuda.tryon.rail', open ? '1' : '0') } catch { /* 只是偏好 */ } }
const aspectOptions = ASPECTS.map(a => a.value)
function readAspect(): AspectValue {
  try { const saved = localStorage.getItem(`yuda.tryon.aspect.${narrow.value ? 'camera' : 'wide'}`); if (saved && aspectOf(saved)) return saved as AspectValue } catch { /* 浏览器可能禁用存储 */ }
  return defaultAspect(narrow.value)
}
function saveAspect(value: AspectValue) { try { localStorage.setItem(`yuda.tryon.aspect.${narrow.value ? 'camera' : 'wide'}`, value) } catch { /* 只是偏好 */ } }
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// 浏览器全屏只显示全屏元素内部，弹层必须挂在里面。
const popupHost = () => body.value || document.body
function pressShutter() {
  switch (intent.value) {
    case 'open': void openCamera(); break
    case 'pick': picker.value = true; break
    case 'start': case 'accept': void begin(); break
    case 'cancel': void stop(); break
    case 'photo': void takePhoto(); break
    case 'record': void record(); break
    case 'stop-record': void finishRecording(); break
  }
}
async function changeAspect(value: string | number) {
  const next = aspectOf(String(value))
  if (!next || next.value === aspect.value || live.value || busy.value) return
  const before = aspect.value
  aspect.value = next.value; fitChoice.value = null; sizes.value = {}
  try { await camera?.setAspect(presetOf(next.value)); saveAspect(next.value) }
  catch (e) { aspect.value = before; fail(e) }
}
function toggleFit() { fitChoice.value = fit.value === 'cover' ? 'contain' : 'cover' }
function togglePip() { pipOpen.value = !pipOpen.value; if (!pipOpen.value) swapped.value = false }
async function toggleFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await body.value?.requestFullscreen?.() } catch { /* 全屏只是增强 */ }
}
function leaveFullscreen() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}) }
function measure() {
  if (stageArea.value) area.value = { width: stageArea.value.clientWidth, height: stageArea.value.clientHeight }
  const box = stage.value?.getBoundingClientRect(), bar = topbar.value?.getBoundingClientRect(), controls = dock.value?.getBoundingClientRect()
  if (!box || !bar || !controls) return
  // 手机横屏时控件在右侧，小窗避开右栏而不是底部。
  const beside = controls.height > box.height * 0.7
  dockBox.value = { top: Math.round(bar.bottom - box.top) + 4, bottom: beside ? 12 : Math.round(box.bottom - controls.top) + 8, right: beside ? Math.round(box.right - controls.left) + 8 : 12 }
}
let drag: { id: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | undefined, skipClick = false
function pipDown(event: PointerEvent) {
  const point = pipPoint.value
  drag = { id: event.pointerId, offsetX: event.clientX - point.x, offsetY: event.clientY - point.y, startX: event.clientX, startY: event.clientY, moved: false }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}
function pipMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) return
  drag.moved = true
  const x = Math.min(stageBox.value.width - pipBox.value.width, Math.max(0, event.clientX - drag.offsetX))
  const y = Math.min(stageBox.value.height - pipBox.value.height, Math.max(0, event.clientY - drag.offsetY))
  dragPosition.value = { x, y }
}
function pipUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return
  if (drag.moved && dragPosition.value) { corner.value = nearestCorner(dragPosition.value.x, dragPosition.value.y, stageBox.value, pipBox.value); skipClick = true }
  drag = undefined; dragPosition.value = null
}
function pipClick() { if (skipClick) { skipClick = false; return } swapped.value = !swapped.value }
let gesture: { x: number; y: number } | undefined, lastTap = 0
function gestureDown(event: PointerEvent) { gesture = { x: event.clientX, y: event.clientY } }
function gestureUp(event: PointerEvent) {
  if (!gesture) return
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y, swipe = swipeDirection(dx, dy); gesture = undefined
  if (swipe) { if (!recording.value && !recordingBusy.value) captureMode.value = swipe === 'left' ? '录像' : '拍照'; return }
  if (Math.hypot(dx, dy) > 12) return
  const at = performance.now()
  if (at - lastTap < 300) { lastTap = 0; toggleFit() } else lastTap = at
}
function freezeLastFrame() {
  // 结束时把最后一帧留在画面上淡出，原画回到全屏时不闪黑。
  const video = camera?.video, canvas = freezeCanvas.value
  if (!video || !canvas || disposed || calm() || swapped.value) return
  try { const size = frameCanvas(video); canvas.width = size.width; canvas.height = size.height; canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height); freezing.value = true } catch { /* 没有可冻结的画面时直接切回 */ }
}
function flyToHistory(blob: Blob) {
  const box = stage.value?.getBoundingClientRect(), target = historySlot.value?.getBoundingClientRect()
  if (!box || !target || calm()) return
  fly.value = { url: URL.createObjectURL(blob), x: target.left + target.width / 2 - box.left - box.width / 2, y: target.top + target.height / 2 - box.top - box.height / 2 }
}
function flyDone() { if (fly.value) URL.revokeObjectURL(fly.value.url); fly.value = null; bumpKey.value++ }
const pickerProps = computed(() => ({ garments: garments.value, outfits: outfits.value, selected: selected.value, temporary: temporary.value,
  blocked: queued.value || offered.value || reclaiming.value || busy.value, busyId: selectingOutfit.value, selectedOutfit: selectedOutfit.value,
  uploading: uploading.value, error: error.value, canUseLatest: canUseLatest.value, chooseUpload,
  autoRoles: Object.fromEntries((prepared.value?.items || []).map(i => [i.id, i.wearingRole])) }))
function applyPrepared(p: Prepared) {
  const chosen = new Map(selected.value.map(s => [s.id, s.role]))
  // 用户选过的位置跟着组合走；临时衣物没有分类可推，沿用服务端记下的位置（例如从历史再次试穿）。
  prepared.value = p; selected.value = p.items.map(i => ({ type: i.type, id: i.id, revision: i.revision, assetId: i.assetId, role: chosen.get(i.id) ?? (i.type === 'TEMPORARY' && i.wearingRole !== 'OTHER' ? i.wearingRole || undefined : undefined) }))
}
const selectionName = (s: Selection) => s.type === 'TEMPORARY' ? '自定义衣物' : garments.value.find(g => g.id === s.id)?.name || prepared.value?.items.find(g => g.id === s.id)?.name || '衣物'
const isSelected = (id: string) => selected.value.some(s => s.id === id)
function fail(cause: unknown) { if (!disposed) error.value = cause instanceof Error ? cause.message : '操作暂时未完成，请稍后再试。' }
async function refresh() { cap.value = await tryOnApi.capabilities(); void refreshTryOnAccess() }
let stripDone = false, stripBusy = false
async function stripMore() {
  if (stripDone || stripBusy) return
  stripBusy = true
  const before = garments.value.length
  await loadGarments(true)
  stripDone = garments.value.length === before; stripBusy = false
}
async function loadGarments(more = false) {
  try { const page = more ? garmentPage.value + 1 : 1; const request = ++garmentRequest; const rows = await tryOnApi.garments(page, search.value); if (request !== garmentRequest || disposed) return; garments.value = more ? [...garments.value, ...rows] : rows; garmentPage.value = page }
  catch (e) { fail(e) }
}
async function openCamera() {
  if (!cap.value?.enabled || !host.value || busy.value) return
  busy.value = true; busyPhase.value = '正在打开摄像头，请在浏览器提示中允许访问。'; error.value = ''
  try {
    camera ??= new TryOnCamera(host.value, () => { if (!finished(lease.value)) { frameReady.value = true; busyPhase.value = ''; void pulse() } }, cause => { fail(cause); if (live.value) void stop(true) }, stage => { startupStage.value = stage; if (live.value) { busyPhase.value = stageLabel[stage]; void pulse() } })
    camera.onSize = (source, width, height) => { sizes.value = { ...sizes.value, [source]: width / height } }
    await camera.setAspect(presetOf(aspect.value))
    await camera.open(); cameraReady.value = camera.ready
  } catch (e) { fail(e) } finally { busy.value = false; busyPhase.value = '' }
}
async function build(allowLatest = false) {
  if (!selected.value.length) throw new Error('请先选择至少一件成品衣物或临时衣物。')
  return tryOnApi.prepare(selected.value, undefined, allowLatest)
}
/** 上传发生在用户点击开始之后：选衣阶段图片不离开本站。 */
async function uploaded(id: string, p: Prepared): Promise<Prepared> { return { ...p, referencePath: (await tryOnApi.upstreamReference(id, p)).referencePath } }
async function connect(s: Session, p: Prepared) {
  if (!camera) throw new Error('请先打开摄像头。')
  busyPhase.value = '正在上传衣服参考图…'
  const ready = await uploaded(s.id, p)
  applyPrepared(ready); busyPhase.value = '正在连接实时服务…'
  await camera.start(s.id, s.environment, ready)
}
async function begin() {
  if (busy.value || preparing.value || live.value && !offered.value) return
  const attempt = ++action; busy.value = true; busyPhase.value = '正在准备所选衣物…'; error.value = ''; startupStage.value = undefined
  try {
    if (!cameraReady.value) throw new Error('请先打开摄像头。')
    let p: Prepared, s: Session
    if (offered.value && lease.value && prepared.value) { p = prepared.value; s = await tryOnApi.accept(lease.value.id) }
    else { p = await build(); applyPrepared(p); busyPhase.value = '正在申请试穿名额…'; s = await tryOnApi.start(p, crypto.randomUUID()) }
    if (attempt !== action || disposed) { emergencyStop(s.id); return }
    lease.value = s
    if (s.state === 'RESERVED') await connect(s, p)
  } catch (e) { fail(e); if (lease.value && !finished(lease.value) && !queued.value && !offered.value) await stop(true) }
  finally { if (attempt === action) { busy.value = false; if (!live.value) busyPhase.value = '' } }
}
async function pulse() {
  const current = lease.value
  if (!current || finished(current) || document.hidden || disposed) return
  if (pulseRunning) { pulseAgain = true; return }
  pulseRunning = true
  try {
    const state = reclaiming.value ? await tryOnApi.session(current.id) : await tryOnApi.pulse(current.id, frameReady.value, camera?.diagnostic)
    if (lease.value?.id !== state.id || disposed) return
    lease.value = state
    if (finished(state) || ['STOPPING', 'UNKNOWN'].includes(state.state)) {
      const ended = endedMessage(state)
      if (ended) error.value = ended
      frameReady.value = false; void finishRecording(true); await camera?.stop(); await refresh()
    }
  } catch (e) { fail(e); if (live.value && !reclaiming.value) void stop(true) }
  finally { pulseRunning = false; if (pulseAgain) { pulseAgain = false; void pulse() } }
}
/** 服务端结束原因各说各的：时长用完不是连接故障，不能让人去排查网络。 */
function endedMessage(state: Session) {
  const stage = state.diagnostic?.stage || camera?.diagnostic.stage
  switch (state.reason) {
    case 'STARTUP_TIMEOUT': case 'FIRST_FRAME_TIMEOUT': return `${stage ? stageLabel[stage] : '实时连接'}超时，连接已结束。请先排查网络或稍后重试。`
    case 'LEASE_EXPIRED': return state.firstFrame ? '本次预留的试穿时长已用完，连接已结束。今日剩余时长可在顶部查看。' : '试穿授权已过期，连接已结束，请重新开始。'
    case 'CLIENT_HEARTBEAT_TIMEOUT': return '页面与服务器失联超过 20 秒，连接已结束。请检查网络后重新开始。'
    default: return ''
  }
}
async function stop(interrupted = false) {
  action++; busy.value = false; busyPhase.value = ''; frameReady.value = false; startupStage.value = undefined
  const current = lease.value
  if (current && !finished(current)) emergencyStop(current.id)
  const work = [finishRecording(interrupted), camera?.stop()]
  if (current && !finished(current)) work.push(tryOnApi.stop(current.id).then(s => { if (!disposed && lease.value?.id === s.id) lease.value = s }).catch(fail))
  await Promise.allSettled(work)
  if (!disposed) { try { await refresh() } catch (e) { fail(e) } }
}
function background(event?: Event) {
  if (!document.hidden && event?.type !== 'pagehide') return
  if (lease.value && !finished(lease.value)) emergencyStop(lease.value.id)
  void stop(true); void camera?.release(); cameraReady.value = false
}
async function rebuild(allowLatest = false) {
  if (!generating.value || !camera || !lease.value) { prepared.value = null; return }
  const before = prepared.value, id = lease.value.id
  try {
    const p = await uploaded(id, await build(allowLatest))
    await camera.change(p)
    try { await tryOnApi.reference(id, p); applyPrepared(p) }
    catch (e) { if (before) await camera.change(before); throw e }
  } catch (e) { fail(e) }
}
function toggle(item: Selection) {
  if (busy.value || preparing.value || reclaiming.value || queued.value || offered.value) return
  error.value = ''; pendingOutfit.value = null; selectedOutfit.value = null
  selected.value = isSelected(item.id) ? selected.value.filter(s => s.id !== item.id) : [...selected.value, item]
  clearTimeout(rebuildTimer)
  if (generating.value) {
    if (!selected.value.length) { void stop(); return }
    rebuildTimer = window.setTimeout(() => { void rebuild() }, 300)
  } else prepared.value = null
}
function setRole(id: string, role: string | undefined) {
  if (busy.value || preparing.value || reclaiming.value || queued.value || offered.value) return
  selected.value = selected.value.map(s => s.id === id ? { ...s, role } : s)
  temporary.value = temporary.value.map(t => t.id === id ? { ...t, role } : t)
  clearTimeout(rebuildTimer)
  if (generating.value) rebuildTimer = window.setTimeout(() => { void rebuild() }, 300)
  else prepared.value = null
}
async function closeCamera() {
  // 关相机先结束付费连接，再释放摄像头；已选衣物保留，可随时重新打开。
  if (busy.value || recordingBusy.value) return
  if (live.value) await stop()
  await camera?.release(); cameraReady.value = false; frameReady.value = false; fitChoice.value = null; sizes.value = {}
}
async function selectOutfit(id: string, allowLatest = false) {
  if (busy.value || preparing.value || queued.value || offered.value || reclaiming.value) return
  preparing.value = true; selectingOutfit.value = id; pendingOutfit.value = id; error.value = ''
  const before = prepared.value
  try {
    let p = await tryOnApi.prepare([], id, allowLatest)
    if (disposed) return
    if (generating.value && camera && lease.value) {
      p = await uploaded(lease.value.id, p)
      await camera.change(p)
      try { await tryOnApi.reference(lease.value.id, p) } catch (e) { if (before) await camera.change(before); throw e }
    }
    applyPrepared(p); selectedOutfit.value = id; pendingOutfit.value = null
    message.success(`已选择「${outfits.value.find(o => o.id === id)?.name || '搭配'}」，共 ${p.items.length} 件。`)
  } catch (e) { fail(e) } finally { preparing.value = false; selectingOutfit.value = null }
}
async function chooseUpload(file: File) { leaveFullscreen(); await stop(); importRole.value = undefined; importChoice.value = file; return false }
async function uploadTemporary() {
  const file = importChoice.value; if (!file) return
  uploading.value = true; error.value = ''
  const role = importRole.value; if (!role) return
  try { const item = await tryOnApi.upload(file); temporary.value.push({ ...item, role }); selected.value.push({ type: 'TEMPORARY', id: item.id, role }); prepared.value = null; importChoice.value = null; message.success('已加入当前页面，七天后删除。') }
  catch (e) { fail(e) } finally { uploading.value = false }
}
async function importGarment() {
  const file = importChoice.value; if (!file) return
  // Explicit intake handoff, consumed once by the existing upload page. No garment/model call before this choice.
  const { setTryOnIntake } = await import('../tryon/intake')
  setTryOnIntake(file); importChoice.value = null; await router.push('/add?from=tryon')
}
async function takePhoto() {
  if (!generating.value || !camera?.video || !lease.value) return
  flashKey.value++; playSound('tick'); navigator.vibrate?.(12)
  try { const blob = await photo(camera.video); flyToHistory(blob); const item = await tryOnApi.photo(lease.value.id, blob); media.value.unshift(item); message.success('照片已保存到当前账号。') } catch (e) { fail(e) }
}
async function record(withoutAudio = false) {
  if (!generating.value || !camera?.video || !lease.value || !cap.value || recordingBusy.value || recording.value) return
  recordingBusy.value = true; recordingError.value = ''; let mic: MediaStream | undefined
  try {
    if (!withoutAudio) {
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }) }
      catch (e) { microphoneError.value = e instanceof Error ? e.message : '麦克风权限未获得。'; silentChoice.value = true; return }
    }
    if (!generating.value || document.hidden || disposed) { mic?.getTracks().forEach(t => t.stop()); return }
    const track = mic?.getAudioTracks()[0]
    if (track) track.onended = () => { recordingError.value = '麦克风已断开，已结束当前片段。'; void finishRecording(true) }
    const next = await startRecording(camera.video, lease.value.id, cap.value.limits, mic,
      (seconds, bytes) => { recordingSeconds.value = seconds; uploadedBytes.value = bytes },
      () => { void finishRecording() },
      e => { recordingError.value = e.message; void finishRecording(true) })
    if (disposed || document.hidden || !generating.value) { await next.stop(true); return }
    recorder = next; recording.value = true
  } catch (e) { mic?.getTracks().forEach(t => t.stop()); recordingError.value = e instanceof Error ? e.message : '录像暂不可用。' }
  finally { recordingBusy.value = false }
}
async function finishRecording(interrupted = false) {
  const current = recorder; if (!current) return
  recorder = undefined; recording.value = false; recordingBusy.value = true
  try { const item = await current.stop(interrupted); if (!disposed) { media.value.unshift(item); message.success(interrupted ? '已保存可恢复的录像片段。' : '录像已保存。') } }
  catch (e) { if (!disposed) recordingError.value = `${e instanceof Error ? e.message : '保存未完成。'} 已上传片段会继续保留，请在历史查看。` }
  finally { if (!disposed) recordingBusy.value = false }
}
async function switchCamera() {
  if (recording.value || recordingBusy.value || busy.value || flipping.value) return
  flipping.value = true
  try { await camera?.switchCamera() } catch (e) { fail(e) }
  finally { window.setTimeout(() => { flipping.value = false }, calm() ? 0 : 420) }
}
async function openHistory() {
  leaveFullscreen(); await stop(); historyOpen.value = true; historyBusy.value = true
  try { const result = await tryOnApi.history(); media.value = result.media; sessionHistory.value = result.sessions; historyPage.value = 1 }
  catch (e) { fail(e) } finally { historyBusy.value = false }
}
async function moreHistory() { historyBusy.value = true; try { const page = historyPage.value + 1, result = await tryOnApi.history(page); media.value.push(...result.media); historyPage.value = page } catch (e) { fail(e) } finally { historyBusy.value = false } }
function remove(item: Media) { modal.confirm({ title: '删除这份拍摄结果？', content: '删除后将立即撤销访问，其他拍摄结果保留。', okText: '删除结果', cancelText: '保留', okButtonProps: { danger: true }, async onOk() { await tryOnApi.remove(item.id); media.value = media.value.filter(m => m.id !== item.id) } }) }
async function repeat(item: Media) {
  try { const items = await tryOnApi.repeatItems(item.id); selected.value = items.map(i => ({ type: i.type, id: i.id, revision: i.revision, assetId: i.assetId })); historyOpen.value = false } catch (e) { fail(e); return }
  try { const p = await tryOnApi.repeat(item.id); applyPrepared(p); historyOpen.value = false; error.value = ''; message.info('组合已恢复，请打开相机后主动开始。') }
  catch (e) { fail(e); message.warning('素材可能已更新或临时衣物已过期，请重新选择。') }
}
async function latest() {
  if (latestBusy.value || preparing.value) return
  latestBusy.value = true
  try {
    if (pendingOutfit.value) await selectOutfit(pendingOutfit.value, true)
    else if (generating.value) await rebuild(true)
    else { const p = await build(true); applyPrepared(p); error.value = ''; message.success('已换成最新成品，所选衣物已保留。') }
  } catch (e) { fail(e) } finally { latestBusy.value = false }
}
watch(phase, (next, before) => {
  if ((next === 'live' && before !== 'recording') && !revealing.value) {
    revealing.value = true; playSound('success'); navigator.vibrate?.(18)
    window.setTimeout(() => { revealing.value = false }, calm() ? 0 : 1300)
  }
  if (next !== 'live' && next !== 'recording') { swapped.value = false; pipOpen.value = true }
  void nextTick(measure)
})
watch(frameReady, ready => { if (!ready) freezeLastFrame() }, { flush: 'sync' })
watch(silentChoice, open => { if (open) leaveFullscreen() })
watch(search, () => { stripDone = false; clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void loadGarments() }, 250) })
const stateName = (state: string) => ({ QUEUED:'排队中', OFFERED:'等待确认', RESERVED:'已授权', SIGNING:'申请连接', CONNECTING:'连接中', WAITING_FRAME:'等待画面', GENERATING:'试穿中', STOPPING:'结束中', UNKNOWN:'消耗待核对', CLOSED:'已结束', FAILED:'启动失败', CANCELLED:'已取消' }[state] || '待核对')
const offAccount = onAccountChange(() => { if (accountIsStale()) { background(); void stop(true); void camera?.dispose() } })
onMounted(async () => {
  try {
    await refresh()
    if (cap.value?.enabled) { await Promise.all([loadGarments(), tryOnApi.outfits().then(rows => { outfits.value = rows })]); if (typeof route.query.garment === 'string') { const g = garments.value.find(g => g.id === route.query.garment) || await tryOnApi.garment(route.query.garment); if (!garments.value.some(v => v.id === g.id)) garments.value.unshift(g); if (g?.ready) selected.value = [{ type: 'GARMENT', id: g.id, revision: g.revision, assetId: g.assetId }]; else error.value = '该衣物尚无可用成品，请完成处理后再试。' }
      if (typeof route.query.outfit === 'string') await selectOutfit(route.query.outfit)
    }
    const history = await tryOnApi.history(); media.value = history.media; sessionHistory.value = history.sessions
    lease.value = history.sessions.find(s => !finished(s)) || null
    if (lease.value && !finished(lease.value)) await stop(true)
    if (route.query.history) await openHistory()
  } catch (e) { fail(e) } finally { loading.value = false }
  pulseTimer = window.setInterval(() => { void pulse() }, 5000); clockTimer = window.setInterval(() => { now.value = Date.now() }, 500)
  document.addEventListener('visibilitychange', background); window.addEventListener('pagehide', background)
})
const layoutQuery = window.matchMedia(CAMERA_LAYOUT_QUERY), syncNarrow = () => { narrow.value = layoutQuery.matches; void nextTick(measure) }, syncFullscreen = () => { fullscreen.value = Boolean(document.fullscreenElement) }
let layoutObserver: ResizeObserver | undefined
onMounted(() => {
  layoutObserver = new ResizeObserver(measure)
  for (const el of [stageArea.value, stage.value, dock.value, topbar.value]) if (el) layoutObserver.observe(el)
  measure(); layoutQuery.addEventListener('change', syncNarrow); document.addEventListener('fullscreenchange', syncFullscreen)
})
onBeforeUnmount(() => { disposed = true; action++; layoutObserver?.disconnect(); layoutQuery.removeEventListener('change', syncNarrow); document.removeEventListener('fullscreenchange', syncFullscreen); flyDone(); offAccount(); clearInterval(pulseTimer); clearInterval(clockTimer); clearTimeout(rebuildTimer); clearTimeout(searchTimer); document.removeEventListener('visibilitychange', background); window.removeEventListener('pagehide', background); if (lease.value && !finished(lease.value)) emergencyStop(lease.value.id); void finishRecording(true); void camera?.dispose() })
</script>

<template>
  <section class="tryon-page" :class="`phase-${phase}`">
    <div ref="body" class="tryon-body">
      <div ref="stageArea" class="tryon-stage-area">
        <div ref="stage" class="tryon-stage" :class="[`fit-${fit}`, { 'is-pip': showsResult, 'is-swapped': swapped, 'pip-off': !pipOpen, 'is-dragging': !!dragPosition, 'is-revealing': revealing, 'is-flipping': flipping, 'is-working': phase === 'connecting' || phase === 'queued', 'camera-on': cameraReady, 'is-cover': !cameraReady }]" :style="stageStyle">
          <div ref="host" class="tryon-video-host" aria-label="摄像头与试穿画面"></div>
          <canvas v-show="freezing" ref="freezeCanvas" class="tryon-freeze" aria-hidden="true" @animationend="freezing = false"></canvas>
          <div v-if="cameraReady" class="tryon-gesture" aria-hidden="true" @pointerdown="gestureDown" @pointerup="gestureUp" @pointercancel="gesture = undefined"></div>

          <div class="tryon-viewfinder" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="tryon-scan"></span></div>
          <span v-if="revealing" class="tryon-sweep" aria-hidden="true"></span>
          <span v-if="flashKey" :key="flashKey" class="tryon-flash" aria-hidden="true"></span>
          <img v-if="fly" class="tryon-fly" :src="fly.url" alt="" :style="{ '--fly-x': `${fly.x}px`, '--fly-y': `${fly.y}px` }" @animationend="flyDone" />

          <a-button v-if="showsResult && pipOpen" class="tryon-pip-hit" type="text" :aria-label="swapped ? '切回试穿画面为主画面，可拖动' : '切换原画为主画面，可拖动'" @pointerdown="pipDown" @pointermove="pipMove" @pointerup="pipUp" @pointercancel="pipUp" @click="pipClick"><span class="tryon-pip-tag">{{ swapped ? '试穿效果' : '原画' }}</span></a-button>

          <Transition name="tryon-iris">
            <div v-if="!cameraReady" class="tryon-stage-cover">
              <span class="tryon-cover-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
              <a-spin v-if="loading" size="large" />
              <div v-else class="tryon-cover-body">
                <span class="tryon-camera-symbol" aria-hidden="true"><CameraOutlined /></span>
                <h2>{{ cap?.enabled ? '把衣柜穿在身上' : '实时试穿暂未开通' }}</h2>
                <ol v-if="cap?.enabled" class="tryon-cover-steps">
                  <li :class="{ done: selected.length > 0 }"><b>1</b>选衣物</li>
                  <li><b>2</b>相机预览 · 免费</li>
                  <li><b>3</b>开始试穿 · 计时</li>
                </ol>
                <p v-else>由管理员开通，你仍可查看已保存的拍摄结果。</p>
                <div class="tryon-cover-actions">
                  <a-button v-if="cap?.enabled" type="primary" size="large" :loading="busy" @click="openCamera"><template #icon><CameraOutlined /></template>{{ busy ? '正在打开相机' : '打开相机' }}</a-button>
                  <a-button size="large" @click="openHistory"><template #icon><PictureOutlined /></template>拍摄历史</a-button>
                </div>
              </div>
            </div>
          </Transition>

          <header ref="topbar" class="tryon-topbar">
            <a-button type="text" class="camera-tool" aria-label="返回衣柜" @click="router.push('/wardrobe')"><LeftOutlined /></a-button>
            <div class="tryon-status" :class="{ live: showsResult, waiting: phase === 'connecting' || phase === 'queued' || phase === 'offered' || phase === 'stopping' }"><i></i><span>{{ status }}</span></div>
            <div class="tryon-tools">
              <a-button v-if="showsResult" type="text" class="camera-tool" :aria-label="pipOpen ? '隐藏原画小窗' : '显示原画小窗'" :aria-pressed="pipOpen" @click="togglePip"><EyeOutlined v-if="pipOpen" /><EyeInvisibleOutlined v-else /></a-button>
              <a-popover v-else-if="phase === 'preview' || phase === 'cover'" trigger="click" placement="bottomRight" title="画面比例" :get-popup-container="popupHost"><template #content><a-segmented :value="aspect" :options="aspectOptions" @change="changeAspect" /><p class="tryon-info-copy">拍全身用 9:16 或 3:4。切换免费，开始后固定。</p></template><a-button type="text" class="camera-tool tryon-aspect" :aria-label="`画面比例 ${aspect}`">{{ aspect }}</a-button></a-popover>
              <a-tooltip v-if="cameraReady" :title="live ? '结束试穿并关闭相机' : '关闭相机'" placement="bottom" :get-popup-container="popupHost"><a-button type="text" class="camera-tool" :aria-label="live ? '结束试穿并关闭相机' : '关闭相机'" :disabled="busy || recordingBusy" @click="closeCamera"><PoweroffOutlined /></a-button></a-tooltip>
              <a-tooltip v-if="cameraReady" :title="fit === 'cover' ? '完整显示画面' : '铺满取景框'" placement="bottom" :get-popup-container="popupHost"><a-button type="text" class="camera-tool" :aria-label="fit === 'cover' ? '完整显示画面' : '铺满取景框'" @click="toggleFit"><BorderOutlined v-if="fit === 'cover'" /><ColumnWidthOutlined v-else /></a-button></a-tooltip>
              <a-button v-if="!narrow && cameraReady" type="text" class="camera-tool" :aria-label="fullscreen ? '退出全屏' : '全屏试穿'" @click="toggleFullscreen"><CompressOutlined v-if="fullscreen" /><ExpandOutlined v-else /></a-button>
              <a-popover title="试穿与拍摄说明" placement="bottomRight" :get-popup-container="popupHost"><template #content><p class="tryon-info-copy">打开相机只做本地预览。点击开始后，视频与服装参考图会发送至 XMax，连接后按时长消耗额度。录像声音仅用于本地混录。切后台会结束试穿，未上传的最后片段可能丢失。</p><p class="tryon-info-copy">点小窗互换主画面，拖动可换位置；左右滑动切换拍照和录像，手机上双击切换铺满。无论看哪个画面，保存的都是试穿效果。</p></template><a-button type="text" class="camera-tool" aria-label="查看试穿说明"><InfoCircleOutlined /></a-button></a-popover>
            </div>
          </header>

          <div v-if="railShown" class="tryon-rail-slot">
            <TryOnFilmstrip :open="railOpen" :garments="garments" :outfits="outfits" :selected="selected" :selected-outfit="selectedOutfit" :blocked="pickerProps.blocked" :busy-id="selectingOutfit" :title="selectionTitle" @update:open="setRail" @toggle="toggle" @outfit="selectOutfit" @more="stripMore" @all="picker = true" @upload="tab = '临时上传'; picker = true" />
          </div>

          <Transition name="tryon-fade"><div v-if="recording" class="tryon-recording-status" role="status"><i></i>REC {{ duration(recordingSeconds) }}<small>已上传 {{ (uploadedBytes / 1024).toFixed(0) }} KiB</small></div></Transition>

          <div ref="dock" class="tryon-dock" :class="{ 'is-loading': loading }">
            <div class="tryon-notice-area" aria-live="polite">
              <Transition name="tryon-rise" mode="out-in">
                <div v-if="notice === 'error'" key="error" class="tryon-notice is-error" role="alert"><p>{{ error }}</p><a-button v-if="canUseLatest" size="small" :loading="latestBusy" @click="latest">使用最新成品</a-button><a-button v-else type="text" size="small" @click="error=''">收起</a-button></div>
                <div v-else-if="notice === 'connecting'" key="connecting" class="tryon-notice is-progress" role="status">
                  <strong><LoadingOutlined spin /> {{ busyPhase || '等待第一帧试穿效果' }}</strong>
                  <ol class="tryon-steps"><li v-for="(step, index) in CONNECT_STEPS" :key="step" :class="{ done: index < stepIndex, current: index === stepIndex }"><i></i><span>{{ step }}</span></li></ol>
                  <small>{{ lease ? '请保持人在画面中，超时会自动结束。' : '选好的衣物正在核对，还未开始计时。' }}</small>
                </div>
                <div v-else-if="notice === 'queued'" key="queued" class="tryon-notice" role="status"><strong>正在排队</strong><small>排队不计费，轮到你时需要再点一次开始。</small></div>
                <div v-else-if="notice === 'offered'" key="offered" class="tryon-notice is-offer" role="status"><strong>轮到你了</strong><small>名额保留 {{ waitSeconds }} 秒，点快门连接实时服务。</small></div>
                <div v-else-if="notice === 'stopping'" key="stopping" class="tryon-notice" role="status"><strong><LoadingOutlined spin /> 正在结束并核对消耗</strong><small>核对完成后会释放未使用的预留额度。</small></div>
                <p v-else :key="`hint-${swapped}`" class="tryon-start-hint" :class="{ active: showsResult }" role="status">{{ swapped ? '正在看原画，拍摄仍保存试穿效果。' : !cap?.ready && !live && cap?.enabled ? cap.reason : startHint }}</p>
              </Transition>
              <a-alert v-if="recordingError" class="tryon-recording-error" type="warning" show-icon :message="recordingError" closable @close="recordingError=''" />
            </div>

            <div class="tryon-controls">
              <div class="tryon-selection-row">
                <a-button v-if="cap?.enabled" class="tryon-current" :aria-label="`选择试穿衣物，${selected.length}件已选`" @click="picker=true">
                  <img v-if="prepared" class="tryon-current-image" :src="mediaUrl(prepared.previewUrl)" alt="当前试穿衣物组合" />
                  <OutfitThumbnail v-else-if="chosenOutfit" class="tryon-current-image" :scene="chosenOutfit.scene" :title="chosenOutfit.name" />
                  <span v-else class="tryon-current-placeholder"><PlusOutlined /></span>
                  <span class="tryon-current-copy"><strong>{{ selectionTitle }}</strong><small>{{ selected.length ? selectionSummary : '衣柜、搭配或临时上传' }}</small></span>
                  <RightOutlined class="tryon-current-arrow" />
                </a-button>
                <Transition name="tryon-fade"><a-button v-if="showsResult || phase === 'offered'" class="tryon-end" danger @click="stop()">{{ phase === 'offered' ? '放弃' : '结束试穿' }}</a-button></Transition>
              </div>
              <div class="tryon-mode"><a-segmented v-model:value="captureMode" :options="['拍照','录像']" :disabled="recording || recordingBusy" /></div>
              <div ref="historySlot" class="tryon-slot-history"><a-button :key="bumpKey" class="tryon-history-thumb" :class="{ bump: bumpKey }" aria-label="查看拍摄历史" @click="openHistory"><img v-if="captureImage" :src="mediaUrl(captureImage.url)" alt="最近拍摄的试穿照片" /><PictureOutlined v-else /></a-button></div>
              <TryOnShutter class="tryon-slot-shutter" :intent="intent" :label="shutterLabel" :text="shutterText" :progress="shutterProgress" :busy="recordingBusy || busy && intent === 'open' || intent === 'start' && busy" @press="pressShutter" />
              <div class="tryon-slot-flip"><a-button class="tryon-flip" shape="circle" :disabled="recording || recordingBusy || busy || !cameraReady" aria-label="切换前后摄像头" @click="switchCamera"><SwapOutlined /></a-button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <a-drawer v-model:open="picker" title="选择试穿衣物" :placement="narrow ? 'bottom' : 'right'" height="min(76dvh, 760px)" :width="420" :mask="narrow" :get-container="popupHost" root-class-name="tryon-material-drawer"><p v-if="generating" class="tryon-paid-notice">选衣期间仍在计时 · {{ duration(remaining) }} <a-button size="small" danger @click="stop()">停止试穿</a-button></p><TryOnPicker v-bind="pickerProps" v-model:search="search" v-model:tab="tab" :popup-host="popupHost" @toggle="toggle" @outfit="selectOutfit" @more="loadGarments(true)" @latest="latest" @role="setRole" /><template #footer><div class="tryon-picker-footer"><span>{{ selected.length ? `已选 ${selected.length} 件衣物` : '尚未选择衣物' }}</span><a-button type="primary" :disabled="preparing" @click="picker=false">{{ selected.length ? '选好了，返回相机' : '返回相机' }}</a-button></div></template></a-drawer>
    <a-drawer v-model:open="historyOpen" title="拍摄历史" placement="right" :width="'min(100vw, 620px)'"><a-alert type="info" show-icon message="历史查看期间已停止实时连接。" /><a-segmented v-model:value="historyFilter" :options="['全部','照片','视频']" block /><a-spin :spinning="historyBusy"><a-empty v-if="!visibleMedia.length" description="主动拍摄的照片和录像会保存在这里" /><article v-for="item in visibleMedia" :key="item.id" class="tryon-history-item"><MediaPreview v-if="item.type==='VIDEO' && ['READY','PARTIAL'].includes(item.state)" :src="mediaUrl(item.url)" :duration-ms="item.durationMs" /><img v-else-if="item.type==='PHOTO'" :src="mediaUrl(item.url)" alt="AI试穿效果" /><div v-else class="tryon-pending-media">{{ item.state === 'UNRECOVERABLE' ? '片段不足以恢复录像，可删除释放空间' : '分段已上传，正在恢复可用片段' }}</div><div><strong>{{ item.type==='PHOTO' ? '试穿照片' : `${item.state==='PARTIAL'?'中断片段':'录像'} · ${duration(item.durationMs/1000)}` }}</strong><p>{{ new Date(item.createdAtMs).toLocaleString() }} <template v-if="item.type==='VIDEO'"> · {{ item.hasAudio?'有声':'无声' }} · {{ item.mimeType.split('/')[1]?.toUpperCase() }}</template></p><div class="tryon-history-actions"><a-button :href="mediaUrl(item.downloadUrl)" :disabled="!['READY','PARTIAL'].includes(item.state)"><DownloadOutlined /> 下载</a-button><a-button v-if="cap?.enabled" @click="repeat(item)">再次试穿</a-button><a-button type="text" danger aria-label="删除结果" @click="remove(item)"><DeleteOutlined /></a-button></div></div></article><a-button block :loading="historyBusy" @click="moreHistory">加载更多结果</a-button><a-collapse v-if="sessionHistory.length" ghost><a-collapse-panel key="sessions" header="查看会话与用量记录"><p v-for="s in sessionHistory" :key="s.id" class="tryon-session-history">{{ new Date(s.createdAtMs).toLocaleString() }} · {{ stateName(s.state) }} · {{ duration(s.userSeconds) }}</p></a-collapse-panel></a-collapse></a-spin></a-drawer>
    <a-modal :open="!!importChoice" title="这件衣物是否入柜？" :footer="null" @cancel="importChoice=null"><p>入柜会进入现有衣物处理流程。仅试穿不会自动识图或生图，离开页面后不恢复。</p><p class="tryon-import-label">仅试穿时，这件衣物戴在或穿在哪里？</p><a-select v-model:value="importRole" class="tryon-import-role" show-search option-filter-prop="label" :options="WEAR_GROUPS" placeholder="选择穿戴位置，例如头饰、手表、手持物" /><div class="tryon-modal-actions"><a-button :loading="uploading" :disabled="!importRole" @click="uploadTemporary">仅当前页面试穿</a-button><a-button type="primary" @click="importGarment">进入入柜流程</a-button></div></a-modal>
    <a-modal v-model:open="silentChoice" title="麦克风暂不可用" :footer="null"><p>{{ microphoneError }}</p><div class="tryon-modal-actions"><a-button @click="silentChoice=false; record(true)">继续无声录像</a-button><a-button type="primary" @click="silentChoice=false; record()">重新申请麦克风</a-button></div></a-modal>
  </section>
</template>

<style scoped>
/* 舞台：顶满外壳留下的整块区域（外壳在试穿页收起侧栏、隐藏顶栏），控件和衣物栏都浮在舞台内，全屏时不丢。 */
.tryon-page {
  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --tryon-reserve: 0px;
  height: calc(100dvh - var(--tryon-reserve));
  min-height: 460px;
  touch-action: manipulation;
}
.tryon-body { height: 100%; min-height: 0; }
.tryon-body:fullscreen { background: #000; }
.tryon-stage-area { position: relative; height: 100%; min-width: 0; min-height: 0; }
/* 画面上的控件用一组变量着色：相机画面上是白字与毛玻璃，未开相机的浅色封面上换成站点墨色。 */
.tryon-stage {
  --cam-fg: #fff;
  --cam-soft: #ffffffd9;
  --cam-glass: #ffffff26;
  --cam-glass-hover: #ffffff40;
  --cam-edge: #ffffffb3;
  --cam-pill: #10171499;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  isolation: isolate;
}
.tryon-stage.is-cover {
  --cam-fg: var(--ink);
  --cam-soft: var(--muted-strong);
  --cam-glass: var(--surface-alt);
  --cam-glass-hover: var(--selection-bg);
  --cam-edge: var(--line);
  --cam-pill: var(--surface-alt);
  background: var(--paper);
}
.tryon-video-host { position: absolute; inset: 0; z-index: 0; isolation: isolate; }
.camera-on .tryon-video-host { animation: tryon-lens-open .7s var(--ease-out); }
.is-flipping .tryon-video-host { animation: tryon-flip .42s ease-in-out; }
.tryon-gesture { position: absolute; inset: 0; z-index: 4; touch-action: none; }
.tryon-freeze { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; object-fit: contain; animation: tryon-fade-out .55s ease forwards; }
.fit-cover .tryon-freeze { object-fit: cover; }

/* 两路画面：原画先占满，首帧到达后飞进小窗，露出下方的试穿画面。 */
.tryon-video-host :deep(.tryon-local),
.tryon-video-host :deep(.tryon-remote) {
  position: absolute !important;
  inset: auto !important;
  left: 0 !important;
  top: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden;
  transition: left .72s var(--ease-out), top .72s var(--ease-out), width .72s var(--ease-out), height .72s var(--ease-out), border-radius .72s var(--ease-out), box-shadow .72s ease, opacity .3s ease, transform .3s ease, filter .5s ease;
}
.tryon-video-host :deep(.tryon-local) { z-index: 3; }
.tryon-video-host :deep(.tryon-remote) { z-index: 1; visibility: hidden; }
.tryon-video-host.has-result :deep(.tryon-remote) { visibility: visible; }
.tryon-video-host :deep(video) { object-fit: contain !important; }
.fit-cover .tryon-video-host :deep(video) { object-fit: cover !important; }

.is-working .tryon-video-host :deep(.tryon-local) { filter: saturate(.7) brightness(.82); }
.is-revealing .tryon-video-host :deep(.tryon-remote) { animation: tryon-develop 1.1s var(--ease-out); }

.is-pip:not(.is-swapped) .tryon-video-host :deep(.tryon-local),
.is-pip.is-swapped .tryon-video-host :deep(.tryon-remote) {
  left: var(--pip-x) !important;
  top: var(--pip-y) !important;
  width: var(--pip-w) !important;
  height: var(--pip-h) !important;
  z-index: 5;
  border-radius: 14px;
  box-shadow: 0 0 0 2px #ffffffd9, 0 10px 28px #0007;
}
.is-pip:not(.is-swapped) .tryon-video-host :deep(.tryon-local video),
.is-pip.is-swapped .tryon-video-host :deep(.tryon-remote video) { object-fit: cover !important; }
.is-pip.is-swapped .tryon-video-host :deep(.tryon-local) { z-index: 1; }
.is-pip.pip-off .tryon-video-host :deep(.tryon-local) { opacity: 0; transform: scale(.6); }
.is-dragging .tryon-video-host :deep(.tryon-local),
.is-dragging .tryon-video-host :deep(.tryon-remote) { transition: none; }

.tryon-pip-hit.ant-btn {
  position: absolute;
  left: var(--pip-x);
  top: var(--pip-y);
  z-index: 6;
  width: var(--pip-w);
  height: var(--pip-h);
  padding: 0;
  background: transparent;
  border-radius: 14px;
  cursor: grab;
  touch-action: none;
  animation: tryon-fade-in .4s ease .45s backwards;
  transition: left .72s var(--ease-out), top .72s var(--ease-out), width .72s var(--ease-out), height .72s var(--ease-out);
}
.tryon-pip-hit.ant-btn:hover { background: transparent; }
.tryon-pip-hit.ant-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.is-dragging .tryon-pip-hit.ant-btn { transition: none; cursor: grabbing; }
.tryon-pip-tag { position: absolute; left: 6px; bottom: 6px; padding: 2px 6px; font-size: 11px; line-height: 1.4; color: #fff; background: #0009; border-radius: 6px; }

/* 取景框与连接扫描：只在连接和排队时出现。 */
.tryon-viewfinder { position: absolute; inset: 12% 9% 30%; z-index: 4; pointer-events: none; opacity: 0; transition: opacity .4s ease; }
.is-working .tryon-viewfinder { opacity: 1; }
.tryon-viewfinder i { position: absolute; width: 26px; height: 26px; border: 2px solid #ffffffd9; }
.tryon-viewfinder i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; border-radius: 8px 0 0; }
.tryon-viewfinder i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; border-radius: 0 8px 0 0; }
.tryon-viewfinder i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; border-radius: 0 0 0 8px; }
.tryon-viewfinder i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; border-radius: 0 0 8px; }
.tryon-scan { position: absolute; left: 0; right: 0; top: 0; height: 2px; background: linear-gradient(90deg, #9fe8c300, #9fe8c3, #9fe8c300); box-shadow: 0 0 18px 4px #9fe8c366; animation: tryon-scan 2.2s ease-in-out infinite alternate; }
.tryon-sweep { position: absolute; inset: 0; z-index: 4; pointer-events: none; background: linear-gradient(180deg, #9fe8c300 0, #9fe8c344 46%, #ffffffcc 50%, #9fe8c344 54%, #9fe8c300 100%); background-size: 100% 240%; animation: tryon-sweep 1.1s var(--ease-out) forwards; }
.tryon-flash { position: absolute; inset: 0; z-index: 7; pointer-events: none; background: #fff; opacity: 0; animation: tryon-flash .32s ease-out; }
.tryon-fly { position: absolute; left: 50%; top: 50%; z-index: 8; width: 46%; max-height: 60%; object-fit: contain; pointer-events: none; border: 3px solid #fff; border-radius: 10px; transform: translate(-50%, -50%); animation: tryon-fly .68s var(--ease-out) .1s forwards; }

/* 封面：未开相机时用站点浅色底与细取景角，不再铺深绿渐变。 */
.tryon-stage-cover { position: absolute; inset: 0; z-index: 9; display: grid; place-items: center; padding: 72px 28px 132px; color: var(--ink); text-align: center; background: var(--paper); }
.tryon-cover-frame { position: absolute; inset: 72px max(24px, 6%) 112px; pointer-events: none; }
.tryon-cover-frame i { position: absolute; width: 28px; height: 28px; border: 1.5px solid var(--line); }
.tryon-cover-frame i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; border-radius: 10px 0 0; }
.tryon-cover-frame i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; border-radius: 0 10px 0 0; }
.tryon-cover-frame i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; border-radius: 0 0 0 10px; }
.tryon-cover-frame i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; border-radius: 0 0 10px; }
.tryon-cover-body { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; max-width: 420px; }
.tryon-camera-symbol { display: grid; place-items: center; width: 64px; height: 64px; font-size: 26px; color: var(--accent); background: var(--accent-soft); border-radius: 50%; }
.tryon-stage-cover h2 { margin: 6px 0 0; font-size: 22px; font-weight: 600; letter-spacing: .02em; }
.tryon-stage-cover p { max-width: 32ch; margin: 0; line-height: 1.8; color: var(--muted-strong); }
.tryon-cover-steps { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; margin: 0; padding: 0; font-size: 13px; color: var(--muted-strong); list-style: none; }
.tryon-cover-steps li { display: flex; align-items: center; gap: 6px; }
.tryon-cover-steps b { display: grid; place-items: center; width: 18px; height: 18px; font-size: 11px; font-weight: 600; color: var(--muted-strong); background: var(--surface-alt); border: 1px solid var(--line); border-radius: 50%; }
.tryon-cover-steps .done { color: var(--accent); }
.tryon-cover-steps .done b { color: #fff; background: var(--accent); border-color: var(--accent); }
.tryon-cover-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 10px; }
.tryon-cover-actions .ant-btn { min-height: 44px; padding-inline: 22px; }
.is-cover .tryon-slot-history { visibility: hidden; }

/* 桌面衣物栏：贴舞台左侧，避开顶栏与底部快门。 */
.tryon-rail-slot { position: absolute; left: 16px; top: 68px; bottom: 116px; z-index: 11; display: flex; align-items: flex-start; pointer-events: none; }
.tryon-rail-slot > * { pointer-events: auto; }

/* 顶栏 */
.tryon-topbar { position: absolute; left: 0; right: 0; top: 0; z-index: 10; display: flex; align-items: center; gap: 6px; padding: 10px 10px 24px; pointer-events: none; background: linear-gradient(180deg, #0009, #0000); }
.tryon-topbar > *, .tryon-tools > * { pointer-events: auto; }
.tryon-tools { display: flex; align-items: center; margin-left: auto; }
.camera-tool.ant-btn { flex: none; width: 44px; height: 44px; padding: 0; font-size: 19px; color: var(--cam-fg); }
.camera-tool.ant-btn:hover, .camera-tool.ant-btn:focus-visible { color: var(--cam-fg); background: var(--cam-glass); }
.tryon-aspect.ant-btn { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tryon-status { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 7px 12px; font-size: 12px; line-height: 1.5; color: var(--cam-fg); font-variant-numeric: tabular-nums; white-space: nowrap; background: var(--cam-pill); border-radius: 20px; backdrop-filter: blur(10px); }
.tryon-status span { overflow: hidden; text-overflow: ellipsis; }
.tryon-status i { flex: none; width: 7px; height: 7px; background: var(--muted-subtle); border-radius: 50%; transition: background .3s ease; }
.tryon-status.live i { background: #7fe3a6; animation: tryon-pulse 1.6s ease-in-out infinite; }
.tryon-status.waiting i { background: #f2d28b; animation: tryon-pulse 1s ease-in-out infinite; }
.tryon-recording-status { position: absolute; left: 12px; top: 66px; z-index: 10; padding: 6px 10px; font-size: 12px; color: #ffd9d2; font-variant-numeric: tabular-nums; background: #261511cc; border-radius: 8px; }
.tryon-recording-status i { display: inline-block; width: 8px; height: 8px; margin-right: 7px; background: #ff5a4e; border-radius: 50%; animation: tryon-pulse 1s ease-in-out infinite; }
.tryon-recording-status small { display: block; margin-top: 2px; font-size: 11px; color: #f6d9d1; }

/* 底部控件 */
.tryon-dock { position: absolute; left: 0; right: 0; bottom: 0; z-index: 10; display: flex; flex-direction: column; gap: 8px; padding: 36px 20px 14px; background: linear-gradient(0deg, #000a, #0000); pointer-events: none; }
.tryon-dock.is-loading { visibility: hidden; }
/* 桌面右下角是助手表情球，切镜头按钮让开它。 */
@media (min-width: 768px) { .tryon-dock { padding-right: 92px; } }
.tryon-dock :is(.ant-btn, .ant-segmented, .ant-alert) { pointer-events: auto; }
.tryon-notice-area { display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: 20px; }
.tryon-notice { display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: min(100%, 420px); padding: 10px 14px; color: #fff; text-align: center; background: #101714c7; border-radius: 12px; backdrop-filter: blur(12px); pointer-events: auto; }
.tryon-notice strong { font-size: 14px; font-weight: 500; }
.tryon-notice small { font-size: 12px; line-height: 1.6; color: #d7e3dc; }
.tryon-notice p { margin: 0; font-size: 13px; line-height: 1.6; }
.tryon-notice.is-error { color: #5e3a0c; background: #fff7e8; }
.tryon-notice.is-offer strong { font-size: 16px; color: #9fe8c3; }
.tryon-steps { display: flex; gap: 14px; margin: 2px 0; padding: 0; list-style: none; }
.tryon-steps li { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: #ffffff80; transition: color .3s ease; }
.tryon-steps i { width: 7px; height: 7px; background: #ffffff4d; border-radius: 50%; transition: background .3s ease, transform .3s var(--ease-out); }
.tryon-steps .done { color: #d7e3dc; }
.tryon-steps .done i { background: #9fe8c3; }
.tryon-steps .current { color: #fff; }
.tryon-steps .current i { background: #fff; transform: scale(1.35); animation: tryon-pulse 1s ease-in-out infinite; }
.tryon-start-hint { max-width: 56ch; margin: 0; font-size: 12px; line-height: 1.6; color: var(--cam-soft); text-align: center; text-shadow: 0 1px 4px #0009; }
.is-cover .tryon-start-hint { text-shadow: none; }
.is-cover .tryon-topbar, .is-cover .tryon-dock { background: none; }
.tryon-start-hint.active { color: #bff0d5; }

.tryon-controls { pointer-events: auto; display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto minmax(0, 1fr) auto; grid-template-areas: "hist mode . shut . flip"; align-items: center; gap: 14px; }
.tryon-selection-row { display: contents; }
.tryon-current.ant-btn { display: none; }
.tryon-end.ant-btn { grid-column: 5; justify-self: end; min-height: 40px; border-radius: 20px; }
.tryon-mode { grid-area: mode; justify-self: center; }
.tryon-slot-history { grid-area: hist; }
.tryon-slot-shutter { grid-area: shut; justify-self: center; }
.tryon-slot-flip { grid-area: flip; justify-self: end; }
.tryon-mode :deep(.ant-segmented) { padding: 0; color: #ffffffb3; background: transparent; }
.tryon-mode :deep(.ant-segmented-thumb), .tryon-mode :deep(.ant-segmented-item-selected) { color: #17211c; background: #fffffff0; }
.tryon-mode :deep(.ant-segmented-item:hover:not(.ant-segmented-item-selected)) { color: #fff; }
.tryon-mode :deep(.ant-segmented-item-label) { min-height: 30px; padding-inline: 14px; font-size: 13px; line-height: 30px; }
.tryon-mode :deep(.ant-segmented-item-disabled) { color: #ffffff66; }
.tryon-history-thumb.ant-btn { display: grid; place-items: center; width: 52px; height: 52px; padding: 0; overflow: hidden; font-size: 20px; color: var(--cam-fg); background: var(--cam-glass); border: 2px solid var(--cam-edge); border-radius: 12px; }
.tryon-history-thumb.ant-btn:hover { color: var(--cam-fg); background: var(--cam-glass-hover); border-color: var(--cam-fg); }
.tryon-history-thumb.bump { animation: tryon-bump .38s var(--ease-out); }
.tryon-history-thumb img { width: 100%; height: 100%; object-fit: cover; }
.tryon-flip.ant-btn { width: 52px; height: 52px; font-size: 20px; color: #fff; background: #ffffff26; border: 0; transition: transform .35s var(--ease-out), background .2s ease; }
.tryon-flip.ant-btn:not(:disabled):hover { color: #fff; background: #ffffff40; }
.tryon-flip.ant-btn:not(:disabled):active { transform: rotate(180deg); }
.tryon-flip.ant-btn:disabled { color: #ffffff59; background: #ffffff14; }
.phase-cover .tryon-mode, .phase-cover .tryon-slot-shutter, .phase-cover .tryon-slot-flip,
.phase-off .tryon-mode, .phase-off .tryon-slot-shutter, .phase-off .tryon-slot-flip { visibility: hidden; }
.tryon-recording-error { width: min(100%, 420px); }

.tryon-info-copy { max-width: 30ch; margin: 8px 0 0; font-size: 13px; line-height: 1.8; }

/* 抽屉与历史（内容沿用） */
.tryon-picker-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding-bottom: env(safe-area-inset-bottom); font-size: 13px; color: var(--muted-strong); }
.tryon-paid-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; font-size: 13px; color: var(--accent); }
.tryon-history-item { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 16px; padding: 20px 0; border-bottom: 1px solid var(--line); }
.tryon-history-item > img { width: 140px; max-height: 200px; object-fit: contain; background: var(--surface-alt); border-radius: 8px; }
.tryon-history-item p { margin: 8px 0; font-size: 12px; line-height: 1.7; color: var(--muted-strong); }
.tryon-history-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.tryon-pending-media { padding: 16px; font-size: 12px; color: var(--muted-strong); background: var(--surface-alt); }
.tryon-import-label { margin: 16px 0 8px; font-size: 13px; color: var(--muted-strong); }
.tryon-import-role { width: 100%; }
.tryon-modal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.tryon-session-history { padding: 8px 0; font-size: 12px; color: var(--muted-strong); }

/* 平板：侧栏隐藏、底部导航仍在，舞台让出导航高度。 */
@media (max-width: 1023px) { .tryon-page { --tryon-reserve: calc(72px + env(safe-area-inset-bottom)); } }

/* 手机相机模式：选衣收进底部抽屉，控件分行。 */
@media (max-width: 767px), (max-height: 500px) and (pointer: coarse) {
  .tryon-controls { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); grid-template-areas: "sel sel sel" "mode mode mode" "hist shut flip"; gap: 8px 12px; }
  .tryon-selection-row { display: flex; grid-area: sel; align-items: center; gap: 8px; min-width: 0; }
  .tryon-end.ant-btn { flex: none; min-height: 44px; background: #ffffffeb; }
  .tryon-current.ant-btn { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; height: 52px; padding: 5px 12px 5px 6px; color: var(--cam-fg); text-align: left; white-space: normal; background: var(--cam-glass); border: 0; border-radius: 26px; backdrop-filter: blur(10px); }
  .tryon-current.ant-btn:hover { color: var(--cam-fg); background: var(--cam-glass-hover); }
  .tryon-current-image, .tryon-current-placeholder { flex: none; width: 42px; height: 42px; overflow: hidden; object-fit: contain; background: #ffffffe6; border-radius: 50%; }
  .tryon-current-placeholder { display: grid; place-items: center; font-size: 18px; color: #1f5c45; }
  .tryon-current-image :deep(canvas) { width: 100%; height: 100%; object-fit: contain; }
  .tryon-current-copy { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
  .tryon-current-copy strong, .tryon-current-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tryon-current-copy strong { font-size: 13px; font-weight: 500; }
  .tryon-current-copy small { font-size: 11px; color: var(--cam-soft); }
  .tryon-current-arrow { flex: none; font-size: 11px; color: var(--cam-soft); }
}

/* 手机：系统相机式全屏。 */
@media (max-width: 767px), (max-height: 500px) and (pointer: coarse) {
  .tryon-page { position: fixed; inset: 0; z-index: 40; width: 100vw; height: 100dvh; min-height: 0; max-width: none; background: #000; overscroll-behavior: none; }
  .tryon-body, .tryon-stage-area { display: block; height: 100%; }
  .tryon-topbar { padding: calc(env(safe-area-inset-top) + 4px) 6px 22px; }
  .tryon-topbar .tryon-status { position: absolute; left: 50%; top: calc(env(safe-area-inset-top) + 10px); max-width: calc(100% - 200px); transform: translateX(-50%); }
  .tryon-recording-status { top: calc(env(safe-area-inset-top) + 56px); }
  .tryon-dock { padding: 44px 16px calc(env(safe-area-inset-bottom) + 12px); }
  .tryon-viewfinder { inset: 14% 8% 38%; }
  .tryon-stage-cover { padding: calc(env(safe-area-inset-top) + 64px) 24px 200px; }
  .tryon-cover-frame { inset: calc(env(safe-area-inset-top) + 64px) 20px 196px; }
  .tryon-stage-cover h2 { font-size: 20px; }
  .tryon-stage-cover p { font-size: 13px; }
  .tryon-start-hint { font-size: 11px; }
  .tryon-steps { gap: 10px; }
  .tryon-history-item { grid-template-columns: 100px minmax(0, 1fr); gap: 12px; }
  .tryon-history-item > img { width: 100px; max-height: 150px; }
  .tryon-history-actions .ant-btn { padding-inline: 8px; font-size: 12px; }
}
@media (max-width: 767px) and (max-height: 650px) {
  .tryon-history-thumb.ant-btn, .tryon-flip.ant-btn { width: 46px; height: 46px; }
  .tryon-dock { gap: 4px; padding-top: 24px; }
  .tryon-controls { row-gap: 4px; }
  .tryon-current.ant-btn { height: 46px; }
  .tryon-current-image, .tryon-current-placeholder { width: 36px; height: 36px; }
}
/* 手机横屏：控件立到右侧，和系统相机一致。 */
@media (max-height: 500px) and (pointer: coarse) {
  .tryon-dock { left: auto; top: 0; width: 210px; padding: calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 10px) 8px 28px; justify-content: center; background: linear-gradient(270deg, #000a, #0000); }
  .tryon-notice-area { position: fixed; left: 12px; bottom: 10px; width: calc(100vw - 240px); align-items: flex-start; }
  .tryon-topbar { padding-right: 216px; }
  .tryon-controls { grid-template-columns: 1fr auto 1fr; grid-template-areas: "sel sel sel" "mode mode mode" "hist shut flip"; }
}

@keyframes tryon-lens-open { from { opacity: 0; filter: blur(14px); transform: scale(1.07); } }
@keyframes tryon-flip { 50% { opacity: .35; filter: blur(12px); transform: perspective(900px) rotateY(80deg); } }
@keyframes tryon-develop { from { filter: blur(16px) brightness(1.3) saturate(.6); } }
@keyframes tryon-scan { to { top: calc(100% - 2px); } }
@keyframes tryon-sweep { from { background-position: 0 100%; } to { background-position: 0 0; opacity: .2; } }
@keyframes tryon-flash { 0% { opacity: .85; } 100% { opacity: 0; } }
@keyframes tryon-fly { to { transform: translate(calc(-50% + var(--fly-x)), calc(-50% + var(--fly-y))) scale(.12); opacity: .7; } }
@keyframes tryon-fade-in { from { opacity: 0; } }
@keyframes tryon-fade-out { to { opacity: 0; } }
@keyframes tryon-pulse { 50% { opacity: .35; } }
@keyframes tryon-bump { 40% { transform: scale(1.14); } }

.tryon-iris-leave-active { transition: opacity .55s ease, transform .55s var(--ease-out); }
.tryon-iris-leave-to { opacity: 0; transform: scale(1.12); }
.tryon-fade-enter-active, .tryon-fade-leave-active { transition: opacity .25s ease; }
.tryon-fade-enter-from, .tryon-fade-leave-to { opacity: 0; }
.tryon-rise-enter-active, .tryon-rise-leave-active { transition: opacity .2s ease, transform .2s var(--ease-out); }
.tryon-rise-enter-from { opacity: 0; transform: translateY(8px); }
.tryon-rise-leave-to { opacity: 0; transform: translateY(-4px); }

@media (prefers-reduced-motion: reduce) {
  .tryon-page *, .tryon-page :deep(*) { animation: none !important; scroll-behavior: auto !important; transition: none !important; }
  .tryon-flash, .tryon-sweep, .tryon-scan { display: none; }
}
</style>
