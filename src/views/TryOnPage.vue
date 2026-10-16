<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { CameraOutlined, StopOutlined, UploadOutlined, SwapOutlined, DownloadOutlined, ReloadOutlined, FullscreenOutlined, FullscreenExitOutlined, AimOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons-vue'
import { closetApi, type ClosetTask, type Garment } from '../services/api'
import { cameraError } from '../services/camera'
import TryOnAnchorEditor from '../components/TryOnAnchorEditor.vue'
import TryOnLoader, { type LoaderStep } from '../components/TryOnLoader.vue'
import { DEFAULT_FIT, applyAnchors, mirrorGeometry, cleanTextureCandidates, sleeveKind, textureWorkflowId, type Anchors, type Geometry, type Landmark, type SleeveKind } from '../try-on/geometry'
import { flippedCanvas, loadTexture, type Texture } from '../try-on/texture'
import { PoseTracker, type LoadProgress, type LoadStage } from '../try-on/tracker'
import { PoseFollower, type TrackingStatus } from '../try-on/tracking'
import { TryOnRenderer } from '../try-on/renderer'
import { GestureDetector, type GestureState } from '../try-on/gestures'
import { chinLine, handCircles } from '../try-on/body'
import { drawOverlay } from '../try-on/overlay'
import { isDefaultFit, loadSaved, loadVerdicts, storeSaved, storeVerdicts, type Verdict } from '../try-on/preferences'

const { message } = App.useApp()
const video = ref<HTMLVideoElement>(), canvas = ref<HTMLCanvasElement>(), overlay = ref<HTMLCanvasElement>()
const stage = ref<HTMLElement>(), fullscreen = ref(false)
const captureSize = reactive({ width: 0, height: 0 })
const captureAspect = computed(() => captureSize.width && captureSize.height ? captureSize.width / captureSize.height : 16 / 9)
const tops = ref<Garment[]>([]), selectedId = ref<string>(), loadingClothes = ref(true), loadingTexture = ref(false)
const verdicts = reactive<Record<string, Verdict>>(loadVerdicts())
const checking = reactive({ done: 0, total: 0 }), includeLong = ref(false)
const texture = ref<Texture | null>(null), baseGeometry = ref<Geometry | null>(null), anchors = ref<Anchors>()
const texturePreview = ref(''), textureName = ref(''), textureError = ref(''), sourceLabel = ref(''), textureKind = ref<SleeveKind>()
const running = ref(false), starting = ref(false), error = ref(''), delegate = ref(''), facing = ref<'user' | 'environment'>('user')
const tracked = ref(false), mirror = ref(true), showMesh = ref(false), occlusion = ref(true), mode = ref('MESH')
const readablePrint = ref(true), handsOn = ref(false), faceOn = ref(false), debugOn = ref(false), gesturesOn = ref(false), editorOpen = ref(false)
const trackingStatus = ref<TrackingStatus>('searching'), gesture = ref<GestureState['pending']>(null)
const fit = reactive({ ...DEFAULT_FIT }), fitKey = ref('')
const textureWorkflows = new Map<string, Promise<ClosetTask>>()
const metrics = reactive({ displayFps: 0, poseFps: 0, p95: 0, delay: 0, seconds: 0, hands: 0, face: 0 })
let renderer: TryOnRenderer | null = null, tracker: PoseTracker | null = null, stream: MediaStream | null = null
let animation = 0, epoch = 0, textureEpoch = 0, fileUrl = '', destroyed = false, loading = false
let pose: Landmark[] = [], follower = new PoseFollower(), gestures = new GestureDetector(), samples: number[] = [], displayFrames = 0, poseFrames = 0
let metricStart = 0, startedAt = 0, lastDraw = 0, lastVideoTime = -1
const signature = (g: Garment) => [g.displayUrl, ...g.images.map(a => `${a.id}:${a.reviewStatus}`)].join('|')
const garmentLabel = (g: Garment) => g.name || [g.primaryColor[0], g.category[0]].filter(Boolean).join(' · ') || '衣柜上衣'
const usable = (g: Garment) => { const v = verdicts[g.id]; return !!v?.ok && v.signature === signature(g) && (v.kind !== 'long' || includeLong.value) }
// Only garments that passed the texture and silhouette check are offered; long sleeves are opt-in while experimental.
const clothOptions = computed(() => tops.value.filter(usable).map(g => ({ value: g.id, label: verdicts[g.id]?.kind === 'long' ? `${garmentLabel(g)} · 长袖（实验）` : garmentLabel(g) })))
const hiddenCount = computed(() => tops.value.filter(g => { const v = verdicts[g.id]; return v?.signature === signature(g) && !usable(g) }).length)
const filterCloth = (input: string, option: { label?: string }) => (option.label || '').includes(input)
const trackingLabels: Record<TrackingStatus, string> = {
  tracking: '正在跟随你的动作', 'upper-body': '半身追踪中 · 衣长为估计', holding: '短暂丢失，正在恢复追踪',
  searching: '正在寻找人物，请面向镜头并保持光线充足', shoulders: '已检测到人，请让双肩清楚入镜', slow: '设备处理较慢，正在重新追踪',
}
const status = computed(() => starting.value ? '正在准备摄像头和姿态检测' : !running.value ? '准备好后开启试穿' : trackingLabels[trackingStatus.value])
const statusColor = computed(() => tracked.value && trackingStatus.value !== 'holding' ? 'green' : starting.value || running.value ? 'gold' : 'default')
const tuned = computed(() => !!anchors.value || !isDefaultFit(fit))
// Loading steps for the waiting animation. Start-up lists every step; switching a model on while running shows
// only that model in a small chip.
const load = reactive<{ stage: 'camera' | LoadStage | null; loaded: number; total: number; models: LoadStage[] }>({ stage: null, loaded: 0, total: 0, models: [] })
const stageLabels: Record<'camera' | LoadStage, string> = { camera: '打开摄像头', runtime: '启动识别引擎', pose: '下载姿态模型', hands: '下载手部模型', face: '下载面部模型' }
const megabytes = (bytes: number) => (bytes / 1048576).toFixed(1)
const loaderSteps = computed<LoaderStep[]>(() => {
  const order: ('camera' | LoadStage)[] = running.value ? load.models : ['camera', 'runtime', 'pose', ...load.models]
  const current = load.stage ? order.indexOf(load.stage) : -1
  return order.map((key, index) => {
    const active = index === current, bytes = active && load.total > 0 && ['pose', 'hands', 'face'].includes(key)
    return { key, label: stageLabels[key], state: index < current ? 'done' : active ? 'active' : 'waiting',
      detail: bytes ? `${megabytes(load.loaded)} / ${megabytes(load.total)} MB` : undefined,
      percent: bytes ? Math.min(100, Math.round(load.loaded / load.total * 100)) : undefined }
  })
})
function onLoadProgress(progress: Omit<LoadProgress, 'stage'> & { stage: 'camera' | LoadStage | null }) { load.stage = progress.stage; load.loaded = progress.loaded; load.total = progress.total }

async function workflowsFor(garment: Garment) {
  // Reuse the original wardrobe's processing history, including clean AI results before the sticker step.
  const ids = [...new Set(garment.images.map(a => textureWorkflowId(a.url)).filter((id): id is string => !!id))]
  return Promise.all(ids.map(id => {
    if (!textureWorkflows.has(id)) textureWorkflows.set(id, closetApi.task(id).catch(error => { textureWorkflows.delete(id); throw error }))
    return textureWorkflows.get(id)!
  }))
}
/** Finds the first clean transparent texture whose silhouette the garment template understands. */
async function prepareGarment(garment: Garment) {
  const candidates = cleanTextureCandidates(garment, await workflowsFor(garment))
  if (!candidates.length) throw new Error('这件衣物还没有可用的无白边素材。可导入一张透明上衣 PNG 先测试。')
  let lastError = ''
  for (const candidate of candidates) {
    try {
      const result = await loadTexture(candidate.url)
      const label = ['AI_ENHANCED', 'GENERATE'].includes(candidate.kind) ? '衣柜 AI 整理图 · 无白边透明版' : candidate.kind === 'BASE' ? '衣柜基础抠图 · 无白边' : '衣柜透明素材 · 无白边'
      return { texture: result, label }
    } catch (cause) { lastError = cause instanceof Error ? cause.message : String(cause) }
  }
  throw new Error(lastError || '没有可用的透明素材。')
}
/** Checks each top once per change of its images, a few at a time, and remembers the result in this browser. */
async function verifyTops() {
  const pending = tops.value.filter(g => verdicts[g.id]?.signature !== signature(g))
  checking.done = 0; checking.total = pending.length
  const queue = [...pending]
  const worker = async () => {
    for (let garment = queue.shift(); garment && !destroyed; garment = queue.shift()) {
      try {
        const { texture: result } = await prepareGarment(garment)
        verdicts[garment.id] = { signature: signature(garment), ok: true, kind: sleeveKind(result.geometry) }
      } catch (cause) { verdicts[garment.id] = { signature: signature(garment), ok: false, reason: cause instanceof Error ? cause.message : String(cause) } }
      checking.done++
      if (checking.done % 5 === 0) storeVerdicts({ ...verdicts })
      if (!selectedId.value && !loadingTexture.value && usable(garment)) { selectedId.value = garment.id; void chooseGarment(garment.id) }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  storeVerdicts({ ...verdicts })
}
async function loadClothes() {
  if (loading) return
  loading = true; loadingClothes.value = true
  try {
    const items: Garment[] = []
    // Existing closets can contain hundreds of garments. Do not silently limit the selector to their newest 50.
    for (let page = 1; page <= 20; page++) {
      const result = await closetApi.list({ status: 'ACTIVE', q: '', category: '', color: '', season: '', page, size: 50 })
      if (destroyed) return
      items.push(...result.items)
      if (page * 50 >= result.total || !result.items.length) break
    }
    tops.value = items.filter(g => g.images.length && /T恤|T-shirt|衬衫|上衣|卫衣|针织衫|毛衣|背心/i.test(g.category.join(' ')) && !/裙|外套|开衫/.test(g.category.join(' ')))
    const first = tops.value.find(g => usable(g) && verdicts[g.id]?.kind === 'short') || tops.value.find(usable)
    if (first && !texture.value) { selectedId.value = first.id; void chooseGarment(first.id) }
    loadingClothes.value = false
    await verifyTops()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading = false; loadingClothes.value = false }
}
function clearTexture() { texture.value = null; sourceCanvas = null; flipped = null; baseGeometry.value = null; texturePreview.value = ''; textureName.value = ''; renderer?.setTexture(null) }
/** Applies saved fine-tuning for this garment and hands the effective geometry to the renderer. */
function acceptTexture(result: Texture, name: string, source: string, key: string) {
  const saved = loadSaved(key)
  fitKey.value = ''
  Object.assign(fit, saved.fit); anchors.value = saved.anchors
  baseGeometry.value = result.geometry
  textureName.value = name; sourceLabel.value = source; textureKind.value = sleeveKind(result.geometry)
  texturePreview.value = result.canvas.toDataURL(); textureError.value = ''
  applyGeometry(result.canvas)
  fitKey.value = key
}
let sourceCanvas: HTMLCanvasElement | null = null, flipped: HTMLCanvasElement | null = null
/**
 * A mirrored preview reverses printed text like a real mirror. To keep prints readable, the renderer gets a flipped
 * copy of the garment with its anchors mirrored to match; anchors are always edited on the unflipped image.
 */
function applyGeometry(source = sourceCanvas) {
  if (!source || !baseGeometry.value) return
  if (source !== sourceCanvas) { sourceCanvas = source; flipped = null }
  const geometry = applyAnchors(baseGeometry.value, anchors.value)
  const flip = mirror.value && readablePrint.value
  if (flip && !flipped) flipped = flippedCanvas(source)
  texture.value = { canvas: source, geometry }
  renderer?.setTexture(flip ? { canvas: flipped!, geometry: mirrorGeometry(geometry) } : texture.value)
}
watch([mirror, readablePrint], () => applyGeometry())
watch(fit, () => { if (fitKey.value) storeSaved(fitKey.value, tuned.value ? { fit: { ...fit }, anchors: anchors.value } : null) })
function saveAnchors(next: Anchors | undefined) {
  anchors.value = next; applyGeometry()
  if (fitKey.value) storeSaved(fitKey.value, tuned.value ? { fit: { ...fit }, anchors: next } : null)
  message.success(next ? '锚点已保存，只用于这件衣物。' : '已恢复自动识别的锚点。')
}
async function chooseGarment(id: string) {
  const selection = ++textureEpoch
  const garment = tops.value.find(g => g.id === id)
  clearTexture(); textureError.value = ''; loadingTexture.value = true
  try {
    if (!garment) return
    const { texture: result, label } = await prepareGarment(garment)
    if (selection !== textureEpoch || destroyed) return
    acceptTexture(result, garmentLabel(garment), label, garment.id)
  } catch (cause) { if (selection === textureEpoch && !destroyed) textureError.value = cause instanceof Error ? cause.message : String(cause) }
  finally { if (selection === textureEpoch) loadingTexture.value = false }
}
/** Steps through the offered garments; used by the arrow buttons and by gestures. */
function stepGarment(direction: 1 | -1) {
  const options = clothOptions.value
  if (options.length < 2) return ''
  const index = options.findIndex(o => o.value === selectedId.value)
  const next = options[(index + direction + options.length) % options.length]!
  selectedId.value = next.value; void chooseGarment(next.value)
  return next.label
}
async function importTexture(file: File) {
  if (file.type !== 'image/png' || file.size > 20 * 1024 * 1024) { message.info('请选择 20 MB 以内的透明上衣 PNG。'); return false }
  const selection = ++textureEpoch, url = URL.createObjectURL(file)
  loadingTexture.value = true; clearTexture(); textureError.value = ''
  try {
    const result = await loadTexture(url)
    if (selection !== textureEpoch || destroyed) return false
    selectedId.value = undefined; acceptTexture(result, file.name, '本地 PNG · 未上传', `file:${file.name}:${file.size}`)
  } catch (cause) { if (selection === textureEpoch) textureError.value = cause instanceof Error ? cause.message : String(cause) }
  finally { URL.revokeObjectURL(url); if (selection === textureEpoch) loadingTexture.value = false }
  return false
}
function stop() {
  epoch++; cancelAnimationFrame(animation); animation = 0
  tracker?.close(); tracker = null; renderer?.close(); renderer = null
  stream?.getTracks().forEach(track => track.stop()); stream = null
  if (video.value) { video.value.pause(); video.value.srcObject = null; video.value.removeAttribute('src'); video.value.load() }
  if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = '' }
  overlay.value?.getContext('2d')?.clearRect(0, 0, overlay.value.width, overlay.value.height)
  running.value = false; starting.value = false; tracked.value = false; trackingStatus.value = 'searching'; pose = []; follower = new PoseFollower()
  gestures = new GestureDetector(); gesture.value = null; load.stage = null
  captureSize.width = 0; captureSize.height = 0
}
function updateVideoSize() {
  if (video.value?.videoWidth && video.value.videoHeight) {
    captureSize.width = video.value.videoWidth; captureSize.height = video.value.videoHeight
  }
}
function onFullscreen() { fullscreen.value = document.fullscreenElement === stage.value }
async function toggleFullscreen() {
  try {
    if (fullscreen.value) await document.exitFullscreen()
    else if (stage.value?.requestFullscreen) await stage.value.requestFullscreen()
    else message.info('当前浏览器不支持全屏预览。')
  } catch { message.info('暂时无法进入全屏，请重试。') }
}
function updatePose(result: { timestamp: number; inferenceMs: number; timings: Record<string, number> }) {
  samples.push(result.inferenceMs); if (samples.length > 90) samples.shift()
  metrics.delay = Math.round(performance.now() - result.timestamp); poseFrames++
  if (result.timings.hands !== undefined) metrics.hands = Math.round(result.timings.hands)
  if (result.timings.face !== undefined) metrics.face = Math.round(result.timings.face)
}
// Optional models switch on and off without restarting the camera.
watch([handsOn, faceOn], ([hands, face], [wasHands, wasFace]) => {
  if (!tracker) return
  load.models = [...(hands && !wasHands ? ['hands' as const] : []), ...(face && !wasFace ? ['face' as const] : [])]
  tracker.configure({ hands, face })
})
function draw(now: number) {
  if (!running.value || !video.value || !renderer) return
  animation = requestAnimationFrame(draw)
  if (video.value.readyState < 2 || now - lastDraw < 30) return
  lastDraw = now
  const current = tracker?.current(now), extras = tracker?.extras(now) || { raw: [], hands: [], face: [] }
  pose = follower.follow(current?.landmarks || [], now)
  tracked.value = pose.length > 0; trackingStatus.value = current?.status || 'searching'
  const aspect = video.value.videoWidth / video.value.videoHeight
  try {
    renderer.draw(video.value, pose, fit, { rigid: mode.value === 'RIGID', occlusion: occlusion.value, wire: showMesh.value,
      chin: pose.length ? chinLine(pose, extras.face) : null, hands: handCircles(extras.hands, aspect) })
  } catch { error.value = '视频绘制中断，请停止后重新开启。'; stop(); return }
  const layer = overlay.value
  if (layer && canvas.value) {
    if (layer.width !== canvas.value.width || layer.height !== canvas.value.height) { layer.width = canvas.value.width; layer.height = canvas.value.height }
    const ctx = layer.getContext('2d')!
    if (debugOn.value) drawOverlay(ctx, layer.width, layer.height, { pose: extras.raw, garmentPose: pose, hands: extras.hands, face: extras.face, connections: tracker?.connections || null, mirror: mirror.value })
    else ctx.clearRect(0, 0, layer.width, layer.height)
  }
  if (gesturesOn.value) {
    const result = gestures.update(extras.raw, handsOn.value ? extras.hands : [], now)
    gesture.value = result.pending
    if (result.fired) {
      const label = stepGarment(result.fired.action === 'next' ? 1 : -1)
      if (label) message.info({ content: `${result.fired.label}：${label}`, key: 'try-on-gesture', duration: 1.5 })
    }
  }
  displayFrames++
  if (video.value.currentTime !== lastVideoTime) { lastVideoTime = video.value.currentTime; void tracker?.submit(video.value, now) }
  if (now - metricStart >= 1000) {
    metrics.displayFps = Math.round(displayFrames * 1000 / (now - metricStart)); metrics.poseFps = Math.round(poseFrames * 1000 / (now - metricStart))
    metrics.p95 = Math.round([...samples].sort((a, b) => a - b)[Math.max(0, Math.ceil(samples.length * .95) - 1)] || 0)
    metrics.seconds = Math.round((now - startedAt) / 1000); displayFrames = 0; poseFrames = 0; metricStart = now
  }
}
async function start(file?: File) {
  stop(); error.value = ''
  if (!texture.value) { message.info('先选一件上衣，或导入透明 PNG。'); return }
  if (!file && !navigator.mediaDevices?.getUserMedia) { error.value = '摄像头需要 HTTPS 或 localhost。也可以导入短视频测试动作。'; return }
  load.models = [...(handsOn.value ? ['hands' as const] : []), ...(faceOn.value ? ['face' as const] : [])]
  onLoadProgress({ stage: 'camera', loaded: 0, total: 0 })
  const attempt = epoch; starting.value = true; samples = []; displayFrames = 0; poseFrames = 0; lastVideoTime = -1
  try {
    await nextTick()
    const source = video.value!
    if (file) { fileUrl = URL.createObjectURL(file); source.src = fileUrl; source.loop = true }
    else {
      const supports = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & { resizeMode?: boolean }
      // Preserve the camera's native framing. A 640×960 request cropped laptop cameras to a narrow portrait strip.
      const constraints: MediaTrackConstraints & { resizeMode?: ConstrainDOMString } = {
        facingMode: { ideal: facing.value }, width: { ideal: 1280 }, frameRate: { ideal: 30 },
        ...(supports.resizeMode ? { resizeMode: { exact: 'none' } } : {}),
      }
      const capture = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false })
      if (attempt !== epoch || destroyed) { capture.getTracks().forEach(track => track.stop()); return }
      stream = capture; source.srcObject = capture
    }
    await source.play()
    if (attempt !== epoch || destroyed) return
    updateVideoSize()
    renderer = new TryOnRenderer(canvas.value!); applyGeometry()
    tracker = new PoseTracker(updatePose, text => { if (attempt === epoch && !destroyed) { error.value = text; stop() } },
      text => { if (attempt === epoch && !destroyed) message.warning(text) })
    tracker.onProgress = progress => { if (attempt === epoch && !destroyed) onLoadProgress(progress) }
    delegate.value = await tracker.initialize({ hands: handsOn.value, face: faceOn.value })
    if (attempt !== epoch || destroyed) return
    running.value = true; starting.value = false; startedAt = metricStart = performance.now(); lastDraw = 0
    animation = requestAnimationFrame(draw)
  } catch (cause) {
    if (attempt !== epoch || destroyed) return
    error.value = file ? (cause instanceof Error ? cause.message : String(cause)) : cause instanceof DOMException ? cameraError(cause) : cause instanceof Error ? cause.message : String(cause)
    stop()
  }
}
function importVideo(file: File) {
  if (!file.type.startsWith('video/') || file.size > 100 * 1024 * 1024) { message.info('请选择 100 MB 以内的短视频。'); return false }
  void start(file); return false
}
function switchCamera() { facing.value = facing.value === 'user' ? 'environment' : 'user'; void start() }
function resetFit() { Object.assign(fit, DEFAULT_FIT) }
function saveFrame() {
  const output = canvas.value
  if (!output || !running.value) return
  // Mirror the exported frame exactly as displayed. Saving is explicit and stays local.
  const copy = document.createElement('canvas'); copy.width = output.width; copy.height = output.height
  const context = copy.getContext('2d')!
  if (mirror.value) { context.translate(copy.width, 0); context.scale(-1, 1) }
  context.drawImage(output, 0, 0)
  copy.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = '鱼搭-实时试穿测试.png'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) })
}
function onVisibility() { if (document.hidden && (running.value || starting.value)) stop() }
onMounted(() => { void loadClothes(); document.addEventListener('visibilitychange', onVisibility); document.addEventListener('fullscreenchange', onFullscreen) })
onBeforeUnmount(() => {
  destroyed = true; textureEpoch++; stop()
  if (document.fullscreenElement === stage.value) void document.exitFullscreen().catch(() => {})
  document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('fullscreenchange', onFullscreen)
})
</script>

<template>
  <div class="try-on-page">
    <div class="page-heading try-on-heading">
      <div><h1>实时试穿 <a-tag>测试版</a-tag></h1><p class="page-subtitle">选一件上衣，看看它如何跟随你的动作。</p></div>
      <a-button @click="$router.push('/ootd')">生成 OOTD</a-button>
    </div>
    <div class="try-on-layout">
      <section ref="stage" class="try-on-stage" :style="{ aspectRatio: captureAspect }" aria-label="实时试穿画面">
        <video ref="video" class="try-on-source" muted playsinline aria-hidden="true" @loadedmetadata="updateVideoSize" @resize="updateVideoSize" />
        <canvas ref="canvas" class="try-on-canvas" :class="{ mirrored: mirror, active: running }" aria-label="衣物随动作变形的试穿预览" />
        <canvas ref="overlay" class="try-on-canvas try-on-overlay" :class="{ active: running && debugOn }" aria-hidden="true" />
        <div v-if="!running" class="try-on-empty">
          <TryOnLoader v-if="starting" :steps="loaderSteps" />
          <template v-else><CameraOutlined /><h2>站到镜头前</h2><p>双肩清楚入镜即可开始。腰部入镜时衣长更稳定，先从正面小幅动作开始。</p><a-button type="primary" size="large" :disabled="!texture || loadingTexture" @click="start()">开启摄像头试穿</a-button></template>
        </div>
        <div class="try-on-stage-status"><a-tag :color="statusColor">{{ status }}</a-tag><span v-if="running">{{ metrics.seconds }} 秒 · {{ delegate }}</span></div>
        <TryOnLoader v-if="running && load.stage" compact :steps="loaderSteps" />
        <div v-if="running && gesture" class="try-on-gesture" role="status">
          <a-progress type="circle" :percent="Math.round(gesture.progress * 100)" :size="34" :show-info="false" stroke-color="#36e2c8" />
          <span>{{ gesture.label }}</span>
        </div>
        <div class="try-on-stage-toolbar">
          <span v-if="running" class="try-on-frame-size">{{ captureSize.width }} × {{ captureSize.height }} · 完整画面</span>
          <a-space>
            <a-button v-if="fullscreen && (running || starting)" @click="stop"><StopOutlined /> 停止试穿</a-button>
            <a-button @click="toggleFullscreen"><FullscreenExitOutlined v-if="fullscreen" /><FullscreenOutlined v-else />{{ fullscreen ? '退出全屏' : '全屏预览' }}</a-button>
          </a-space>
        </div>
      </section>

      <aside class="try-on-controls" aria-label="选择衣物与试穿调整">
        <section class="try-on-clothes">
          <div class="section-heading"><h2>这次试穿</h2><a-button type="text" size="small" :loading="loadingClothes" aria-label="刷新衣柜上衣" @click="loadClothes"><ReloadOutlined /></a-button></div>
          <div class="try-on-select-row">
            <a-button aria-label="上一件" :disabled="clothOptions.length < 2" @click="stepGarment(-1)"><LeftOutlined /></a-button>
            <a-select v-model:value="selectedId" :options="clothOptions" :loading="loadingClothes || checking.done < checking.total" placeholder="从衣柜选择一件上衣" aria-label="试穿上衣" show-search :filter-option="filterCloth" @change="chooseGarment" />
            <a-button aria-label="下一件" :disabled="clothOptions.length < 2" @click="stepGarment(1)"><RightOutlined /></a-button>
          </div>
          <p v-if="checking.done < checking.total" class="try-on-hint">正在检查衣柜上衣能否试穿：{{ checking.done }} / {{ checking.total }}。只列出检查通过的衣物。</p>
          <p v-else-if="!loadingClothes" class="try-on-hint">可试穿 {{ clothOptions.length }} 件<template v-if="hiddenCount">，另有 {{ hiddenCount }} 件素材不合适或为长袖，已隐藏</template>。</p>
          <div class="try-on-toggle compact"><span>显示长袖（实验，效果有限）</span><a-switch v-model:checked="includeLong" size="small" aria-label="显示长袖" /></div>
          <div v-if="texturePreview" class="try-on-texture"><img :src="texturePreview" alt="实际用于试穿的无白边衣物" /><div><strong>{{ textureName }}</strong><p>{{ sourceLabel }}<template v-if="textureKind === 'long'"> · 长袖</template></p><a-button size="small" @click="editorOpen = true"><AimOutlined /> 校准锚点</a-button></div></div>
          <a-spin v-else-if="loadingTexture" class="try-on-texture-loading" tip="准备无白边素材…" />
          <p v-else class="try-on-hint">先用正面、袖子展开的 T 恤测试。可直接导入已有的透明上衣图片。</p>
          <a-alert v-if="textureError" type="warning" :message="textureError" show-icon />
          <a-upload :before-upload="importTexture" :show-upload-list="false" accept="image/png" :disabled="loadingTexture"><a-button block><UploadOutlined /> 导入透明上衣 PNG</a-button></a-upload>
        </section>
        <section class="try-on-adjust">
          <div class="section-heading"><h2>调整贴合</h2><a-button type="link" size="small" :disabled="!tuned" @click="resetFit">恢复默认</a-button></div>
          <p v-if="tuned" class="try-on-hint saved">已为这件衣物保存微调，只在本浏览器生效。</p>
          <label>衣身宽度 <span>{{ Math.round(fit.width * 100) }}%</span></label><a-slider v-model:value="fit.width" :min=".8" :max="1.8" :step=".02" aria-label="衣身宽度" />
          <label>衣身长度 <span>{{ Math.round(fit.length * 100) }}%</span></label><a-slider v-model:value="fit.length" :min=".7" :max="1.4" :step=".02" aria-label="衣身长度" />
          <label>上下位置</label><a-slider v-model:value="fit.offset" :min="-.25" :max=".25" :step=".01" aria-label="衣物上下位置" />
          <a-collapse ghost class="try-on-more">
            <a-collapse-panel key="more" header="更多微调：肩、下摆、袖子与边缘">
              <label>肩线高度 <span>{{ Math.round(fit.lift * 100) }}</span></label><a-slider v-model:value="fit.lift" :min="-.1" :max=".4" :step=".01" aria-label="肩线高度" />
              <label>下摆宽度 <span>{{ Math.round(fit.hemWidth * 100) }}%</span></label><a-slider v-model:value="fit.hemWidth" :min=".7" :max="1.4" :step=".02" aria-label="下摆宽度" />
              <label>袖长 <span>{{ Math.round(fit.sleeveLength * 100) }}%</span></label><a-slider v-model:value="fit.sleeveLength" :min=".6" :max="1.5" :step=".02" aria-label="袖长" />
              <label>袖子粗细 <span>{{ Math.round(fit.sleeveWidth * 100) }}%</span></label><a-slider v-model:value="fit.sleeveWidth" :min=".5" :max="1.3" :step=".02" aria-label="袖子粗细" />
              <label>抬臂时腋下收紧 <span>{{ Math.round(fit.underarm * 100) }}%</span></label><a-slider v-model:value="fit.underarm" :min="0" :max=".9" :step=".05" aria-label="抬臂时腋下收紧" />
              <label>边缘修剪 <span>{{ Math.round(fit.trim * 100) }}</span></label><a-slider v-model:value="fit.trim" :min="0" :max=".6" :step=".02" aria-label="边缘修剪" />
              <p class="try-on-hint">边角对不准时，用上方「校准锚点」直接拖动肩线、衣身边线和袖口位置。</p>
            </a-collapse-panel>
          </a-collapse>
          <a-segmented v-model:value="mode" :options="[{ value: 'MESH', label: '随动作变形' }, { value: 'RIGID', label: '刚性贴图对照' }]" block />
          <div class="try-on-toggle"><span>手臂与手部遮挡（近似）</span><a-switch v-model:checked="occlusion" aria-label="手臂遮挡" /></div>
          <div class="try-on-toggle"><span>镜像画面</span><a-switch v-model:checked="mirror" aria-label="镜像画面" /></div>
          <div v-if="mirror" class="try-on-toggle"><span>镜像时图案保持正向</span><a-switch v-model:checked="readablePrint" aria-label="镜像时图案保持正向" /></div>
          <div class="try-on-toggle"><span>显示变形网格</span><a-switch v-model:checked="showMesh" aria-label="显示变形网格" /></div>
        </section>
        <section class="try-on-sense">
          <div class="section-heading"><h2>识别与手势</h2></div>
          <div class="try-on-toggle"><span>调试：显示全身骨骼</span><a-switch v-model:checked="debugOn" aria-label="显示追踪骨骼" /></div>
          <div class="try-on-toggle"><span>手部识别（手指骨骼、手势、手部遮挡）</span><a-switch v-model:checked="handsOn" aria-label="手部识别" /></div>
          <div class="try-on-toggle"><span>面部网格（衣领避开下巴）</span><a-switch v-model:checked="faceOn" aria-label="面部网格" /></div>
          <div class="try-on-toggle"><span>手势换衣</span><a-switch v-model:checked="gesturesOn" aria-label="手势换衣" /></div>
          <p class="try-on-hint">手势换衣：右手举过头顶停一下换下一件，左手换上一件。开启手部识别后，点赞换下一件、比耶换上一件。手部和面部模型会增加耗电，默认关闭。</p>
        </section>
        <section class="try-on-actions">
          <a-button v-if="!running && !starting" type="primary" block :disabled="!texture" @click="start()"><CameraOutlined /> 开启摄像头试穿</a-button>
          <a-button v-else block @click="stop"><StopOutlined /> 停止试穿</a-button>
          <a-space wrap><a-button :disabled="!running" @click="switchCamera"><SwapOutlined /> 切换镜头</a-button><a-button :disabled="!running" @click="saveFrame"><DownloadOutlined /> 保存当前画面</a-button></a-space>
          <a-upload :before-upload="importVideo" :show-upload-list="false" accept="video/*" :disabled="!texture || starting"><a-button type="link"><UploadOutlined /> 用本地短视频测试</a-button></a-upload>
          <p class="try-on-hint">视频在本机处理。不会上传摄像头画面，不调用 AI 生图，不消耗生图额度。</p>
        </section>
      </aside>
    </div>
    <a-alert v-if="error" class="try-on-error" type="warning" :message="error" show-icon closable @close="error = ''" />
    <div class="try-on-bottom">
      <p>适合正面和小幅动作，短袖上衣效果最好。大幅转身、宽松原衣物露边与复杂袖型可能失真；这里只预览颜色和视觉比例。</p>
      <a-collapse ghost><a-collapse-panel key="performance" header="查看运行表现"><dl class="try-on-metrics"><div><dt>画面</dt><dd>{{ metrics.displayFps }} FPS</dd></div><div><dt>姿态检测</dt><dd>{{ metrics.poseFps }} FPS</dd></div><div><dt>推理 p95</dt><dd>{{ metrics.p95 }} ms</dd></div><div><dt>最近一帧处理耗时</dt><dd>{{ metrics.delay }} ms</dd></div><div v-if="handsOn"><dt>手部模型</dt><dd>{{ metrics.hands }} ms</dd></div><div v-if="faceOn"><dt>面部模型（每 3 帧）</dt><dd>{{ metrics.face }} ms</dd></div></dl><p class="try-on-hint">处理耗时包含取帧、Worker 传递和推理，不能直接视为完整的动作到屏幕延迟。</p></a-collapse-panel></a-collapse>
    </div>
    <TryOnAnchorEditor v-model:open="editorOpen" :image="texturePreview" :aspect="baseGeometry?.aspect || 1" :geometry="texture?.geometry || null" @save="saveAnchors" />
  </div>
</template>

<style scoped>
.try-on-page { width: 100%; max-width: 1680px; margin: 0 auto; }
.try-on-heading h1 { display: flex; align-items: center; gap: 12px; }
.try-on-heading h1 .ant-tag { margin: 0; font-weight: 400; }
.try-on-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; }
.try-on-stage { position: relative; width: 100%; min-height: 300px; max-height: calc(100dvh - 180px); display: flex; align-items: center; justify-content: center; background: #151b18; border-radius: var(--radius-xl); overflow: hidden; }
.try-on-stage:fullscreen { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; }
.try-on-source { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.try-on-canvas { position: absolute; inset: 0; display: none; width: 100%; height: 100%; object-fit: contain; }
.try-on-canvas.active { display: block; }
.try-on-canvas.mirrored { transform: scaleX(-1); }
.try-on-overlay { pointer-events: none; }
.try-on-gesture { position: absolute; left: 50%; top: 108px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 6px 14px 6px 8px; border-radius: 999px; background: #151b18d9; color: #e9f5ef; font-size: 14px; pointer-events: none; }
.try-on-select-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px; }
.try-on-hint.saved { margin: -4px 0 4px; color: var(--accent); }
.try-on-toggle.compact { margin-top: 4px; font-size: 12px; color: var(--muted-copy); }
.try-on-more { margin: 0 -16px 8px; }
.try-on-more :deep(.ant-collapse-header) { font-size: 13px; }
.try-on-empty { display: flex; flex-direction: column; align-items: center; padding: 40px; color: #f1f6f3; text-align: center; }
.try-on-empty > .anticon { font-size: 44px; color: #accdb9; margin-bottom: 20px; }
.try-on-empty h2 { font-size: 24px; font-weight: 600; margin: 0 0 12px; color: inherit; }
.try-on-empty p { max-width: 260px; margin-bottom: 24px; color: #c4d0c8; line-height: 1.8; }
.try-on-stage-status { position: absolute; top: 18px; left: 18px; right: 18px; display: flex; justify-content: space-between; align-items: start; gap: 8px; pointer-events: none; }
.try-on-stage-status .ant-tag { white-space: normal; min-width: 0; margin: 0; }
.try-on-stage-status > span:last-child:not(.ant-tag) { flex-shrink: 0; }
.try-on-stage-status > span { color: #dce8e1; font-size: 12px; background: #151b18c9; border-radius: 6px; padding: 4px 8px; }
.try-on-stage-toolbar { position: absolute; inset: auto 16px 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.try-on-stage-toolbar > .ant-space { margin-left: auto; }
.try-on-frame-size { color: #dce8e1; font-size: 12px; background: #151b18c9; border-radius: 6px; padding: 6px 8px; }
.try-on-controls { padding: 22px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-xl); }
.try-on-controls section + section { border-top: 1px solid var(--line); padding-top: 20px; margin-top: 20px; }
.try-on-controls h2 { font-size: 16px; margin: 0; }
.try-on-controls .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.try-on-select-row .ant-select, .try-on-clothes > .ant-select, .try-on-clothes :deep(.ant-upload-wrapper), .try-on-clothes :deep(.ant-upload), .try-on-actions :deep(.ant-upload-wrapper) { width: 100%; }
.try-on-texture { display: flex; align-items: center; gap: 14px; margin: 16px 0; min-width: 0; }
.try-on-texture img { width: 90px; height: 100px; object-fit: contain; background-color: var(--surface-alt); background-image: conic-gradient(#b7c5bd44 25%, transparent 0 50%, #b7c5bd44 0 75%, transparent 0); background-size: 12px 12px; border-radius: var(--radius-md); }
.try-on-texture strong { display: block; overflow-wrap: anywhere; font-size: 14px; }
.try-on-texture p { margin: 6px 0 0; font-size: 12px; color: var(--muted-copy); }
.try-on-texture-loading { display: block; padding: 35px 0; }
.try-on-hint { font-size: 12px; line-height: 1.8; color: var(--muted-copy); }
.try-on-clothes .ant-alert { margin-bottom: 12px; }
.try-on-adjust label { display: flex; justify-content: space-between; font-size: 13px; margin-top: 14px; }
.try-on-adjust label span { color: var(--muted-copy); font-variant-numeric: tabular-nums; }
.try-on-adjust .ant-slider { margin: 10px 5px 18px; }
.try-on-adjust .ant-segmented { margin-bottom: 12px; }
.try-on-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; font-size: 13px; }
.try-on-actions { display: flex; flex-direction: column; gap: 12px; }
.try-on-actions :deep(.ant-space) { width: 100%; }
.try-on-actions :deep(.ant-space-item) { flex: 1; }
.try-on-actions :deep(.ant-space-item .ant-btn) { width: 100%; }
.try-on-actions p { margin: 0; }
.try-on-error { margin-top: 18px; }
.try-on-bottom { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.try-on-bottom > p { color: var(--muted-copy); font-size: 13px; line-height: 1.8; margin: 12px 0; }
.try-on-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; }
.try-on-metrics dt { color: var(--muted-copy); font-size: 12px; }
.try-on-metrics dd { margin: 4px 0 0; font-size: 17px; font-variant-numeric: tabular-nums; }
@media (max-width: 1050px) { .try-on-layout { grid-template-columns: minmax(0,1fr) 300px; gap: 16px; } .try-on-controls { padding: 18px; } }
@media (max-width: 760px) { .try-on-layout, .try-on-bottom { grid-template-columns: 1fr; } .try-on-stage { min-height: 320px; max-height: calc(100dvh - 160px); } .try-on-heading { align-items: start; } .try-on-heading h1 { font-size: 24px; } .try-on-controls { padding: 20px; } .try-on-bottom { gap: 0; } .try-on-stage-toolbar { gap: 6px; inset: auto 12px 12px; } .try-on-frame-size { font-size: 11px; padding: 4px; } }
</style>
