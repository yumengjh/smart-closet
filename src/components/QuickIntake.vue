<script setup lang="ts">
import { createUuid } from '../domain/id'
import { isAccountSwitched, mayPoll } from '../domain/accountSession'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { App, message } from 'ant-design-vue'
import { CameraOutlined, PictureOutlined, SettingOutlined, CheckCircleFilled, LoadingOutlined, ClockCircleOutlined, ArrowRightOutlined, InboxOutlined, CloseOutlined, DownOutlined } from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { useNotificationStore } from '../stores/notifications'
import { thumbUrl } from '../services/urls'
import { prefersNativeCamera } from '../services/camera'
import { playSound } from '../services/sound'
import CameraCapture from './CameraCapture.vue'
import TargetMarker from './TargetMarker.vue'
import { savePhoto, checkLocalStorage, updateSavedResult, refreshUploads, pumpUploads, uploadRows, uploadError, markPhoto, retryPhoto, removePhoto, removePhotos, quickApi, type LocalPhoto, type Hint } from '../services/quickIntake'

const notifications = useNotificationStore()
const closet = useClosetStore(), router = useRouter(), { modal } = App.useApp()
const compact = ref(window.matchMedia('(max-width: 1023px)').matches)
const mode = ref('BASE_READY'), camera = ref(false), settings = ref(false), markerMode = ref(false)
const marker = ref<LocalPhoto>(), input = ref<HTMLInputElement>(), nativeInput = ref<HTMLInputElement>()
const error = ref(''), saving = ref(false), received = ref(''), expanded = ref(false)
const session = createUuid(), nativeCamera = prefersNativeCamera()
let timer = 0, alive = true
const owner = () => closet.user?.username
const rows = computed(() => uploadRows.value.filter(row => row.owner === owner()))
const visibleRows = computed(() => expanded.value ? rows.value : rows.value.slice(0, 6))
const localCount = computed(() => rows.value.filter(row => row.state !== 'SAVED').length)
const admitted = computed(() => rows.value.filter(row => row.result?.garment.status === 'ACTIVE').length)
const thumbnails = new Map<string, string>()
const active = (row: LocalPhoto) => row.result && ['QUEUED', 'RUNNING'].includes(row.result.task.status)
function thumbnail(row: LocalPhoto) {
  if (row.result) return thumbUrl(row.result.garment.displayUrl || row.result.garment.sourceUrl, 320)
  if (!row.blob) return ''
  if (!thumbnails.has(row.id)) thumbnails.set(row.id, URL.createObjectURL(row.blob))
  return thumbnails.get(row.id)
}
function aiImage(row: LocalPhoto) { return row.result?.garment.images?.find(image => image.id === row.result?.garment.displayAssetId)?.aiGenerated }
function status(row: LocalPhoto) {
  if (row.state === 'MARKING') return { title: '选一下这张的主角', detail: '指定目标后上传，其他照片继续处理', tone: 'waiting' }
  if (row.state === 'ERROR') return { title: '上传未完成', detail: row.error || '照片仍在本机，可以重试', tone: 'warning' }
  if (row.state === 'UPLOADING') return { title: '正在上传照片', detail: '收到保存确认后，会自动制作贴纸', tone: 'processing' }
  if (row.state === 'PENDING') return { title: '照片已保存在本机', detail: row.error ? '连接恢复后自动重试上传' : '等待上传，可以继续拍下一件', tone: 'waiting' }
  const view = row.result
  if (!view) return { title: '照片已保存', detail: '正在读取处理状态', tone: 'waiting' }
  if (view.garment.status === 'TRASHED') return { title: '衣物已移入回收站', detail: '可以在衣柜回收站查看', tone: 'waiting' }
  const base = view.task.steps.find(step => step.type === 'SEGMENT')
  const sticker = view.garment.imageProcessing?.stickerReady || view.garment.images?.some(image => image.kind === 'BASE_STICKER')
  if (['FAILED', 'UNKNOWN', 'NEEDS_REVIEW'].includes(view.task.status)) return { title: sticker ? '贴纸已保留，后续处理需查看' : '照片已保留，处理需查看', detail: view.task.status === 'UNKNOWN' ? '云端结果待确认，请到衣物详情查看' : '可先使用衣物，或在详情中重新处理', tone: 'warning' }
  if (view.task.status === 'CANCELLED') return { title: '后续处理已取消', detail: '已保存的衣物和图片仍然保留', tone: 'waiting' }
  if (sticker) return { title: '贴纸已入柜', detail: active(row) ? '现在就能查看使用，资料在后台补齐' : '整理完成，可以查看或修改衣物信息', tone: 'success' }
  if (base?.status === 'SKIPPED') return { title: '原图已入柜', detail: '去背景未完成，资料识别继续进行', tone: 'warning' }
  return { title: view.garment.status === 'ACTIVE' ? '原图已入柜，贴纸制作中' : '照片已保存，正在准备贴纸', detail: base?.status === 'RUNNING' ? '正在去背景、加白边，做好后自动显示' : '已排队，无需再次提交', tone: base?.status === 'RUNNING' ? 'processing' : 'waiting' }
}
function takePhoto() { if (nativeCamera) nativeInput.value?.click(); else camera.value = true }
async function capture(file: File, specify = false, quiet = false) {
  const account = owner(); if (!account) return
  saving.value = true; received.value = '已收到照片，正在保存在本机…'; celebration.value = null
  const dismiss = quiet ? () => {} : message.loading({ content: '已收到照片，正在保存…', duration: 0 })
  try {
    const row = await savePhoto(account, file, mode.value, session, specify || markerMode.value)
    if (owner() !== account) return
    if (row.state === 'MARKING' && !marker.value) marker.value = row
    received.value = row.state === 'MARKING' ? '照片已收到，请指定这张的主视衣物。' : navigator.onLine ? '照片已收到，正在上传。可以继续拍下一件。' : '照片已保存在本机，联网后会自动上传。'
    error.value = ''; if (!quiet) { message.success({ content: received.value, duration: 3 }); welcomed() }; void pumpUploads(owner)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '照片保存失败，请重试'; received.value = ''; camera.value = false; message.error(error.value) }
  finally { dismiss(); saving.value = false }
}
async function selected(event: Event) {
  const element = event.target as HTMLInputElement, files = Array.from(element.files || [])
  element.value = ''
  await receive(files)
}
const acceptedType = (file: File) => ['image/jpeg', 'image/png'].includes(file.type)
// A light physical and audible "got it" so each photo feels received, not just queued.
function welcomed() { playSound('drop'); try { navigator.vibrate?.(12) } catch { /* Vibration is optional. */ } }
async function receive(files: File[]) {
  if (!files.length || saving.value || uploadError.value) return
  const usable = files.filter(acceptedType), skipped = files.length - usable.length
  if (!usable.length) { error.value = '请选择 JPEG 或 PNG 照片，HEIC 请先转换为 JPEG。'; playSound('denied'); return }
  if (usable.length === 1) await capture(usable[0])
  else {
    const dismiss = message.loading({ content: `正在收下 ${usable.length} 张照片…`, duration: 0 })
    let saved = 0
    try { for (const file of usable) { await capture(file, false, true); if (error.value) break; saved++ } }
    finally { dismiss() }
    if (saved) { message.success({ content: `收到 ${saved} 张照片，正在依次上传。可以继续添加。`, duration: 3 }); welcomed() }
  }
  if (skipped && !error.value) message.warning(`已跳过 ${skipped} 张非 JPEG/PNG 照片。`)
}
const dragging = ref(false)
let dragDepth = 0
const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files')
function dragEnter(event: DragEvent) { if (!hasFiles(event)) return; dragDepth++; dragging.value = true }
function dragLeave(event: DragEvent) { if (!hasFiles(event)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dragging.value = false }
function dropped(event: DragEvent) { dragDepth = 0; dragging.value = false; void receive(Array.from(event.dataTransfer?.files || [])) }
function pasted(event: ClipboardEvent) {
  if ((event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
  const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault(); void receive(files)
}

// "This round" groups photos added since the page opened so progress reads as one small achievement.
const sessionRows = computed(() => rows.value.filter(row => row.options.captureSessionId === session))
const settled = (row: LocalPhoto) => status(row).tone === 'success' || row.state === 'ERROR' || (row.state === 'SAVED' && !active(row))
const sessionReady = computed(() => sessionRows.value.filter(row => status(row).tone === 'success').length)
const sessionSettled = computed(() => sessionRows.value.filter(settled).length)
const sessionPercent = computed(() => sessionRows.value.length ? Math.round(sessionSettled.value / sessionRows.value.length * 100) : 0)
const celebration = ref<{ ready: number; attention: number; line: string } | null>(null)
const celebrationLines = ['衣柜又热闹了一点', '整整齐齐，都收好了', '新成员已就位', '今天的衣柜也很好看']
const justReady = ref(new Set<string>())
const seenTones = new Map<string, string>()
watch(() => rows.value.map(row => `${row.id}:${status(row).tone}`).join('|'), () => {
  let fresh = false
  for (const row of rows.value) {
    const tone = status(row).tone, previous = seenTones.get(row.id)
    // Only celebrate transitions witnessed on this page, never rows that were already done on load.
    if (previous && previous !== 'success' && tone === 'success') {
      fresh = true
      justReady.value = new Set(justReady.value).add(row.id)
      window.setTimeout(() => { const next = new Set(justReady.value); next.delete(row.id); justReady.value = next }, 1800)
    }
    seenTones.set(row.id, tone)
  }
  if (fresh) playSound('sparkle')
})
watch(() => sessionRows.value.length > 0 && sessionSettled.value === sessionRows.value.length, (done, wasDone) => {
  if (!done || wasDone || !sessionReady.value) return
  celebration.value = { ready: sessionReady.value, attention: sessionRows.value.length - sessionReady.value, line: celebrationLines[Math.floor(Math.random() * celebrationLines.length)] }
  playSound('complete')
})
async function marked(hint?: Hint) {
  if (!marker.value || !owner()) return
  try { const id = marker.value.id; await markPhoto(id, owner()!, hint); marker.value = rows.value.find(row => row.state === 'MARKING' && row.id !== id); error.value = ''; void pumpUploads(owner) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '目标保存失败，请重试' }
}
// Records live only in this browser: deleting one never touches the garment already in the closet.
function recordedAt(row: LocalPhoto) {
  const date = new Date(row.created), now = new Date(), time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  if (date.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return `昨天 ${time}`
  return `${date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}
const unsent = (row: LocalPhoto) => row.state !== 'SAVED'
const removeHint = (row: LocalPhoto) => unsent(row) ? '这张照片还没上传，删除后无法找回。' : '只删除这条本机记录，衣物仍在衣柜里。'
const finishedRows = computed(() => rows.value.filter(row => row.state === 'SAVED' && !active(row)))
async function removeRecord(row: LocalPhoto) { await removePhoto(row.id, owner()!); if (marker.value?.id === row.id) marker.value = undefined }
function manage({ key }: { key: string | number }) {
  const account = owner(); if (!account) return
  const targets = key === 'finished' ? finishedRows.value : rows.value.filter(row => row.state !== 'UPLOADING')
  if (!targets.length) return
  const lost = targets.filter(unsent).length
  modal.confirm({
    title: key === 'finished' ? `清除 ${targets.length} 条已完成记录？` : `清空 ${targets.length} 条最近录入？`,
    content: `只删除本机的录入记录，已入柜的衣物不受影响。${lost ? `其中 ${lost} 张照片还没上传，会一起删除且无法找回。` : ''}`,
    okText: key === 'finished' ? '清除' : '清空', okButtonProps: { danger: true }, cancelText: '取消',
    onOk: async () => { await removePhotos(targets.map(row => row.id), account); if (marker.value && targets.some(row => row.id === marker.value?.id)) marker.value = undefined; expanded.value = false },
  })
}
async function retry(row: LocalPhoto) { await retryPhoto(row.id, owner()!); await refreshUploads(owner()!); void pumpUploads(owner) }
const POLL_BATCH = 4
// Roughly 8 requests/second at most however many photos are in flight; quiet pages relax to 4 s.
function pollDelay() {
  const busy = rows.value.filter(row => row.state === 'SAVED' && active(row)).length
  if (busy) return Math.min(10_000, Math.max(1200, busy * 125))
  return localCount.value ? 1200 : 4000
}
async function refresh() {
  const account = owner(); if (!alive || !account || !mayPoll()) return
  try {
    await refreshUploads(account)
    // Bulk intake (100+ photos) must not fan out one request per photo every tick: poll in small batches.
    const pending = rows.value.filter(row => row.state === 'SAVED' && active(row))
    for (let i = 0; i < pending.length && alive; i += POLL_BATCH) await Promise.all(pending.slice(i, i + POLL_BATCH).map(async row => {
      const view = await quickApi.get(row.id)
      if (!alive || account !== owner()) return
      await updateSavedResult(row.id, account, view)
      const current = uploadRows.value.find(item => item.id === row.id)
      // A garment just reached the closet: its duplicate notice usually follows within seconds (issue #14).
      if (current && view.garmentId && !current.result?.garmentId) notifications.expectSoon()
      if (current) current.result = view
    }))
    error.value = ''
  } catch (cause) { if (!isAccountSwitched(cause) && rows.value.some(row => row.state === 'SAVED' && active(row))) error.value = '暂时无法刷新进度，已保存的照片不受影响，连接恢复后继续。' }
  if (alive && mayPoll()) timer = window.setTimeout(refresh, pollDelay())
}
watch(rows, list => {
  for (const [id, url] of thumbnails) if (!list.some(row => row.id === id && row.blob)) { URL.revokeObjectURL(url); thumbnails.delete(id) }
})
watch(() => owner(), () => { marker.value = undefined; received.value = ''; uploadRows.value = []; void refreshUploads(owner() || '') })
function screenChanged() { compact.value = window.matchMedia('(max-width: 1023px)').matches }
onMounted(() => { void refresh(); window.addEventListener('resize', screenChanged); window.addEventListener('paste', pasted) })
onBeforeUnmount(() => { alive = false; clearTimeout(timer); for (const url of thumbnails.values()) URL.revokeObjectURL(url); window.removeEventListener('resize', screenChanged); window.removeEventListener('paste', pasted) })
</script>

<template>
  <section class="quick-intake" aria-label="快速拍照入柜">
    <div class="capture-panel" :class="{ dragging }" @dragenter.prevent="dragEnter" @dragover.prevent @dragleave="dragLeave" @drop.prevent="dropped">
      <div v-if="dragging" class="drop-veil" aria-hidden="true"><InboxOutlined /><strong>松手，收进衣柜</strong><span>JPEG / PNG，可一次拖入多张</span></div>
      <div class="capture-heading"><div><h2>拍一件，收一件</h2><p>先做好贴纸给你看，资料自动补齐。</p></div><a-button type="text" class="settings-button" aria-label="录入设置" @click="settings = true"><SettingOutlined /><span>设置</span></a-button></div>
      <div class="capture-actions">
        <a-button type="primary" size="large" :disabled="saving || Boolean(uploadError)" :loading="saving" @click="takePhoto"><CameraOutlined v-if="!saving" />{{ rows.length ? '再拍一件' : '拍照' }}</a-button>
        <a-button size="large" :disabled="saving || Boolean(uploadError)" @click="input?.click()"><PictureOutlined />从相册选</a-button>
      </div>
      <p class="capture-hint">{{ compact ? '相册可多选 · 拍完自动上传 · 不用等上一件' : '相册可多选 · 也能直接拖进来或 Ctrl/⌘ + V 粘贴 · 不用等上一件' }}</p>
      <div class="capture-receipt" role="status" aria-live="polite" aria-atomic="true">
        <template v-if="saving"><LoadingOutlined spin /><span>收到照片，正在保存…</span></template>
        <template v-else-if="sessionRows.length">
          <span class="session-count" :class="{ done: sessionPercent === 100 }">{{ sessionRows.length }}</span>
          <span class="session-copy">本次收了 {{ sessionRows.length }} 件<template v-if="sessionReady"> · {{ sessionReady }} 件已入柜</template><small>{{ localCount ? `${localCount} 张仍在本机，请保持网页打开完成上传。` : sessionPercent === 100 ? '这一轮都处理好了，可以继续拍或去衣柜看看。' : '贴纸在后台制作，可以继续拍下一件。' }}</small>
            <a-progress :percent="sessionPercent" :show-info="false" size="small" :stroke-color="'var(--accent)'" :status="sessionPercent === 100 ? 'normal' : 'active'" class="session-progress" />
          </span>
        </template>
        <template v-else-if="rows[0]"><CheckCircleFilled v-if="status(rows[0]).tone === 'success'" class="success" /><LoadingOutlined v-else-if="status(rows[0]).tone === 'processing'" spin /><ClockCircleOutlined v-else /><span>{{ status(rows[0]).title }}<small>{{ localCount ? `${localCount} 张仍在本机，请保持网页打开完成上传。` : '可以继续拍照，或离开页面做别的事。' }}</small></span></template>
        <template v-else><CheckCircleFilled /><span>贴纸做好后自动入柜<small>无需逐件确认，可随时修改和换图。</small></span></template>
      </div>
      <p v-if="markerMode || mode === 'UPLOAD_READY'" class="custom-settings">{{ mode === 'UPLOAD_READY' ? '当前：原图保存即入柜' : '' }}{{ markerMode ? ' · 每张指定主视衣物' : '' }}</p>
    </div>
    <input ref="input" type="file" class="hidden-file-input" multiple accept="image/jpeg,image/png" tabindex="-1" @change="selected" />
    <input ref="nativeInput" type="file" class="hidden-file-input" accept="image/*" capture="environment" tabindex="-1" @change="selected" />
    <CameraCapture v-if="camera" continuous :count="sessionRows.length" :disabled="saving || Boolean(uploadError)" @close="camera = false" @capture="capture" />
    <TargetMarker v-if="marker" :key="marker.id" :blob="marker.blob!" @finish="marked" @close="marker = undefined" />
    <Transition name="celebrate">
      <section v-if="celebration" class="celebration" role="status" aria-live="polite">
        <div class="confetti" aria-hidden="true"><i v-for="index in 14" :key="index"></i></div>
        <span class="celebration-badge"><CheckCircleFilled /></span>
        <div class="celebration-copy"><strong>这一轮收好了 {{ celebration.ready }} 件，{{ celebration.line }}</strong><p>{{ celebration.attention ? `另有 ${celebration.attention} 件需要看一下，在下方对应照片里处理。` : '贴纸都做好了，资料会在后台慢慢补齐。' }}</p></div>
        <div class="celebration-actions"><a-button type="primary" @click="router.push('/wardrobe')">去衣柜看看</a-button><a-button @click="celebration = null; takePhoto()">再拍一件</a-button></div>
        <a-button type="text" size="small" class="celebration-close" aria-label="关闭" @click="celebration = null"><template #icon><CloseOutlined /></template></a-button>
      </section>
    </Transition>
    <a-alert v-if="error || uploadError" class="capture-error" type="warning" :message="uploadError || error" show-icon />
    <a-button v-if="uploadError" @click="checkLocalStorage(owner()!)">释放空间后重新检查</a-button>
    <section class="recent-section" aria-label="本机最近录入">
      <div class="recent-heading"><h2>最近录入 <span v-if="rows.length"><b class="recent-total">共 {{ rows.length }} 条 · </b>{{ admitted }} 件已入柜</span></h2>
        <div class="recent-tools">
          <a-dropdown v-if="rows.length" :trigger="['click']"><a-button type="text">管理记录<DownOutlined /></a-button>
            <template #overlay><a-menu @click="manage"><a-menu-item key="finished" :disabled="!finishedRows.length">清除已完成记录（{{ finishedRows.length }}）</a-menu-item><a-menu-item key="all" danger>清空全部记录</a-menu-item></a-menu></template>
          </a-dropdown>
          <a-button type="text" @click="router.push('/tasks')">全部任务<ArrowRightOutlined /></a-button>
        </div>
      </div>
      <div v-if="!rows.length" class="capture-empty">
        <div class="empty-main"><span class="empty-hanger" aria-hidden="true"><svg viewBox="0 0 64 40"><path d="M32 12a4.5 4.5 0 1 0-4.5-4.5M32 12v3.5L5 33.5c-1.6 1.1-.8 3.5 1.1 3.5h51.8c1.9 0 2.7-2.4 1.1-3.5L32 15.5" /></svg></span><div><strong>衣柜在等第一位新成员</strong><p>照片与贴纸会在这里更新，处理进度一眼可见。</p></div></div>
        <ul class="shoot-tips" aria-label="拍摄小建议"><li><b>1</b>平铺或挂起来拍，贴纸边缘更干净</li><li><b>2</b>一张照片放一件，整件入镜</li><li><b>3</b>光线充足，背景越简单越好</li></ul>
      </div>
      <TransitionGroup v-else tag="div" name="row" class="quick-list">
        <article v-for="row in visibleRows" :key="row.id" class="quick-row" :data-state="row.state" :data-tone="status(row).tone" :class="{ 'just-ready': justReady.has(row.id) }">
          <div class="quick-image"><span v-if="justReady.has(row.id)" class="sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><img :src="thumbnail(row)" :alt="row.result?.garment.imageProcessing?.stickerReady ? '已制作的衣物贴纸' : '本次录入的衣物照片'" /><span v-if="aiImage(row)" class="ai-label">AI 生成</span></div>
          <div class="quick-row-copy"><div class="row-head"><p class="row-status" :class="status(row).tone"><LoadingOutlined v-if="status(row).tone === 'processing'" spin /><CheckCircleFilled v-else-if="status(row).tone === 'success'" />{{ status(row).title }}</p><time class="row-time" :datetime="new Date(row.created).toISOString()">{{ recordedAt(row) }}</time></div><p class="row-detail">{{ status(row).detail }}</p><p v-if="aiImage(row)" class="row-detail">可能包含推测细节</p>
            <div class="row-actions"><a-button v-if="row.result" size="small" @click="router.push(`/garment/${row.result.garmentId}`)">查看衣物<ArrowRightOutlined /></a-button><a-button v-if="row.state === 'ERROR'" size="small" @click="retry(row)">重试上传</a-button><a-button v-if="row.state === 'MARKING'" size="small" @click="marker = row">指定目标</a-button><a-popconfirm v-if="row.state !== 'UPLOADING'" :title="removeHint(row)" ok-text="删除" cancel-text="取消" :ok-button-props="{ danger: true }" @confirm="removeRecord(row)"><a-button type="text" size="small" class="row-remove">删除记录</a-button></a-popconfirm></div>
          </div>
        </article>
      </TransitionGroup>
      <a-button v-if="rows.length > 6" block class="show-more" @click="expanded = !expanded">{{ expanded ? '收起历史照片' : `展开其余 ${rows.length - 6} 张` }}</a-button>
    </section>
    <a-modal v-if="!compact" v-model:open="settings" title="录入设置" :footer="null" width="480px" centered>
      <div class="quick-settings"><h3>什么时候入柜</h3><a-radio-group v-model:value="mode"><a-radio value="BASE_READY"><strong>贴纸做好后入柜</strong><small>推荐 · 去背景、加白边后即可查看使用</small></a-radio><a-radio value="UPLOAD_READY"><strong>原图保存后立即入柜</strong><small>先用原图，贴纸做好后自动更新</small></a-radio></a-radio-group><div class="marker-setting"><div><h3>拍摄后指定主视衣物</h3><p>照片里有多件衣物时，点选或框选目标。</p></div><a-switch v-model:checked="markerMode" aria-label="拍摄后指定主视衣物" /></div><p class="storage-note">照片先存在本机，上传完成前请保持网页打开。</p><a-button type="primary" block size="large" @click="settings = false">完成设置</a-button></div>
    </a-modal>
    <a-drawer v-else v-model:open="settings" title="录入设置" placement="bottom" height="auto" root-class-name="quick-settings-drawer">
      <div class="quick-settings"><h3>什么时候入柜</h3><a-radio-group v-model:value="mode"><a-radio value="BASE_READY"><strong>贴纸做好后入柜</strong><small>推荐 · 去背景、加白边后即可查看使用</small></a-radio><a-radio value="UPLOAD_READY"><strong>原图保存后立即入柜</strong><small>先用原图，贴纸做好后自动更新</small></a-radio></a-radio-group><div class="marker-setting"><div><h3>拍摄后指定主视衣物</h3><p>照片里有多件衣物时，点选或框选目标。</p></div><a-switch v-model:checked="markerMode" aria-label="拍摄后指定主视衣物" /></div><p class="storage-note">照片先存在本机，上传完成前请保持网页打开。</p><a-button type="primary" block size="large" @click="settings = false">完成设置</a-button></div>
    </a-drawer>
  </section>
</template>

<style scoped>
.quick-intake{max-width:900px;margin:0 auto}.capture-panel{padding:28px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-xl)}.capture-heading,.recent-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.capture-heading h2{font-size:22px;line-height:1.4;margin:0;letter-spacing:-.4px}.capture-heading p{font-size:14px;color:var(--muted);margin:6px 0 0}.settings-button{min-height:44px;color:var(--muted);display:inline-flex;align-items:center;gap:5px;padding:0 10px}.capture-actions{display:grid;grid-template-columns:1.2fr 1fr;gap:12px;margin-top:24px}.capture-actions .ant-btn{height:60px;border-radius:var(--radius-lg);font-size:17px;font-weight:600;display:flex;justify-content:center;align-items:center;gap:8px}.capture-actions .anticon{font-size:23px}.capture-hint{font-size:12px;line-height:1.6;color:var(--muted);margin:12px 0 0;text-align:center}.capture-receipt{display:flex;align-items:center;gap:12px;border-top:1px solid var(--line);padding-top:18px;margin-top:20px;font-size:14px;color:var(--ink);min-height:61px}.capture-receipt>.anticon{font-size:21px;color:var(--accent)}.capture-receipt small{display:block;font-size:12px;color:var(--muted);margin-top:4px;line-height:1.6}.capture-receipt .success{color:var(--success)}.custom-settings{font-size:12px;color:var(--muted);margin:12px 0 0}.capture-error{margin-top:16px}.recent-section{margin-top:28px}.recent-heading{margin-bottom:8px}.recent-heading h2{font-size:17px;margin:0}.recent-heading h2 span{font-size:12px;font-weight:400;color:var(--muted);margin-left:8px}.recent-heading .ant-btn{min-height:36px;padding-right:0;color:var(--muted)}.capture-empty{display:flex;align-items:center;gap:16px;border:1px dashed var(--line);border-radius:var(--radius-lg);padding:28px 24px;color:var(--muted)}.capture-empty>.anticon{font-size:32px;color:var(--muted-copy)}.capture-empty strong{font-size:14px;font-weight:500;color:var(--ink)}.capture-empty p{font-size:12px;margin:6px 0 0;line-height:1.7}.quick-row{display:flex;align-items:center;gap:20px;padding:18px 0;border-bottom:1px solid var(--line)}.quick-image{position:relative;flex:none;width:112px;height:120px;border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;background:var(--surface-alt)}.quick-image img{width:100%;height:100%;object-fit:contain}.ai-label{position:absolute;bottom:0;left:0;right:0;font-size:10px;text-align:center;background:var(--surface);color:var(--muted);padding:2px}.quick-row-copy{flex:1;min-width:0}.row-status{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600;line-height:1.5;color:var(--ink);margin:0}.row-status.success{color:var(--success)}.row-status.warning{color:var(--warning)}.row-detail{font-size:12px;color:var(--muted);line-height:1.7;margin:5px 0 0}.row-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.row-actions .ant-btn{min-height:36px;padding:0 12px;display:flex;align-items:center;gap:6px}.row-actions .ant-btn-default{border-color:transparent;background:var(--surface);color:var(--accent-strong)}.show-more{margin-top:16px;min-height:44px}.quick-settings{max-width:600px;margin:auto;padding-bottom:env(safe-area-inset-bottom)}.quick-settings h3{font-size:15px;margin:0 0 12px}.quick-settings :deep(.ant-radio-group){display:grid;gap:12px}.quick-settings :deep(.ant-radio-wrapper){align-items:flex-start;min-height:54px}.quick-settings strong{display:block;font-size:14px;font-weight:500}.quick-settings small{display:block;margin-top:6px;font-size:12px;color:var(--muted)}.marker-setting{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:24px;padding-top:20px;border-top:1px solid var(--line)}.marker-setting h3{margin:0}.marker-setting p,.storage-note{font-size:12px;line-height:1.8;color:var(--muted);margin:6px 0 0}.marker-setting :deep(.ant-switch){flex-shrink:0}.storage-note{margin:20px 0}
@media(max-width:767px){.capture-panel{padding:20px;border-radius:var(--radius-lg)}.capture-heading h2{font-size:20px}.capture-heading p{font-size:12px}.settings-button{padding:0 4px}.capture-actions{margin-top:20px;gap:10px;grid-template-columns:1.1fr 1fr}.capture-actions .ant-btn{height:58px;font-size:16px;padding:0 8px}.capture-hint{font-size:11px}.capture-receipt{font-size:13px;gap:10px}.capture-receipt small{font-size:11px}.recent-section{margin-top:22px}.recent-heading h2{font-size:16px}.recent-heading .ant-btn{font-size:12px}.quick-row{gap:14px;padding:16px 0;align-items:flex-start}.quick-image{width:88px;height:104px;border-radius:var(--radius-md)}.row-status{font-size:14px}.row-detail{font-size:12px}.capture-empty{padding:22px 18px;gap:12px}.capture-empty>.anticon{font-size:26px}}

.capture-panel{position:relative}
.drop-veil{position:absolute;inset:6px;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed var(--accent);border-radius:var(--radius-lg);background:color-mix(in srgb,var(--surface) 90%,var(--accent) 10%);color:var(--accent-strong);pointer-events:none;animation:veil-in .18s ease-out}
.drop-veil .anticon{font-size:36px;animation:veil-bob 1s ease-in-out infinite}.drop-veil strong{font-size:18px}.drop-veil span{font-size:12px;color:var(--muted)}
.session-count{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--accent-strong);font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;transition:background .3s,color .3s}
.session-count.done{background:var(--success);color:var(--surface)}
.session-copy{flex:1;min-width:0;font-weight:500}.session-copy small{font-weight:400}
.session-progress{margin:6px 0 0;line-height:1}
.celebration{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px;margin-top:16px;padding:18px 44px 18px 20px;overflow:hidden;border:1px solid var(--success-line);border-radius:var(--radius-lg);background:var(--success-bg)}
.celebration-badge{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--surface);color:var(--success);font-size:24px;animation:badge-pop .5s cubic-bezier(.34,1.56,.64,1) both .1s}
.celebration-copy strong{display:block;font-size:15px;color:var(--ink)}.celebration-copy p{margin:4px 0 0;font-size:12px;line-height:1.6;color:var(--muted)}
.celebration-actions{display:flex;gap:8px}.celebration-actions .ant-btn{min-height:36px}
.celebration-close{position:absolute;top:6px;right:6px;color:var(--muted)}
.confetti{position:absolute;inset:0;pointer-events:none}
.confetti i{position:absolute;top:50%;left:42px;width:6px;height:6px;border-radius:2px;opacity:0;animation:confetti 1.1s cubic-bezier(.2,.7,.3,1) forwards}
.confetti i:nth-child(4n+1){background:var(--accent)}.confetti i:nth-child(4n+2){background:var(--warning)}.confetti i:nth-child(4n+3){background:var(--info)}.confetti i:nth-child(4n){background:var(--danger);border-radius:50%}
.confetti i:nth-child(1){--x:60px;--y:-40px}.confetti i:nth-child(2){--x:110px;--y:-22px}.confetti i:nth-child(3){--x:150px;--y:18px}.confetti i:nth-child(4){--x:90px;--y:34px}.confetti i:nth-child(5){--x:40px;--y:44px}.confetti i:nth-child(6){--x:-10px;--y:-46px}.confetti i:nth-child(7){--x:190px;--y:-34px}.confetti i:nth-child(8){--x:230px;--y:10px}.confetti i:nth-child(9){--x:130px;--y:-48px}.confetti i:nth-child(10){--x:-24px;--y:30px}.confetti i:nth-child(11){--x:270px;--y:-20px}.confetti i:nth-child(12){--x:200px;--y:40px}.confetti i:nth-child(13){--x:310px;--y:24px}.confetti i:nth-child(14){--x:75px;--y:-58px}
.celebrate-enter-active{transition:opacity .3s ease-out,transform .35s cubic-bezier(.34,1.56,.64,1)}.celebrate-leave-active{transition:opacity .2s ease-in}
.celebrate-enter-from{opacity:0;transform:translateY(8px) scale(.98)}.celebrate-leave-to{opacity:0}
.capture-empty{flex-direction:column;align-items:stretch;gap:18px}
.empty-main{display:flex;align-items:center;gap:16px}
.empty-hanger{display:grid;place-items:center;flex:none;width:52px;height:52px;border-radius:50%;background:var(--accent-soft)}
.empty-hanger svg{width:30px;fill:none;stroke:var(--accent);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;transform-origin:50% 10%;animation:hanger-sway 2.6s ease-in-out infinite}
.shoot-tips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}
.shoot-tips li{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:var(--radius-md);background:var(--surface);font-size:12px;line-height:1.6;color:var(--muted-strong)}
.shoot-tips b{display:grid;place-items:center;flex:none;width:18px;height:18px;margin-top:1px;border-radius:50%;background:var(--accent-soft);color:var(--accent-strong);font-size:11px}
.quick-row[data-tone="processing"] .quick-image::after,.quick-row[data-state="UPLOADING"] .quick-image::after{content:'';position:absolute;left:0;right:0;top:0;height:36%;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--accent) 22%,transparent) 85%,color-mix(in srgb,var(--accent) 70%,transparent));animation:scan 1.8s ease-in-out infinite;pointer-events:none}
.quick-row.just-ready .quick-image{animation:sticker-pop .6s cubic-bezier(.34,1.56,.64,1);border-color:var(--success-line);box-shadow:0 0 0 4px var(--success-bg)}
.quick-row.just-ready .row-status{animation:status-in .4s ease-out}
.sparkles{position:absolute;inset:0;z-index:1;pointer-events:none}
.sparkles i{position:absolute;width:8px;height:8px;background:var(--warning);clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);opacity:0;animation:sparkle .9s ease-out forwards}
.sparkles i:nth-child(1){top:12%;left:14%}.sparkles i:nth-child(2){top:8%;right:16%;animation-delay:.12s;background:var(--accent)}.sparkles i:nth-child(3){bottom:16%;right:10%;animation-delay:.2s}.sparkles i:nth-child(4){bottom:12%;left:20%;animation-delay:.28s;background:var(--info)}.sparkles i:nth-child(5){top:44%;left:48%;animation-delay:.08s;width:11px;height:11px}
.row-enter-active{transition:opacity .35s ease-out,transform .4s cubic-bezier(.34,1.56,.64,1)}.row-enter-from{opacity:0;transform:translateY(-10px) scale(.97)}
.row-leave-active{transition:opacity .2s ease-in}.row-leave-to{opacity:0}.row-move{transition:transform .35s ease}
@keyframes veil-in{from{opacity:0;transform:scale(.98)}}
@keyframes veil-bob{50%{transform:translateY(-4px)}}
@keyframes badge-pop{from{transform:scale(.4);opacity:0}}
@keyframes confetti{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(var(--x),var(--y)) rotate(200deg)}}
@keyframes hanger-sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(280%)}}
@keyframes sticker-pop{0%{transform:scale(.92)}60%{transform:scale(1.05)}100%{transform:scale(1)}}
@keyframes status-in{from{opacity:0;transform:translateX(-4px)}}
@keyframes sparkle{0%{opacity:0;transform:scale(.2) rotate(0)}40%{opacity:1;transform:scale(1.2) rotate(45deg)}100%{opacity:0;transform:scale(.6) rotate(90deg)}}
@media(max-width:767px){.celebration{grid-template-columns:auto minmax(0,1fr);padding:16px;gap:12px}.celebration-copy{padding-right:24px}.celebration-actions{grid-column:1/-1}.celebration-actions .ant-btn{flex:1}.shoot-tips{grid-template-columns:1fr;gap:8px}.session-count{width:36px;height:36px;font-size:15px}}
@media(prefers-reduced-motion:reduce){.drop-veil,.drop-veil .anticon,.celebration-badge,.confetti i,.empty-hanger svg,.quick-row .quick-image::after,.quick-row.just-ready .quick-image,.quick-row.just-ready .row-status,.sparkles i{animation:none}.confetti,.sparkles{display:none}.row-enter-from,.celebrate-enter-from{transform:none}}
</style>
<style scoped>
.recent-tools{display:flex;align-items:center;gap:4px}.recent-tools .ant-btn{display:inline-flex;align-items:center;gap:4px}.recent-tools .anticon-down{font-size:10px}
.recent-heading h2{white-space:nowrap}.recent-total{font-weight:inherit}.row-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.row-head .row-status{min-width:0}.row-time{flex:none;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.row-actions .row-remove.ant-btn{color:var(--muted);background:transparent}.row-actions .row-remove.ant-btn:hover{color:var(--danger);background:var(--danger-bg)}
@media(max-width:767px){.recent-total{display:none}.recent-tools{gap:0}.recent-tools .ant-btn{padding:0 6px}.row-head{flex-direction:column;gap:2px}}
</style>
