<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App, Tabs as ATabs } from 'ant-design-vue'
const ATabPane = ATabs.TabPane
import { CameraOutlined, VideoCameraOutlined, SwapOutlined, LeftOutlined, PictureOutlined, StopOutlined, DownloadOutlined, DeleteOutlined, PlusOutlined, ExpandOutlined } from '@ant-design/icons-vue'
import { tryOnApi, emergencyStop, duration, finished, mediaUrl, type Candidate, type Capabilities, type Media, type Prepared, type Selection, type Session } from '../tryon/api'
import { TryOnCamera } from '../tryon/camera'
import { photo, startRecording, type Recorder } from '../tryon/recording'
import { refreshTryOnAccess } from '../tryon/access'
import { onAccountChange, accountIsStale } from '../domain/accountSession'
import MediaPreview from '../tryon/MediaPreview.vue'

const route = useRoute(), router = useRouter(), { message, modal } = App.useApp()
const host = ref<HTMLElement>(), stage = ref<HTMLElement>(), cap = ref<Capabilities | null>(null)
const loading = ref(true), cameraReady = ref(false), busy = ref(false), error = ref(''), frameReady = ref(false)
const garments = ref<Candidate[]>([]), outfits = ref<{ id: string; name: string }[]>([]), selected = ref<Selection[]>([])
const prepared = ref<Prepared | null>(null), lease = ref<Session | null>(null), picker = ref(false), tab = ref('衣柜'), historyOpen = ref(false)
const media = ref<Media[]>([]), sessionHistory = ref<Session[]>([]), historyPage = ref(1), garmentPage = ref(1), historyBusy = ref(false), search = ref('')
const temporary = ref<{ id: string; imageUrl: string; expiresAtMs: number }[]>([]), uploading = ref(false), importChoice = ref<File | null>(null)
const recording = ref(false), recordingBusy = ref(false), recordingSeconds = ref(0), uploadedBytes = ref(0), recordingError = ref('')
const silentChoice = ref(false), microphoneError = ref(''), now = ref(Date.now()), historyFilter = ref('全部')
let camera: TryOnCamera | undefined, recorder: Recorder | undefined, action = 0, pulseRunning = false, pulseTimer = 0, clockTimer = 0, rebuildTimer = 0, disposed = false, searchTimer = 0, garmentRequest = 0
const live = computed(() => !finished(lease.value))
const queued = computed(() => lease.value?.state === 'QUEUED')
const offered = computed(() => lease.value?.state === 'OFFERED')
const generating = computed(() => frameReady.value && ['WAITING_FRAME', 'GENERATING'].includes(lease.value?.state || ''))
const reclaiming = computed(() => ['STOPPING', 'UNKNOWN'].includes(lease.value?.state || ''))
const filteredGarments = computed(() => garments.value.filter(g => (g.name || '').toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
const visibleMedia = computed(() => media.value.filter(m => historyFilter.value === '全部' || m.type === (historyFilter.value === '照片' ? 'PHOTO' : 'VIDEO')))
const remaining = computed(() => {
  const s = lease.value
  if (!s || finished(s)) return cap.value?.quota.remaining || 0
  if (s.connectedAtMs) return Math.max(0, s.reservedPoints - Math.floor((now.value - s.connectedAtMs) / 1000))
  return s.reservedPoints
})
const waitSeconds = computed(() => Math.max(0, Math.ceil(((lease.value?.deadlineAtMs || 0) - now.value) / 1000)))
const status = computed(() => offered.value ? `轮到你了，请在 ${waitSeconds.value} 秒内开始` : queued.value ? `等待资源 · 最多再等 ${waitSeconds.value} 秒` : reclaiming.value ? '正在结束并核对消耗' : generating.value ? '正在试穿 · 正在消耗额度' : live.value ? '正在连接，等待生成画面' : '本地预览 · 不消耗试穿额度')
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
  busy.value = true; error.value = ''
  try {
    camera ??= new TryOnCamera(host.value, () => { if (!finished(lease.value)) { frameReady.value = true; void pulse() } }, cause => { fail(cause); if (live.value) void stop(true) })
    await camera.open(); cameraReady.value = camera.ready
  } catch (e) { fail(e) } finally { busy.value = false }
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
  if (busy.value || live.value && !offered.value) return
  const attempt = ++action; busy.value = true; error.value = ''
  try {
    if (!cameraReady.value) throw new Error('请先打开摄像头。')
    let p: Prepared, s: Session
    if (offered.value && lease.value && prepared.value) { p = prepared.value; s = await tryOnApi.accept(lease.value.id) }
    else { p = await build(); prepared.value = p; s = await tryOnApi.start(p, crypto.randomUUID()) }
    if (attempt !== action || disposed) { emergencyStop(s.id); return }
    lease.value = s
    if (s.state === 'RESERVED') await connect(s, p)
  } catch (e) { fail(e); if (lease.value && !finished(lease.value) && !queued.value && !offered.value) await stop(true) }
  finally { if (attempt === action) busy.value = false }
}
async function pulse() {
  const current = lease.value
  if (!current || finished(current) || pulseRunning || document.hidden || disposed) return
  pulseRunning = true
  try {
    const state = reclaiming.value ? await tryOnApi.session(current.id) : await tryOnApi.pulse(current.id, frameReady.value)
    if (lease.value?.id !== state.id || disposed) return
    lease.value = state
    if (finished(state) || ['STOPPING', 'UNKNOWN'].includes(state.state)) {
      frameReady.value = false; void finishRecording(true); await camera?.stop(); await refresh()
    }
  } catch (e) { fail(e); if (live.value && !reclaiming.value) void stop(true) }
  finally { pulseRunning = false }
}
async function stop(interrupted = false) {
  action++; busy.value = false; frameReady.value = false
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
    try { await tryOnApi.reference(id, p); prepared.value = p }
    catch (e) { if (before) await camera.change(before); throw e }
  } catch (e) { fail(e) }
}
function toggle(item: Selection) {
  if (busy.value || reclaiming.value || queued.value || offered.value) return
  error.value = ''
  selected.value = isSelected(item.id) ? selected.value.filter(s => s.id !== item.id) : [...selected.value, item]
  clearTimeout(rebuildTimer)
  if (generating.value) {
    if (!selected.value.length) { void stop(); return }
    rebuildTimer = window.setTimeout(() => { void rebuild() }, 300)
  } else prepared.value = null
}
async function selectOutfit(id: string) {
  if (busy.value) return; busy.value = true; error.value = ''
  try {
    const p = await tryOnApi.prepare([], id)
    if (generating.value && camera && lease.value) { await camera.change(p); await tryOnApi.reference(lease.value.id, p) }
    prepared.value = p; selected.value = p.items.map(i => ({ type: i.type, id: i.id, revision: i.revision }))
  } catch (e) { fail(e) } finally { busy.value = false }
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
  try { const items = await tryOnApi.repeatItems(item.id); selected.value = items.map(i => ({ type: i.type, id: i.id, revision: i.revision })); historyOpen.value = false } catch (e) { fail(e); return }
  try { const p = await tryOnApi.repeat(item.id); prepared.value = p; selected.value = p.items.map(i => ({ type: i.type, id: i.id, revision: i.revision })); historyOpen.value = false; error.value = ''; message.info('组合已恢复，请打开相机后主动开始。') }
  catch (e) { fail(e); message.warning('素材可能已更新或临时衣物已过期，请重新选择。') }
}
function latest() { error.value = ''; if (generating.value) void rebuild(true); else void tryOnApi.prepare(selected.value, undefined, true).then(p => { prepared.value = p; selected.value = p.items.map(i => ({ type: i.type, id: i.id, revision: i.revision })); message.info('已选择最新成品。') }).catch(fail) }
watch(search, () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void loadGarments() }, 250) })
const stateName = (state: string) => ({ QUEUED:'排队中', OFFERED:'等待确认', RESERVED:'已授权', SIGNING:'申请连接', CONNECTING:'连接中', WAITING_FRAME:'等待画面', GENERATING:'试穿中', STOPPING:'结束中', UNKNOWN:'消耗待核对', CLOSED:'已结束', FAILED:'启动失败', CANCELLED:'已取消' }[state] || '待核对')
const offAccount = onAccountChange(() => { if (accountIsStale()) { background(); void stop(true); void camera?.dispose() } })
onMounted(async () => {
  try {
    await refresh()
    if (cap.value?.enabled) { await Promise.all([loadGarments(), tryOnApi.outfits().then(rows => { outfits.value = rows })]); if (typeof route.query.garment === 'string') { const g = garments.value.find(g => g.id === route.query.garment) || await tryOnApi.garment(route.query.garment); if (!garments.value.some(v => v.id === g.id)) garments.value.unshift(g); if (g?.ready) selected.value = [{ type: 'GARMENT', id: g.id, revision: g.revision }]; else error.value = '该衣物尚无可用成品，请完成处理后再试。' }
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
      <a-button type="text" aria-label="返回衣柜" @click="router.push('/wardrobe')"><LeftOutlined /><span class="tryon-desktop-label">返回衣柜</span></a-button>
      <div class="tryon-heading"><h1>实时试穿</h1><span v-if="cap" class="tryon-remaining">{{ live ? '本次' : '今日' }}剩余 {{ duration(remaining) }}</span></div>
      <a-button :disabled="recording || recordingBusy || busy || !cameraReady" aria-label="切换前后摄像头" @click="switchCamera"><SwapOutlined /><span class="tryon-desktop-label">切镜头</span></a-button>
      <a-button class="tryon-desktop-history" @click="openHistory"><PictureOutlined /> 拍摄历史</a-button>
    </header>
    <a-skeleton v-if="loading" active />
    <template v-else>
      <a-alert v-if="error" class="tryon-error" type="warning" show-icon :message="error" closable @close="error = ''"><template #action><a-button v-if="error.includes('更新')" size="small" @click="latest">使用最新成品</a-button></template></a-alert>
      <div class="tryon-body">
        <div ref="stage" class="tryon-stage">
          <div ref="host" class="tryon-video-host" aria-label="摄像头与试穿画面"></div>
          <div v-if="!cameraReady" class="tryon-stage-cover">
            <CameraOutlined class="tryon-camera-symbol" />
            <h2>{{ cap?.enabled ? '看看这套衣服穿在身上' : '实时试穿暂未开通' }}</h2>
            <p>{{ cap?.enabled ? '先打开摄像头预览，选好衣物后再开始。' : '开通由管理员控制，你仍可查看已保存的结果。' }}</p>
            <a-button v-if="cap?.enabled" type="primary" size="large" :loading="busy" @click="openCamera">打开摄像头</a-button>
            <a-button v-else @click="openHistory">查看拍摄历史</a-button>
          </div>
          <div v-else class="tryon-status" :class="{ live: generating, waiting: live && !generating }" role="status">{{ status }}</div>
          <div v-if="recording" class="tryon-recording-status" role="status"><i></i> 录制 {{ duration(recordingSeconds) }}<small>已上传 {{ (uploadedBytes / 1024).toFixed(0) }} KiB</small></div>
          <a-button v-if="cameraReady" type="text" class="tryon-enlarge" aria-label="放大相机预览" @click="stage?.requestFullscreen?.()"><ExpandOutlined /></a-button>
          <a-button v-if="live" class="tryon-fullscreen-stop" danger @click="stop()">停止试穿</a-button>
          <div v-if="offered" class="tryon-offer"><h2>轮到你了</h2><p>名额保留 {{ waitSeconds }} 秒，点击后才开始连接。</p><a-button type="primary" size="large" :loading="busy" @click="begin">开始试穿</a-button></div>
        </div>
        <aside class="tryon-picker-desktop">
          <div class="tryon-picker-content">
            <a-segmented v-model:value="tab" :options="['衣柜','已存搭配','临时上传']" block />
            <template v-if="tab === '衣柜'">
              <a-input v-model:value="search" placeholder="查找衣柜成品" allow-clear />
              <p class="tryon-help">只使用当前已完成处理的成品图。</p>
              <a-empty v-if="!filteredGarments.length" description="暂无成品衣物，可先完成处理或临时上传" /><div class="tryon-garment-grid"><a-button v-for="g in filteredGarments" :key="g.id" class="tryon-garment-option" :class="{ selected: isSelected(g.id) }" :disabled="!g.ready || queued || offered || reclaiming" :aria-pressed="isSelected(g.id)" :title="g.reason || g.name" @click="toggle({ type: 'GARMENT', id: g.id, revision: g.revision })"><img v-if="g.ready" :src="mediaUrl(g.imageUrl)" :alt="g.name || '衣物成品'" /><span v-else class="tryon-no-product"><CameraOutlined />待完成处理</span><span>{{ g.name || '衣物' }}</span></a-button></div>
              <a-button block @click="loadGarments(true)">加载更多衣物</a-button>
            </template>
            <template v-else-if="tab === '已存搭配'"><a-empty v-if="!outfits.length" description="还没有已保存搭配" /><a-button v-for="outfit in outfits" :key="outfit.id" block :loading="busy" @click="selectOutfit(outfit.id)">{{ outfit.name }}</a-button></template>
            <template v-else><p class="tryon-help">上传前先停止试穿。可选择入柜；不入柜只在当前页面使用，上传起七天删除。</p><a-upload accept="image/png,image/jpeg" :show-upload-list="false" :before-upload="chooseUpload"><a-button block :loading="uploading"><PlusOutlined /> 上传衣物照片</a-button></a-upload><div class="tryon-garment-grid"><a-button v-for="t in temporary" :key="t.id" class="tryon-garment-option" :class="{ selected: isSelected(t.id) }" @click="toggle({ type: 'TEMPORARY', id: t.id })"><img :src="mediaUrl(t.imageUrl)" alt="临时衣物" /><span>自定义衣物</span></a-button></div></template>
          </div>
        </aside>
      </div>
      <div class="tryon-current"><a-button class="tryon-mobile-picker" @click="picker = true">选择衣物 / 搭配</a-button><div class="tryon-selection"><a-tag v-for="item in selected" :key="item.type+item.id" closable @close.prevent="toggle(item)">{{ selectionName(item) }}</a-tag><span v-if="!selected.length">尚未选择衣物</span></div></div>
      <a-alert v-if="cap?.enabled && !cap.ready && !live" type="info" show-icon :message="cap.reason" />
      <a-alert v-if="recordingError" type="warning" show-icon :message="recordingError" closable @close="recordingError = ''" />
      <footer class="tryon-controls">
        <a-button class="tryon-history-thumb" aria-label="查看拍摄历史" @click="openHistory"><PictureOutlined /><span>历史</span></a-button>
        <a-button :disabled="!generating" aria-label="拍下试穿效果" @click="takePhoto"><CameraOutlined /><span>拍照</span></a-button>
        <a-button :disabled="!generating && !recording" :loading="recordingBusy" :danger="recording" aria-label="录像或结束录像" @click="recording ? finishRecording() : record()"><StopOutlined v-if="recording" /><VideoCameraOutlined v-else /><span>{{ recording ? '结束录像' : '录像' }}</span></a-button>
        <a-button v-if="live && !offered" class="tryon-main-action" :danger="!queued" :disabled="reclaiming" @click="stop()">{{ queued ? '取消排队' : reclaiming ? '正在回收' : '停止试穿' }}</a-button>
        <a-button v-else type="primary" class="tryon-main-action" :disabled="!cap?.enabled || !cameraReady || !selected.length || !cap?.ready && !offered" :loading="busy" @click="begin">{{ offered ? `开始（${waitSeconds}秒）` : '开始试穿' }}</a-button>
      </footer>
      <p class="tryon-disclosure">开始后，视频与服装参考图将发送至 XMax，按连接时长消耗额度。录像声音仅用于本地混录；切后台会结束试穿，最后未上传片段可能丢失。</p>
    </template>
    <a-drawer v-model:open="picker" title="选择试穿衣物" placement="bottom" height="min(64dvh, 620px)" root-class-name="tryon-mobile-drawer"><p v-if="generating" class="tryon-paid-notice">选衣期间仍在消耗额度 · {{ duration(remaining) }} <a-button size="small" danger @click="stop()">停止试穿</a-button></p><a-tabs><a-tab-pane key="garments" tab="衣柜成品"><a-input v-model:value="search" placeholder="查找衣物" allow-clear /><a-empty v-if="!filteredGarments.length" description="暂无成品衣物，可先完成处理或临时上传" /><div class="tryon-garment-grid"><a-button v-for="g in filteredGarments" :key="g.id" class="tryon-garment-option" :class="{ selected: isSelected(g.id) }" :disabled="!g.ready || queued || offered || reclaiming" :aria-pressed="isSelected(g.id)" :title="g.reason" @click="toggle({ type:'GARMENT',id:g.id,revision:g.revision })"><img v-if="g.ready" :src="mediaUrl(g.imageUrl)" :alt="g.name || '衣物'" /><span v-else class="tryon-no-product">请先完成处理</span><span>{{ g.name || '衣物' }}</span></a-button></div><a-button block @click="loadGarments(true)">加载更多</a-button></a-tab-pane><a-tab-pane key="outfits" tab="已存搭配"><a-button v-for="o in outfits" :key="o.id" block :loading="busy" @click="selectOutfit(o.id)">{{ o.name }}</a-button></a-tab-pane><a-tab-pane key="temporary" tab="临时上传"><a-upload accept="image/png,image/jpeg" :show-upload-list="false" :before-upload="chooseUpload"><a-button :loading="uploading"><PlusOutlined /> 上传前会停止试穿</a-button></a-upload><p class="tryon-help">不入柜仅当前页面使用，七天后删除。</p><div class="tryon-garment-grid"><a-button v-for="t in temporary" :key="t.id" class="tryon-garment-option" :class="{ selected:isSelected(t.id) }" @click="toggle({type:'TEMPORARY',id:t.id})"><img :src="mediaUrl(t.imageUrl)" alt="临时衣物" /><span>自定义衣物</span></a-button></div></a-tab-pane></a-tabs></a-drawer>
    <a-drawer v-model:open="historyOpen" title="拍摄历史" placement="right" :width="'min(100vw, 620px)'"><a-alert type="info" show-icon message="历史查看期间已停止实时连接。" /><a-segmented v-model:value="historyFilter" :options="['全部','照片','视频']" block /><a-spin :spinning="historyBusy"><a-empty v-if="!visibleMedia.length" description="主动拍摄的照片和录像会保存在这里" /><article v-for="item in visibleMedia" :key="item.id" class="tryon-history-item"><MediaPreview v-if="item.type==='VIDEO' && ['READY','PARTIAL'].includes(item.state)" :src="mediaUrl(item.url)" :duration-ms="item.durationMs" /><img v-else-if="item.type==='PHOTO'" :src="mediaUrl(item.url)" alt="AI试穿效果" /><div v-else class="tryon-pending-media">{{ item.state === 'UNRECOVERABLE' ? '已上传片段不足以恢复录像，可删除释放空间' : '分段已上传，正在恢复可用片段' }}</div><div><strong>{{ item.type==='PHOTO' ? '试穿照片' : `${item.state==='PARTIAL'?'中断片段':'录像'} · ${duration(item.durationMs/1000)}` }}</strong><p>{{ new Date(item.createdAtMs).toLocaleString() }} <template v-if="item.type==='VIDEO'"> · {{ item.hasAudio?'有声':'无声' }} · {{ item.mimeType.split('/')[1]?.toUpperCase() }}</template></p><div class="tryon-history-actions"><a-button :href="mediaUrl(item.downloadUrl)" :disabled="!['READY','PARTIAL'].includes(item.state)"><DownloadOutlined /> 下载</a-button><a-button v-if="cap?.enabled" @click="repeat(item)">再次试穿</a-button><a-button type="text" danger aria-label="删除结果" @click="remove(item)"><DeleteOutlined /></a-button></div></div></article><a-button block :loading="historyBusy" @click="moreHistory">加载更多结果</a-button><a-collapse v-if="sessionHistory.length" ghost><a-collapse-panel key="sessions" header="查看会话与用量记录"><p v-for="s in sessionHistory" :key="s.id" class="tryon-session-history">{{ new Date(s.createdAtMs).toLocaleString() }} · {{ stateName(s.state) }} · {{ duration(s.userSeconds) }}<span v-if="s.state==='UNKNOWN'"> · 消耗待核对</span></p></a-collapse-panel></a-collapse></a-spin></a-drawer>
    <a-modal :open="!!importChoice" title="这件衣物是否入柜？" :footer="null" @cancel="importChoice=null"><p>入柜会进入现有衣物处理流程。仅试穿不会自动识图或生图，离开页面后不恢复。</p><div class="tryon-modal-actions"><a-button :loading="uploading" @click="uploadTemporary">仅当前页面试穿</a-button><a-button type="primary" @click="importGarment">进入入柜流程</a-button></div></a-modal>
    <a-modal v-model:open="silentChoice" title="麦克风暂不可用" :footer="null"><p>{{ microphoneError }}</p><div class="tryon-modal-actions"><a-button @click="silentChoice=false; record(true)">继续无声录像</a-button><a-button type="primary" @click="silentChoice=false; record()">重新申请麦克风</a-button></div></a-modal>
  </section>
</template>

<style scoped>
.tryon-page{max-width:1600px;margin:auto;display:flex;flex-direction:column;gap:16px}.tryon-header{display:flex;align-items:center;gap:12px}.tryon-heading{flex:1;display:flex;align-items:baseline;gap:16px;min-width:0}.tryon-heading h1{font-size:24px}.tryon-remaining{color:var(--accent);font-variant-numeric:tabular-nums;font-size:14px}.tryon-body{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;min-height:450px}.tryon-stage{position:relative;min-height:460px;height:min(65vh,760px);background:#20272b;overflow:hidden;border-radius:var(--radius-lg)}.tryon-video-host{position:absolute;inset:0}.tryon-video-host :deep(.tryon-local),.tryon-video-host :deep(.tryon-remote){position:absolute!important;inset:0!important;width:100%!important;height:100%!important}.tryon-video-host :deep(.tryon-remote){visibility:hidden}.tryon-video-host.has-result :deep(.tryon-local){visibility:hidden}.tryon-video-host.has-result :deep(.tryon-remote){visibility:visible}.tryon-video-host :deep(video){object-fit:contain!important}.tryon-stage-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:18px;color:#fff;padding:28px}.tryon-camera-symbol{font-size:44px;opacity:.75}.tryon-stage-cover>.ant-btn-primary{background:#d7eee1;border-color:#d7eee1;color:#163e2e}.tryon-stage-cover p{color:#d1d9d5;max-width:36ch;line-height:1.7}.tryon-status{position:absolute;top:16px;left:16px;max-width:calc(100% - 80px);padding:8px 12px;border-radius:8px;background:#fff;color:#25262b;font-size:13px}.tryon-status.live{background:#eef6f1;color:#1f5c45}.tryon-status.waiting{background:#fff9ee;color:#76500f}.tryon-recording-status{position:absolute;top:68px;left:16px;background:#fff4f3;color:#a43333;padding:8px 12px;border-radius:8px;font-variant-numeric:tabular-nums}.tryon-recording-status i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#bd4b4b;margin-right:8px}.tryon-recording-status small{display:block;margin-top:4px;color:#774343}.tryon-enlarge{position:absolute;right:12px;top:12px;color:white;background:#0008}.tryon-enlarge:hover{color:white!important;background:#000b!important}.tryon-offer{position:absolute;inset:30% 10% auto;background:var(--surface);color:var(--ink);padding:24px;display:grid;gap:14px;text-align:center;border-radius:14px}.tryon-picker-desktop{border:1px solid var(--line);border-radius:var(--radius-lg);padding:16px;max-height:min(65vh,760px);overflow:auto}.tryon-picker-content{display:flex;flex-direction:column;gap:12px}.tryon-garment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.tryon-garment-option.ant-btn{height:auto;min-height:136px;padding:8px;display:flex;flex-direction:column;align-items:center;gap:8px;white-space:normal;line-height:1.5;text-align:center;overflow:hidden}.tryon-garment-option img{width:100%;height:104px;object-fit:contain;background:var(--surface-alt);border-radius:6px}.tryon-garment-option.selected{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:var(--accent-soft)}.tryon-no-product{height:104px;display:grid;place-items:center;color:var(--muted);font-size:12px}.tryon-help{color:var(--muted);font-size:13px;line-height:1.7}.tryon-current{display:flex;align-items:center;gap:12px;min-height:32px}.tryon-selection{display:flex;gap:4px;flex-wrap:wrap;color:var(--muted);font-size:13px;min-width:0}.tryon-controls{display:flex;align-items:center;justify-content:center;gap:12px;padding:16px;background:var(--surface-alt);border-radius:var(--radius-lg)}.tryon-controls>.ant-btn{min-height:48px;min-width:88px}.tryon-main-action{margin-left:auto;min-width:152px!important}.tryon-mobile-picker{display:none}.tryon-disclosure{font-size:12px;line-height:1.7;color:var(--muted);max-width:100ch}.tryon-history-item{padding:20px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:140px minmax(0,1fr);gap:16px}.tryon-history-item>img,.tryon-history-item>video{width:140px;max-height:200px;object-fit:contain;border-radius:8px;background:var(--surface-alt)}.tryon-history-item p{font-size:12px;color:var(--muted);line-height:1.7;margin:8px 0}.tryon-history-actions{display:flex;gap:6px;flex-wrap:wrap}.tryon-pending-media{font-size:12px;color:var(--muted);background:var(--surface-alt);padding:16px}.tryon-modal-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px;flex-wrap:wrap}.tryon-session-history{font-size:12px;color:var(--muted);padding:8px 0}.tryon-paid-notice{color:var(--accent);display:flex;align-items:center;gap:10px;justify-content:space-between}.tryon-fullscreen-stop{display:none}.tryon-stage:fullscreen{height:100vh;border-radius:0}.tryon-stage:fullscreen .tryon-fullscreen-stop{display:block;position:absolute;bottom:24px;right:24px}
@media(max-width:767px){.tryon-page{min-height:100dvh;gap:10px;padding:calc(env(safe-area-inset-top) + 8px) 12px calc(env(safe-area-inset-bottom) + 12px)}.tryon-header{gap:4px;min-height:44px}.tryon-header>.ant-btn{height:44px;min-width:44px;padding:8px}.tryon-heading{display:flex;flex-direction:column;align-items:center;gap:2px}.tryon-heading h1{font-size:17px}.tryon-remaining{font-size:12px}.tryon-desktop-label,.tryon-desktop-history,.tryon-picker-desktop{display:none}.tryon-body{display:block;flex:1;min-height:280px}.tryon-stage{min-height:280px;height:calc(100dvh - 278px - env(safe-area-inset-top) - env(safe-area-inset-bottom));border-radius:12px}.tryon-stage-cover{padding:20px;gap:16px}.tryon-stage-cover h2{font-size:18px}.tryon-stage-cover>.ant-btn-primary{background:#d7eee1;border-color:#d7eee1;color:#163e2e}.tryon-stage-cover p{font-size:13px}.tryon-current{align-items:flex-start;gap:8px}.tryon-selection{flex-wrap:nowrap;overflow:auto;max-height:36px;padding:4px 0}.tryon-selection .ant-tag{flex:none}.tryon-mobile-picker{display:block;flex:none;min-height:44px}.tryon-controls{background:transparent;padding:0;gap:8px;justify-content:space-between}.tryon-controls>.ant-btn{min-width:52px;min-height:52px;padding:6px 10px;font-size:13px;display:flex;flex-direction:column;justify-content:center;gap:2px;height:auto}.tryon-main-action{margin-left:0;min-width:104px!important;display:block!important;height:52px!important}.tryon-disclosure{font-size:11px;line-height:1.5}.tryon-status{top:12px;left:12px;font-size:12px;padding:7px 10px}.tryon-recording-status{left:12px;top:58px}.tryon-history-item{grid-template-columns:100px minmax(0,1fr);gap:12px}.tryon-history-item>img,.tryon-history-item>video{width:100px;max-height:150px}.tryon-history-actions .ant-btn{padding-inline:8px;font-size:12px}.tryon-error{font-size:12px}.tryon-mobile-drawer .tryon-garment-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){.tryon-page *{scroll-behavior:auto!important;transition:none!important}}
</style>
