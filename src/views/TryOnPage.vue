<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { CameraOutlined, VideoCameraOutlined, SwapOutlined, LeftOutlined, PictureOutlined, StopOutlined, DownloadOutlined, DeleteOutlined, PlusOutlined, ExpandOutlined, InfoCircleOutlined, LoadingOutlined, CheckOutlined } from '@ant-design/icons-vue'
import { tryOnApi, emergencyStop, duration, finished, mediaUrl, type Candidate, type Capabilities, type Media, type Prepared, type Selection, type Session } from '../tryon/api'
import { TryOnCamera } from '../tryon/camera'
import { photo, startRecording, type Recorder } from '../tryon/recording'
import { refreshTryOnAccess } from '../tryon/access'
import { onAccountChange, accountIsStale } from '../domain/accountSession'
import MediaPreview from '../tryon/MediaPreview.vue'
import TryOnPicker from '../tryon/TryOnPicker.vue'
import { framingHint } from '../tryon/context'
import { stageLabel } from '../tryon/diagnostic'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import type { Outfit } from '../domain/outfit'

const route = useRoute(), router = useRouter(), { message, modal } = App.useApp()
const host = ref<HTMLElement>(), stage = ref<HTMLElement>(), cap = ref<Capabilities | null>(null)
const loading = ref(true), cameraReady = ref(false), busy = ref(false), error = ref(''), frameReady = ref(false)
const garments = ref<Candidate[]>([]), outfits = ref<Outfit[]>([]), selected = ref<Selection[]>([])
const prepared = ref<Prepared | null>(null), lease = ref<Session | null>(null), picker = ref(false), tab = ref('衣柜'), historyOpen = ref(false)
const media = ref<Media[]>([]), sessionHistory = ref<Session[]>([]), historyPage = ref(1), garmentPage = ref(1), historyBusy = ref(false), search = ref('')
const temporary = ref<{ id: string; imageUrl: string; expiresAtMs: number }[]>([]), uploading = ref(false), importChoice = ref<File | null>(null)
const recording = ref(false), recordingBusy = ref(false), recordingSeconds = ref(0), uploadedBytes = ref(0), recordingError = ref('')
const selectedOutfit = ref<string | null>(null), selectingOutfit = ref<string | null>(null), pendingOutfit = ref<string | null>(null), preparing = ref(false)
const captureMode = ref('拍照'), busyPhase = ref(''), latestBusy = ref(false)
const silentChoice = ref(false), microphoneError = ref(''), now = ref(Date.now()), historyFilter = ref('全部')
let camera: TryOnCamera | undefined, recorder: Recorder | undefined, action = 0, pulseRunning = false, pulseTimer = 0, clockTimer = 0, rebuildTimer = 0, disposed = false, searchTimer = 0, garmentRequest = 0
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
const status = computed(() => offered.value ? `轮到你了，请在 ${waitSeconds.value} 秒内开始` : queued.value ? `等待资源 · 最多再等 ${waitSeconds.value} 秒` : reclaiming.value ? '正在结束并核对消耗' : generating.value ? '正在试穿 · 正在消耗额度' : live.value ? '正在连接，等待生成画面' : '本地预览 · 不消耗试穿额度')
const chosenOutfit = computed(() => outfits.value.find(o => o.id === selectedOutfit.value))
const canUseLatest = computed(() => /确认使用最新|成品.*改变|衣物已经更新/.test(error.value))
const selectionTitle = computed(() => chosenOutfit.value?.name || (selected.value.length ? `${selected.value.length} 件试穿衣物` : '选择衣物或搭配'))
const selectionSummary = computed(() => selected.value.map(selectionName).join('、'))
const captureImage = computed(() => media.value.find(m => m.type === 'PHOTO' && m.state === 'READY'))
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
  return `${framingHint(prepared.value?.items || [])} 点击开始后连接计时。`
})
const mainLabel = computed(() => !selected.value.length ? '选择试穿衣物' : !cameraReady.value ? '打开相机预览' : offered.value ? `开始试穿 · ${waitSeconds.value}秒` : '开始试穿')
const pickerProps = computed(() => ({ garments: garments.value, outfits: outfits.value, selected: selected.value, temporary: temporary.value,
  blocked: queued.value || offered.value || reclaiming.value || busy.value, busyId: selectingOutfit.value, selectedOutfit: selectedOutfit.value,
  uploading: uploading.value, error: error.value, canUseLatest: canUseLatest.value, chooseUpload }))
function applyPrepared(p: Prepared) { prepared.value = p; selected.value = p.items.map(i => ({ type: i.type, id: i.id, revision: i.revision, assetId: i.assetId })) }
function mainAction() { if (!selected.value.length) picker.value = true; else if (!cameraReady.value) void openCamera(); else void begin() }
const selectionName = (s: Selection) => s.type === 'TEMPORARY' ? '自定义衣物' : garments.value.find(g => g.id === s.id)?.name || prepared.value?.items.find(g => g.id === s.id)?.name || '衣物'
const isSelected = (id: string) => selected.value.some(s => s.id === id)
function fail(cause: unknown) { if (!disposed) error.value = cause instanceof Error ? cause.message : '操作暂时未完成，请稍后再试。' }
async function refresh() { cap.value = await tryOnApi.capabilities(); void refreshTryOnAccess() }
async function loadGarments(more = false) {
  try { const page = more ? garmentPage.value + 1 : 1; const request = ++garmentRequest; const rows = await tryOnApi.garments(page, search.value); if (request !== garmentRequest || disposed) return; garments.value = more ? [...garments.value, ...rows] : rows; garmentPage.value = page }
  catch (e) { fail(e) }
}
async function openCamera() {
  if (!cap.value?.enabled || !host.value || busy.value) return
  busy.value = true; busyPhase.value = '正在打开摄像头，请在浏览器提示中允许访问。'; error.value = ''
  try {
    camera ??= new TryOnCamera(host.value, () => { if (!finished(lease.value)) { frameReady.value = true; busyPhase.value = ''; void pulse() } }, cause => { fail(cause); if (live.value) void stop(true) }, stage => { if (live.value) { busyPhase.value = stageLabel[stage]; void pulse() } })
    await camera.open(); cameraReady.value = camera.ready
  } catch (e) { fail(e) } finally { busy.value = false; busyPhase.value = '' }
}
async function build(allowLatest = false) {
  if (!selected.value.length) throw new Error('请先选择至少一件成品衣物或临时衣物。')
  return tryOnApi.prepare(selected.value, undefined, allowLatest)
}
async function connect(s: Session, p: Prepared) {
  if (!camera) throw new Error('请先打开摄像头。')
  await camera.start(s.id, s.environment, p)
}
async function begin() {
  if (busy.value || preparing.value || live.value && !offered.value) return
  const attempt = ++action; busy.value = true; busyPhase.value = '正在准备所选衣物…'; error.value = ''
  try {
    if (!cameraReady.value) throw new Error('请先打开摄像头。')
    let p: Prepared, s: Session
    if (offered.value && lease.value && prepared.value) { p = prepared.value; s = await tryOnApi.accept(lease.value.id) }
    else { p = await build(); applyPrepared(p); busyPhase.value = '正在申请试穿名额…'; s = await tryOnApi.start(p, crypto.randomUUID()) }
    if (attempt !== action || disposed) { emergencyStop(s.id); return }
    lease.value = s
    if (s.state === 'RESERVED') { busyPhase.value = '正在连接实时服务…'; await connect(s, p) }
  } catch (e) { fail(e); if (lease.value && !finished(lease.value) && !queued.value && !offered.value) await stop(true) }
  finally { if (attempt === action) { busy.value = false; if (!live.value) busyPhase.value = '' } }
}
async function pulse() {
  const current = lease.value
  if (!current || finished(current) || pulseRunning || document.hidden || disposed) return
  pulseRunning = true
  try {
    const state = reclaiming.value ? await tryOnApi.session(current.id) : await tryOnApi.pulse(current.id, frameReady.value, camera?.diagnostic)
    if (lease.value?.id !== state.id || disposed) return
    lease.value = state
    if (finished(state) || ['STOPPING', 'UNKNOWN'].includes(state.state)) {
      if (['STARTUP_TIMEOUT','FIRST_FRAME_TIMEOUT','LEASE_EXPIRED','CLIENT_HEARTBEAT_TIMEOUT'].includes(state.reason || '')) {
        const stage = state.diagnostic?.stage || camera?.diagnostic.stage
        error.value = `${stage ? stageLabel[stage] : '实时连接'}超时，连接已结束。请先排查连接或参考图访问，再重试。`
      }
      frameReady.value = false; void finishRecording(true); await camera?.stop(); await refresh()
    }
  } catch (e) { fail(e); if (live.value && !reclaiming.value) void stop(true) }
  finally { pulseRunning = false }
}
async function stop(interrupted = false) {
  action++; busy.value = false; busyPhase.value = ''; frameReady.value = false
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
    const p = await build(allowLatest)
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
async function selectOutfit(id: string, allowLatest = false) {
  if (busy.value || preparing.value || queued.value || offered.value || reclaiming.value) return
  preparing.value = true; selectingOutfit.value = id; pendingOutfit.value = id; error.value = ''
  const before = prepared.value
  try {
    const p = await tryOnApi.prepare([], id, allowLatest)
    if (disposed) return
    if (generating.value && camera && lease.value) {
      await camera.change(p)
      try { await tryOnApi.reference(lease.value.id, p) } catch (e) { if (before) await camera.change(before); throw e }
    }
    applyPrepared(p); selectedOutfit.value = id; pendingOutfit.value = null
    message.success(`已选择「${outfits.value.find(o => o.id === id)?.name || '搭配'}」，共 ${p.items.length} 件。`)
  } catch (e) { fail(e) } finally { preparing.value = false; selectingOutfit.value = null }
}
async function chooseUpload(file: File) { await stop(); importChoice.value = file; return false }
async function uploadTemporary() {
  const file = importChoice.value; if (!file) return
  uploading.value = true; error.value = ''
  try { const item = await tryOnApi.upload(file); temporary.value.push(item); selected.value.push({ type: 'TEMPORARY', id: item.id }); prepared.value = null; importChoice.value = null; message.success('已加入当前页面，七天后删除。') }
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
  try { const item = await tryOnApi.photo(lease.value.id, await photo(camera.video)); media.value.unshift(item); message.success('照片已保存到当前账号。') } catch (e) { fail(e) }
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
async function switchCamera() { if (recording.value || recordingBusy.value || busy.value) return; try { await camera?.switchCamera() } catch (e) { fail(e) } }
async function openHistory() {
  await stop(); historyOpen.value = true; historyBusy.value = true
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
watch(search, () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void loadGarments() }, 250) })
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
onBeforeUnmount(() => { disposed = true; action++; offAccount(); clearInterval(pulseTimer); clearInterval(clockTimer); clearTimeout(rebuildTimer); clearTimeout(searchTimer); document.removeEventListener('visibilitychange', background); window.removeEventListener('pagehide', background); if (lease.value && !finished(lease.value)) emergencyStop(lease.value.id); void finishRecording(true); void camera?.dispose() })
</script>

<template>
  <section class="tryon-page">
    <header class="tryon-header">
      <a-button type="text" class="camera-tool" aria-label="返回衣柜" @click="router.push('/wardrobe')"><LeftOutlined /></a-button>
      <div class="tryon-heading"><h1>实时试穿</h1><span v-if="cap" class="tryon-remaining">{{ live ? '本次' : '今日' }}剩余 {{ duration(remaining) }}</span></div>
      <a-popover title="试穿与拍摄说明" placement="bottomRight"><template #content><p class="tryon-info-copy">打开相机只做本地预览。点击开始后，视频与服装参考图会发送至 XMax，连接后按时长消耗额度。录像声音仅用于本地混录。切后台会结束试穿，未上传的最后片段可能丢失。</p></template><a-button type="text" class="camera-tool" aria-label="查看试穿说明"><InfoCircleOutlined /></a-button></a-popover>
      <a-button type="text" class="camera-tool" :disabled="recording || recordingBusy || busy || !cameraReady" aria-label="切换前后摄像头" @click="switchCamera"><SwapOutlined /></a-button>
    </header>
    <a-skeleton v-if="loading" active class="tryon-loading" />
    <template v-else>
      <div class="tryon-body">
        <div ref="stage" class="tryon-stage">
          <div ref="host" class="tryon-video-host" aria-label="摄像头与试穿画面"></div>
          <div v-if="!cameraReady" class="tryon-stage-cover">
            <CameraOutlined class="tryon-camera-symbol" />
            <h2>{{ cap?.enabled ? '把衣柜穿在身上' : '实时试穿暂未开通' }}</h2>
            <p>{{ cap?.enabled ? '选好衣物，打开相机预览。\n点击开始试穿后才连接实时服务。' : '由管理员开通，你仍可查看已保存的拍摄结果。' }}</p>
            <a-button v-if="cap?.enabled" type="primary" size="large" :loading="busy" @click="openCamera">{{ busy ? '正在打开相机' : '打开相机预览' }}</a-button>
            <a-button v-else @click="openHistory">查看拍摄历史</a-button>
          </div>
          <div v-if="cameraReady" class="tryon-status" :class="{ live: generating, waiting: live && !generating }" role="status"><i></i>{{ generating ? `正在试穿 · ${duration(remaining)}` : status }}</div>
          <div v-if="busy && cameraReady || live && !generating && !queued && !offered" class="tryon-connection" role="status" aria-live="polite"><LoadingOutlined v-if="!reclaiming" spin /><StopOutlined v-else /><strong>{{ reclaiming ? '正在结束并核对消耗' : busyPhase || '等待第一帧试穿效果' }}</strong><span v-if="lease && !reclaiming">剩余等待 {{ waitSeconds }} 秒</span><p>{{ reclaiming ? '核对完成后会释放未使用的预留额度。' : '请保持人在画面中。连接后开始计时，超时会自动结束。' }}</p><a-button v-if="live && !reclaiming" size="small" @click="stop()">取消本次试穿</a-button></div>
          <div v-if="recording" class="tryon-recording-status" role="status"><i></i> REC {{ duration(recordingSeconds) }}<small>已上传 {{ (uploadedBytes / 1024).toFixed(0) }} KiB</small></div>
          <a-button v-if="cameraReady" type="text" class="tryon-enlarge" aria-label="放大相机预览" @click="stage?.requestFullscreen?.()"><ExpandOutlined /></a-button>
          <a-button v-if="live" class="tryon-fullscreen-stop" danger @click="stop()">停止试穿</a-button>
          <div v-if="offered" class="tryon-offer"><h2>轮到你了</h2><p>名额保留 {{ waitSeconds }} 秒，点击后连接实时服务。</p><a-button type="primary" size="large" :loading="busy" @click="begin">开始试穿</a-button></div>
          <div v-if="error && !picker" class="tryon-stage-error" role="alert"><p>{{ error }}</p><a-button v-if="canUseLatest" size="small" :loading="latestBusy" @click="latest">使用最新成品</a-button><a-button v-else type="text" size="small" @click="error=''">收起提示</a-button></div>
        </div>
        <aside class="tryon-picker-desktop"><TryOnPicker v-bind="pickerProps" v-model:search="search" v-model:tab="tab" @toggle="toggle" @outfit="selectOutfit" @more="loadGarments(true)" @latest="latest" /></aside>
      </div>
      <div class="tryon-dock">
        <a-button class="tryon-current" :aria-label="`选择试穿衣物，${selected.length}件已选`" @click="picker=true">
          <img v-if="prepared" class="tryon-current-image" :src="mediaUrl(prepared.previewUrl)" alt="当前试穿衣物组合" />
          <OutfitThumbnail v-else-if="chosenOutfit" class="tryon-current-image" :scene="chosenOutfit.scene" :title="chosenOutfit.name" />
          <div v-else class="tryon-current-placeholder"><PlusOutlined /></div>
          <span class="tryon-current-copy"><strong>{{ selectionTitle }}</strong><small>{{ selected.length ? `${selected.length} 件 · ${selectionSummary}` : '衣柜成品、已存搭配或临时上传' }}</small></span><span class="tryon-current-change">{{ selected.length ? '换一套' : '去选衣' }}</span>
        </a-button>
        <div class="tryon-mode"><a-segmented v-model:value="captureMode" :options="['拍照','录像']" :disabled="recording || recordingBusy" /></div>
        <div class="tryon-controls">
          <a-button class="tryon-history-thumb" aria-label="查看拍摄历史" @click="openHistory"><img v-if="captureImage" :src="mediaUrl(captureImage.url)" alt="最近拍摄的试穿照片" /><PictureOutlined v-else /><span>历史</span></a-button>
          <a-button v-if="generating || recording" class="tryon-shutter" shape="circle" :danger="recording" :loading="recordingBusy" :aria-label="recording ? '结束录像' : captureMode === '录像' ? '开始录像' : '拍下试穿效果'" @click="recording ? finishRecording() : captureMode === '录像' ? record() : takePhoto()"><StopOutlined v-if="recording" /><VideoCameraOutlined v-else-if="captureMode==='录像'" /><CameraOutlined v-else /></a-button>
          <a-button v-else-if="live && !offered" class="tryon-main-action" :loading="busy || reclaiming" :disabled="reclaiming" @click="stop()">{{ queued ? '取消排队' : reclaiming ? '正在结束' : '取消连接' }}</a-button>
          <a-button v-else type="primary" class="tryon-main-action" :disabled="!cap?.enabled || preparing || selected.length > 0 && cameraReady && !cap?.ready && !offered" :loading="busy" @click="mainAction">{{ mainLabel }}</a-button>
          <a-button v-if="generating || recording" class="tryon-end" type="text" danger aria-label="停止试穿" @click="stop()"><StopOutlined /><span>停止</span></a-button><span v-else class="tryon-control-spacer" aria-hidden="true"></span>
        </div>
        <p class="tryon-start-hint" :class="{active:generating}" role="status" aria-live="polite">{{ !cap?.ready && !live && cap?.enabled ? cap.reason : startHint }}</p>
        <a-alert v-if="recordingError" class="tryon-recording-error" type="warning" show-icon :message="recordingError" closable @close="recordingError=''" />
      </div>
    </template>
    <a-drawer v-model:open="picker" title="选择试穿衣物" placement="bottom" height="min(76dvh, 760px)" root-class-name="tryon-material-drawer"><p v-if="generating" class="tryon-paid-notice">选衣期间仍在计时 · {{ duration(remaining) }} <a-button size="small" danger @click="stop()">停止试穿</a-button></p><TryOnPicker v-bind="pickerProps" v-model:search="search" v-model:tab="tab" @toggle="toggle" @outfit="selectOutfit" @more="loadGarments(true)" @latest="latest" /><template #footer><div class="tryon-picker-footer"><span>{{ selected.length ? `已选 ${selected.length} 件衣物` : '尚未选择衣物' }}</span><a-button type="primary" :disabled="preparing" @click="picker=false">{{ selected.length ? '选好了，返回相机' : '返回相机' }}</a-button></div></template></a-drawer>
    <a-drawer v-model:open="historyOpen" title="拍摄历史" placement="right" :width="'min(100vw, 620px)'"><a-alert type="info" show-icon message="历史查看期间已停止实时连接。" /><a-segmented v-model:value="historyFilter" :options="['全部','照片','视频']" block /><a-spin :spinning="historyBusy"><a-empty v-if="!visibleMedia.length" description="主动拍摄的照片和录像会保存在这里" /><article v-for="item in visibleMedia" :key="item.id" class="tryon-history-item"><MediaPreview v-if="item.type==='VIDEO' && ['READY','PARTIAL'].includes(item.state)" :src="mediaUrl(item.url)" :duration-ms="item.durationMs" /><img v-else-if="item.type==='PHOTO'" :src="mediaUrl(item.url)" alt="AI试穿效果" /><div v-else class="tryon-pending-media">{{ item.state === 'UNRECOVERABLE' ? '片段不足以恢复录像，可删除释放空间' : '分段已上传，正在恢复可用片段' }}</div><div><strong>{{ item.type==='PHOTO' ? '试穿照片' : `${item.state==='PARTIAL'?'中断片段':'录像'} · ${duration(item.durationMs/1000)}` }}</strong><p>{{ new Date(item.createdAtMs).toLocaleString() }} <template v-if="item.type==='VIDEO'"> · {{ item.hasAudio?'有声':'无声' }} · {{ item.mimeType.split('/')[1]?.toUpperCase() }}</template></p><div class="tryon-history-actions"><a-button :href="mediaUrl(item.downloadUrl)" :disabled="!['READY','PARTIAL'].includes(item.state)"><DownloadOutlined /> 下载</a-button><a-button v-if="cap?.enabled" @click="repeat(item)">再次试穿</a-button><a-button type="text" danger aria-label="删除结果" @click="remove(item)"><DeleteOutlined /></a-button></div></div></article><a-button block :loading="historyBusy" @click="moreHistory">加载更多结果</a-button><a-collapse v-if="sessionHistory.length" ghost><a-collapse-panel key="sessions" header="查看会话与用量记录"><p v-for="s in sessionHistory" :key="s.id" class="tryon-session-history">{{ new Date(s.createdAtMs).toLocaleString() }} · {{ stateName(s.state) }} · {{ duration(s.userSeconds) }}</p></a-collapse-panel></a-collapse></a-spin></a-drawer>
    <a-modal :open="!!importChoice" title="这件衣物是否入柜？" :footer="null" @cancel="importChoice=null"><p>入柜会进入现有衣物处理流程。仅试穿不会自动识图或生图，离开页面后不恢复。</p><div class="tryon-modal-actions"><a-button :loading="uploading" @click="uploadTemporary">仅当前页面试穿</a-button><a-button type="primary" @click="importGarment">进入入柜流程</a-button></div></a-modal>
    <a-modal v-model:open="silentChoice" title="麦克风暂不可用" :footer="null"><p>{{ microphoneError }}</p><div class="tryon-modal-actions"><a-button @click="silentChoice=false; record(true)">继续无声录像</a-button><a-button type="primary" @click="silentChoice=false; record()">重新申请麦克风</a-button></div></a-modal>
  </section>
</template>

<style scoped>
.tryon-page{max-width:1600px;margin:auto;display:flex;flex-direction:column;gap:16px}.tryon-header{display:flex;align-items:center;gap:12px;min-height:48px}.camera-tool.ant-btn{width:44px;height:44px;flex:none;font-size:19px}.tryon-heading{flex:1;display:flex;align-items:baseline;gap:16px;min-width:0}.tryon-heading h1{font-size:24px}.tryon-remaining{color:var(--accent);font-size:14px;font-variant-numeric:tabular-nums}.tryon-body{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;min-height:400px}.tryon-stage{position:relative;height:min(65dvh,720px);min-height:400px;background:#111b17;overflow:hidden;border-radius:var(--radius-lg)}.tryon-video-host{position:absolute;inset:0}.tryon-video-host :deep(.tryon-local),.tryon-video-host :deep(.tryon-remote){position:absolute!important;inset:0!important;width:100%!important;height:100%!important}.tryon-video-host :deep(.tryon-remote){visibility:hidden}.tryon-video-host.has-result :deep(.tryon-local){visibility:hidden}.tryon-video-host.has-result :deep(.tryon-remote){visibility:visible}.tryon-video-host :deep(video){object-fit:contain!important}.tryon-stage-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:18px;color:#fff;padding:28px}.tryon-camera-symbol{font-size:42px;color:#b5cec0}.tryon-stage-cover h2{font-size:22px;font-weight:500}.tryon-stage-cover p{color:#d1e0d7;max-width:32ch;line-height:1.8;white-space:pre-line}.tryon-stage-cover>.ant-btn-primary{background:#d7eee1;border-color:#d7eee1;color:#163e2e;min-height:48px;padding-inline:24px}.tryon-status{position:absolute;top:16px;left:16px;right:64px;display:flex;align-items:center;gap:8px;width:fit-content;max-width:calc(100% - 80px);padding:8px 12px;border-radius:20px;background:#101714d9;color:#fff;font-size:12px;line-height:1.5}.tryon-status i{width:6px;height:6px;background:#c9d4cd;border-radius:50%;flex:none}.tryon-status.live i{background:#91e3af}.tryon-status.waiting i{background:#f2d28b}.tryon-recording-status{position:absolute;top:62px;left:16px;background:#261511e8;color:#ffcbbe;padding:8px 12px;border-radius:8px;font-variant-numeric:tabular-nums}.tryon-recording-status i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff806e;margin-right:8px}.tryon-recording-status small{display:block;margin-top:4px;font-size:11px;color:#f6d9d1}.tryon-enlarge.ant-btn{position:absolute;right:12px;top:12px;width:40px;height:40px;color:#fff;background:#101714bb}.tryon-enlarge.ant-btn:hover{color:white;background:#263c30}.tryon-connection{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(300px,85%);display:flex;align-items:center;flex-direction:column;gap:12px;color:#fff;text-align:center;background:#101714ed;padding:24px 18px;border-radius:16px}.tryon-connection>.anticon{font-size:26px;color:#c8e8d7}.tryon-connection strong{font-size:16px;font-weight:500}.tryon-connection span,.tryon-connection p{font-size:12px;line-height:1.7;color:#d7e3dc}.tryon-connection .ant-btn{margin-top:4px}.tryon-offer{position:absolute;inset:30% 10% auto;background:var(--surface);color:var(--ink);padding:24px;display:grid;gap:14px;text-align:center;border-radius:14px}.tryon-stage-error{position:absolute;left:12px;right:12px;bottom:12px;background:#fff7e8;color:#5e3a0c;padding:12px 14px;border-radius:10px;font-size:13px;line-height:1.7}.tryon-stage-error .ant-btn{margin-top:8px}.tryon-picker-desktop{border:1px solid var(--line);border-radius:var(--radius-lg);padding:16px;max-height:min(65dvh,720px);overflow:auto}.tryon-dock{display:flex;flex-direction:column;gap:10px}.tryon-current.ant-btn{width:100%;height:72px;display:flex;align-items:center;gap:12px;padding:8px 12px;text-align:left;white-space:normal;border-color:var(--line);background:var(--surface)}.tryon-current-image{width:54px;height:54px;flex:none;object-fit:contain;background:var(--surface-alt);overflow:hidden;border-radius:7px}.tryon-current-image :deep(canvas){width:100%;height:100%;object-fit:contain}.tryon-current-placeholder{width:54px;height:54px;flex:none;display:grid;place-items:center;border:1px dashed var(--line);border-radius:7px;color:var(--accent);font-size:20px}.tryon-current-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}.tryon-current-copy strong{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tryon-current-copy small{font-size:12px;color:var(--muted-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tryon-current-change{font-size:12px;color:var(--accent);flex:none}.tryon-mode{align-self:center}.tryon-controls{display:grid;grid-template-columns:64px minmax(0,1fr) 64px;align-items:center;gap:16px;max-width:420px;width:100%;align-self:center;min-height:78px}.tryon-history-thumb.ant-btn,.tryon-end.ant-btn{width:56px;height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:20px;padding:4px;border:0;background:transparent;position:relative}.tryon-history-thumb>span:last-child,.tryon-end>span:last-child{font-size:11px}.tryon-history-thumb img{height:38px;width:38px;object-fit:cover;border-radius:6px}.tryon-shutter.ant-btn{justify-self:center;width:76px;height:76px;border:4px solid var(--surface);outline:2px solid var(--ink);background:var(--ink);color:var(--surface);font-size:26px;display:grid;place-items:center}.tryon-shutter.ant-btn-dangerous{outline-color:var(--danger);background:var(--danger);color:#fff}.tryon-main-action.ant-btn{justify-self:center;min-height:52px;width:min(100%,230px);font-size:15px;font-weight:500;border-radius:26px}.tryon-start-hint{align-self:center;text-align:center;max-width:70ch;font-size:12px;line-height:1.7;color:var(--muted-strong);margin:0;min-height:21px}.tryon-start-hint.active{color:var(--accent)}.tryon-info-copy{max-width:30ch;font-size:13px;line-height:1.8}.tryon-fullscreen-stop{display:none}.tryon-stage:fullscreen{height:100dvh;border-radius:0}.tryon-stage:fullscreen .tryon-fullscreen-stop{display:block;position:absolute;bottom:24px;right:24px}.tryon-picker-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;font-size:13px;color:var(--muted-strong);padding-bottom:env(safe-area-inset-bottom)}.tryon-paid-notice{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--accent);font-size:13px;margin-bottom:16px}.tryon-history-item{padding:20px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:140px minmax(0,1fr);gap:16px}.tryon-history-item>img{width:140px;max-height:200px;object-fit:contain;border-radius:8px;background:var(--surface-alt)}.tryon-history-item p{font-size:12px;color:var(--muted-strong);line-height:1.7;margin:8px 0}.tryon-history-actions{display:flex;gap:6px;flex-wrap:wrap}.tryon-pending-media{font-size:12px;color:var(--muted-strong);background:var(--surface-alt);padding:16px}.tryon-modal-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px;flex-wrap:wrap}.tryon-session-history{font-size:12px;color:var(--muted-strong);padding:8px 0}
@media(max-width:767px){.tryon-page{height:100dvh;min-height:0;gap:0;overflow:hidden;background:var(--surface);padding:0}.tryon-header{flex:none;background:#111b17;color:#fff;min-height:54px;padding:calc(env(safe-area-inset-top) + 4px) 8px 4px;gap:4px}.tryon-header .camera-tool.ant-btn{color:#fff}.tryon-header .camera-tool.ant-btn:disabled{color:#869a8e}.tryon-heading{display:flex;flex-direction:column;align-items:center;gap:3px}.tryon-heading h1{font-size:16px;font-weight:500}.tryon-remaining{font-size:11px;color:#b8ddc7}.tryon-body{display:block;flex:1;min-height:0}.tryon-stage{height:100%;min-height:0;border-radius:0}.tryon-stage-cover{padding:20px;gap:16px}.tryon-stage-cover h2{font-size:20px}.tryon-stage-cover p{font-size:13px}.tryon-camera-symbol{font-size:34px}.tryon-picker-desktop{display:none}.tryon-dock{flex:none;padding:10px 16px calc(env(safe-area-inset-bottom) + 8px);gap:7px}.tryon-current.ant-btn{height:62px;padding:6px 10px;gap:10px}.tryon-current-image,.tryon-current-placeholder{height:46px;width:46px}.tryon-current-copy strong{font-size:13px}.tryon-current-copy small{font-size:11px}.tryon-mode{height:30px}.tryon-mode :deep(.ant-segmented-item-label){min-height:26px;line-height:26px;font-size:12px;padding-inline:20px}.tryon-controls{min-height:76px;max-width:340px}.tryon-shutter.ant-btn{width:70px;height:70px;font-size:25px}.tryon-start-hint{font-size:11px;line-height:1.6;min-height:18px;width:100%;max-width:44ch}.tryon-history-item{grid-template-columns:100px minmax(0,1fr);gap:12px}.tryon-history-item>img{width:100px;max-height:150px}.tryon-history-actions .ant-btn{padding-inline:8px;font-size:12px}.tryon-stage-error{font-size:12px}.tryon-loading{padding:20px}.tryon-recording-error{position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 12px);z-index:35}}
@media(max-height:650px) and (max-width:767px){.tryon-dock{gap:4px;padding-top:6px}.tryon-current.ant-btn{height:54px}.tryon-current-image,.tryon-current-placeholder{width:40px;height:40px}.tryon-controls{min-height:64px}.tryon-shutter.ant-btn{height:60px;width:60px}.tryon-stage-cover{gap:10px}.tryon-stage-cover p{font-size:12px}}
@media(prefers-reduced-motion:reduce){.tryon-page *{transition:none!important;scroll-behavior:auto!important}}
</style>
