<script setup lang="ts">
import { createUuid } from '../domain/id'
import { isAccountSwitched, mayPoll } from '../domain/accountSession'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App, message } from 'ant-design-vue'
import { CameraOutlined, PictureOutlined, SettingOutlined, CheckCircleFilled, LoadingOutlined, ArrowRightOutlined, InboxOutlined, CloseOutlined, DownOutlined, MoreOutlined, QuestionCircleOutlined, ExclamationCircleFilled } from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { useNotificationStore } from '../stores/notifications'
import { thumbUrl } from '../services/urls'
import { prefersNativeCamera } from '../services/camera'
import { playSound } from '../services/sound'
import CameraCapture from './CameraCapture.vue'
import TargetMarker from './TargetMarker.vue'
import { loadWantedLabel, wantedLabel } from '../wardrobe/wanted'
import { savePhoto, setPhotoWanted, checkLocalStorage, updateSavedResult, refreshUploads, pumpUploads, uploadRows, uploadError, markPhoto, retryPhoto, removePhoto, removePhotos, quickApi, type LocalPhoto, type Hint } from '../services/quickIntake'

const notifications = useNotificationStore()
const closet = useClosetStore(), router = useRouter(), route = useRoute(), { modal } = App.useApp()
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
const inCloset = (row: LocalPhoto) => row.result?.garment.status === 'ACTIVE' || row.result?.garment.status === 'WANTED'
const admitted = computed(() => rows.value.filter(inCloset).length)
// 种草（#197）：网上看中、还没买的衣服也从这里收进衣柜，入柜为 WANTED，不参与推荐与统计。只在本次打开页面期间有效，默认“我有这件”。
// 默认“我有这件”、不跨次记忆；只有从添加菜单的“存一件种草”进来（?wanted=1，本次明确选择）才预选种草（ToC 改版 P2）。
const ownership = ref<'OWNED' | 'WANTED'>(route.query.wanted === '1' ? 'WANTED' : 'OWNED')
void loadWantedLabel()
const ownershipOptions = computed(() => [{ value: 'OWNED', label: '我有这件' }, { value: 'WANTED', label: `${wantedLabel.value}（还没买）` }])
/** The row's current choice: the closet status once admitted, otherwise what was chosen for it. */
const rowWanted = (row: LocalPhoto) => row.result?.garment.status === 'WANTED' || (!inCloset(row) && Boolean(row.result?.wanted ?? row.options.wanted))
const switching = ref('')
async function toggleWanted(row: LocalPhoto) {
  const account = owner(); if (!account || switching.value) return
  const next = !rowWanted(row)
  switching.value = row.id
  try { await setPhotoWanted(row.id, account, next); const current = uploadRows.value.find(item => item.id === row.id); if (current?.result) current.result = await quickApi.get(row.id); playSound('tick'); message.success(next ? `已改为${wantedLabel.value}，不参与推荐和统计` : '已改为已拥有') }
  catch (cause) { playSound('denied'); message.error(cause instanceof Error ? cause.message : '没有改成功，请稍后再试。') }
  finally { switching.value = '' }
}
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
  if (row.state === 'UPLOADING') return { title: '正在上传照片', detail: '收到保存确认后，会自动做透明图', tone: 'processing' }
  if (row.state === 'PENDING') return { title: '照片已保存在本机', detail: row.error ? '连接恢复后自动重试上传' : '等待上传，可以继续拍下一件', tone: 'waiting' }
  const view = row.result
  if (!view) return { title: '照片已保存', detail: '正在读取处理状态', tone: 'waiting' }
  if (view.garment.status === 'TRASHED') return { title: '衣物已移入回收站', detail: '可以在衣柜回收站查看', tone: 'waiting' }
  const base = view.task.steps.find(step => step.type === 'SEGMENT')
  const sticker = view.garment.imageProcessing?.stickerReady || view.garment.images?.some(image => image.kind === 'BASE_STICKER')
  if (['FAILED', 'UNKNOWN', 'NEEDS_REVIEW'].includes(view.task.status)) return { title: sticker ? '透明图已保留，后续处理需查看' : '照片已保留，处理需查看', detail: view.task.status === 'UNKNOWN' ? '云端结果待确认，请到衣物详情查看' : '可先使用衣物，或在详情中重新处理', tone: 'warning' }
  if (view.task.status === 'CANCELLED') return { title: '后续处理已取消', detail: '已保存的衣物和图片仍然保留', tone: 'waiting' }
  const wantedNow = view.garment.status === 'WANTED'
  if (sticker) return { title: wantedNow ? `透明图已存为${wantedLabel.value}` : '透明图已收进衣柜', detail: active(row) ? '现在就能查看使用，资料在后台补齐' : '整理完成，可以查看或修改衣物信息', tone: 'success' }
  if (base?.status === 'SKIPPED') return { title: wantedNow ? `原图已存为${wantedLabel.value}` : '原图已收进衣柜', detail: '去背景未完成，资料识别继续进行', tone: 'warning' }
  return { title: view.garment.status === 'ACTIVE' ? '原图已收进衣柜，透明图制作中' : wantedNow ? `原图已存为${wantedLabel.value}，透明图制作中` : '照片已保存，正在准备透明图', detail: base?.status === 'RUNNING' ? '正在去背景、加白边，做好后自动显示' : '已排队，无需再次提交', tone: base?.status === 'RUNNING' ? 'processing' : 'waiting' }
}
function takePhoto() { if (nativeCamera) nativeInput.value?.click(); else camera.value = true }
async function capture(file: File, specify = false, quiet = false) {
  const account = owner(); if (!account) return
  saving.value = true; received.value = '已收到照片，正在保存在本机…'; celebration.value = null
  const dismiss = quiet ? () => {} : message.loading({ content: '已收到照片，正在保存…', duration: 0 })
  try {
    const row = await savePhoto(account, file, mode.value, session, specify || markerMode.value, ownership.value === 'WANTED')
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
    content: `只删除本机的录入记录，已收进衣柜的衣物不受影响。${lost ? `其中 ${lost} 张照片还没上传，会一起删除且无法找回。` : ''}`,
    okText: key === 'finished' ? '清除' : '清空', okButtonProps: { danger: true }, cancelText: '取消',
    onOk: async () => { await removePhotos(targets.map(row => row.id), account); if (marker.value && targets.some(row => row.id === marker.value?.id)) marker.value = undefined; expanded.value = false },
  })
}
// 网格里的每张只显示一个短状态；完整说明放在悬停提示和读屏文字里。
function chip(row: LocalPhoto) {
  const tone = status(row).tone
  if (row.state === 'MARKING') return '待指定'
  if (row.state === 'ERROR') return '未上传'
  if (row.state === 'UPLOADING') return '上传中'
  if (row.state === 'PENDING') return '在本机'
  if (row.result?.garment.status === 'TRASHED') return '已删除'
  if (tone === 'success') return rowWanted(row) ? wantedLabel.value : '已收进衣柜'
  if (tone === 'warning') return '需查看'
  return tone === 'processing' ? '处理中' : '排队中'
}
function openRow(row: LocalPhoto) {
  if (row.state === 'MARKING') { marker.value = row; return }
  if (row.state === 'ERROR') { void retry(row); return }
  if (row.result) void router.push(`/garment/${row.result.garmentId}`)
}
function menuClick(row: LocalPhoto, info: { key: string | number }) { rowAction(row, String(info.key)) }
function rowAction(row: LocalPhoto, key: string) {
  if (key === 'open') openRow(row)
  else if (key === 'ownership') void toggleWanted(row)
  else if (key === 'remove') modal.confirm({ title: '删除这条记录？', content: removeHint(row), okText: '删除', okButtonProps: { danger: true }, cancelText: '取消', onOk: () => removeRecord(row) })
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
  <section class="quick-intake" aria-label="快速拍照收进衣柜">
    <div class="capture-panel" :class="{ dragging, wanted: ownership === 'WANTED' }" @dragenter.prevent="dragEnter" @dragover.prevent @dragleave="dragLeave" @drop.prevent="dropped">
      <div v-if="dragging" class="drop-veil" aria-hidden="true"><InboxOutlined /><strong>{{ ownership === 'WANTED' ? `松手，存为${wantedLabel}` : '松手，收进衣柜' }}</strong></div>
      <a-button type="text" shape="circle" class="settings-button" aria-label="录入设置" @click="settings = true"><SettingOutlined /></a-button>
      <h2 class="capture-title">{{ ownership === 'WANTED' ? `存一件${wantedLabel}` : '拍一件，收一件' }}</h2>
      <div class="ownership-choice">
        <a-segmented v-model:value="ownership" :options="ownershipOptions" class="ownership-switch" :aria-label="`这次收的是已有的衣服，还是${wantedLabel}`" />
        <a-tooltip :title="`${wantedLabel}：网上看中、还没买的衣服。存进衣柜但不参与推荐和统计，买到后一键标为已拥有。`" placement="bottom"><QuestionCircleOutlined class="ownership-help" tabindex="0" :aria-label="`${wantedLabel}是什么`" /></a-tooltip>
      </div>
      <div class="capture-actions">
        <a-button type="primary" size="large" class="capture-main" :disabled="saving || Boolean(uploadError)" :loading="saving" @click="ownership === 'WANTED' ? input?.click() : takePhoto()"><template v-if="ownership === 'WANTED'"><PictureOutlined v-if="!saving" />选截图</template><template v-else><CameraOutlined v-if="!saving" />拍照</template></a-button>
        <a-button size="large" class="capture-soft" :disabled="saving || Boolean(uploadError)" @click="ownership === 'WANTED' ? takePhoto() : input?.click()"><template v-if="ownership === 'WANTED'"><CameraOutlined />拍照</template><template v-else><PictureOutlined />相册</template></a-button>
      </div>
      <p class="capture-hint">{{ compact ? '可多选，不用等上一件' : '可多选、拖入或粘贴，不用等上一件' }}</p>
      <Transition name="note">
        <div v-if="saving || sessionRows.length" class="capture-receipt" role="status" aria-live="polite" aria-atomic="true">
          <template v-if="saving"><LoadingOutlined spin /><span>正在保存…</span></template>
          <template v-else>
            <span class="session-copy">本次 {{ sessionRows.length }} 件<template v-if="sessionReady"> · {{ sessionReady }} 件已收进衣柜</template></span>
            <a-progress :percent="sessionPercent" :show-info="false" size="small" :stroke-color="'var(--accent)'" :status="sessionPercent === 100 ? 'normal' : 'active'" class="session-progress" />
          </template>
        </div>
      </Transition>
      <p v-if="localCount" class="capture-local">{{ localCount }} 张还在本机，请保持页面打开</p>
    </div>
    <input ref="input" type="file" class="hidden-file-input" multiple accept="image/jpeg,image/png" tabindex="-1" @change="selected" />
    <input ref="nativeInput" type="file" class="hidden-file-input" accept="image/*" capture="environment" tabindex="-1" @change="selected" />
    <CameraCapture v-if="camera" continuous :count="sessionRows.length" :disabled="saving || Boolean(uploadError)" @close="camera = false" @capture="capture" />
    <TargetMarker v-if="marker" :key="marker.id" :blob="marker.blob!" @finish="marked" @close="marker = undefined" />
    <Transition name="celebrate">
      <section v-if="celebration" class="celebration" role="status" aria-live="polite">
        <div class="confetti" aria-hidden="true"><i v-for="index in 14" :key="index"></i></div>
        <span class="celebration-badge"><CheckCircleFilled /></span>
        <div class="celebration-copy"><strong>收好了 {{ celebration.ready }} 件，{{ celebration.line }}</strong><p v-if="celebration.attention">另有 {{ celebration.attention }} 件需要看一下</p></div>
        <div class="celebration-actions"><a-button type="primary" @click="router.push('/wardrobe')">去衣柜</a-button><a-button @click="celebration = null; takePhoto()">再拍一件</a-button></div>
        <a-button type="text" size="small" class="celebration-close" aria-label="关闭" @click="celebration = null"><template #icon><CloseOutlined /></template></a-button>
      </section>
    </Transition>
    <a-alert v-if="error || uploadError" class="capture-error" type="warning" :message="uploadError || error" show-icon />
    <a-button v-if="uploadError" @click="checkLocalStorage(owner()!)">释放空间后重新检查</a-button>
    <section class="recent-section" aria-label="本机最近录入">
      <div v-if="rows.length" class="recent-heading"><h2>最近录入<span>{{ admitted }} / {{ rows.length }}</span></h2>
        <div class="recent-tools">
          <a-dropdown :trigger="['click']"><a-button type="text" size="small">管理<DownOutlined /></a-button>
            <template #overlay><a-menu @click="manage"><a-menu-item key="finished" :disabled="!finishedRows.length">清除已完成记录（{{ finishedRows.length }}）</a-menu-item><a-menu-item key="all" danger>清空全部记录</a-menu-item></a-menu></template>
          </a-dropdown>
          <a-button type="text" size="small" @click="router.push('/tasks')">任务<ArrowRightOutlined /></a-button>
        </div>
      </div>
      <div v-if="!rows.length" class="capture-empty">
        <span class="empty-hanger" aria-hidden="true"><svg viewBox="0 0 64 40"><path d="M32 12a4.5 4.5 0 1 0-4.5-4.5M32 12v3.5L5 33.5c-1.6 1.1-.8 3.5 1.1 3.5h51.8c1.9 0 2.7-2.4 1.1-3.5L32 15.5" /></svg></span>
        <p>平铺或挂起来拍，一张一件</p>
      </div>
      <TransitionGroup v-else tag="div" name="row" class="quick-grid">
        <article v-for="row in visibleRows" :key="row.id" class="quick-tile" :data-state="row.state" :data-tone="status(row).tone" :class="{ 'just-ready': justReady.has(row.id), wanted: rowWanted(row) }">
          <button type="button" class="quick-image" :title="`${status(row).title} · ${status(row).detail}`" :aria-label="`${status(row).title}，${status(row).detail}，${recordedAt(row)}`" @click="openRow(row)">
            <span v-if="justReady.has(row.id)" class="sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
            <img :src="thumbnail(row)" alt="" />
            <span v-if="aiImage(row)" class="ai-label">AI</span>
          </button>
          <div class="tile-foot">
            <span class="tile-chip" :class="[status(row).tone, { wanted: rowWanted(row) && status(row).tone === 'success' }]"><LoadingOutlined v-if="status(row).tone === 'processing'" spin /><ExclamationCircleFilled v-else-if="status(row).tone === 'warning'" /><i v-else class="tile-dot" aria-hidden="true"></i>{{ chip(row) }}</span>
            <a-dropdown v-if="row.state !== 'UPLOADING'" :trigger="['click']" placement="bottomRight">
              <a-button type="text" size="small" shape="circle" class="tile-more" :loading="switching === row.id" aria-label="更多操作"><MoreOutlined v-if="switching !== row.id" /></a-button>
              <template #overlay><a-menu @click="menuClick(row, $event)">
                <a-menu-item v-if="row.result || row.state === 'MARKING' || row.state === 'ERROR'" key="open">{{ row.state === 'MARKING' ? '指定目标' : row.state === 'ERROR' ? '重试上传' : '查看衣物' }}</a-menu-item>
                <a-menu-item v-if="row.result?.garment.status !== 'TRASHED'" key="ownership" :disabled="Boolean(switching)">{{ rowWanted(row) ? '买到了，改为已拥有' : `改为${wantedLabel}` }}</a-menu-item>
                <a-menu-item key="remove" danger>删除记录</a-menu-item>
              </a-menu></template>
            </a-dropdown>
          </div>
        </article>
      </TransitionGroup>
      <a-button v-if="rows.length > 6" type="text" block class="show-more" @click="expanded = !expanded">{{ expanded ? '收起' : `还有 ${rows.length - 6} 张` }}</a-button>
    </section>
    <a-modal v-if="!compact" v-model:open="settings" title="录入设置" :footer="null" width="480px" centered>
      <div class="quick-settings"><h3>什么时候收进衣柜</h3><a-radio-group v-model:value="mode"><a-radio value="BASE_READY"><strong>透明图做好后收进衣柜</strong><small>推荐 · 去背景、加白边后即可查看使用</small></a-radio><a-radio value="UPLOAD_READY"><strong>原图保存后立即收进衣柜</strong><small>先用原图，透明图做好后自动更新</small></a-radio></a-radio-group><div class="marker-setting"><div><h3>拍摄后指定主视衣物</h3><p>照片里有多件衣物时，点选或框选目标。</p></div><a-switch v-model:checked="markerMode" aria-label="拍摄后指定主视衣物" /></div><p class="storage-note">照片先存在本机，上传完成前请保持网页打开。“{{ wantedLabel }}”的叫法可以在「我的 → 外观」里改。</p><a-button type="primary" block size="large" @click="settings = false">完成</a-button></div>
    </a-modal>
    <a-drawer v-else v-model:open="settings" title="录入设置" placement="bottom" height="auto" root-class-name="quick-settings-drawer">
      <div class="quick-settings"><h3>什么时候收进衣柜</h3><a-radio-group v-model:value="mode"><a-radio value="BASE_READY"><strong>透明图做好后收进衣柜</strong><small>推荐 · 去背景、加白边后即可查看使用</small></a-radio><a-radio value="UPLOAD_READY"><strong>原图保存后立即收进衣柜</strong><small>先用原图，透明图做好后自动更新</small></a-radio></a-radio-group><div class="marker-setting"><div><h3>拍摄后指定主视衣物</h3><p>照片里有多件衣物时，点选或框选目标。</p></div><a-switch v-model:checked="markerMode" aria-label="拍摄后指定主视衣物" /></div><p class="storage-note">照片先存在本机，上传完成前请保持网页打开。“{{ wantedLabel }}”的叫法可以在「我的 → 外观」里改。</p><a-button type="primary" block size="large" @click="settings = false">完成</a-button></div>
    </a-drawer>
  </section>
</template>

<style scoped>
/* 清新改版：少字、大留白、居中；说明收进提示。浅底大圆角、胶囊按钮（src/styles/fresh.css）。 */
.quick-intake{max-width:760px;margin:0 auto}
.capture-panel{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:56px 32px 44px;border-radius:36px;background:var(--surface-alt);text-align:center;isolation:isolate;transition:background .35s ease}
.capture-panel::before,.capture-panel::after{content:'';position:absolute;z-index:-1;border-radius:50%;pointer-events:none;transition:transform .8s var(--spring)}
.capture-panel::before{top:-140px;right:-100px;width:360px;height:360px;background:radial-gradient(circle,var(--accent-soft) 0,transparent 70%)}
.capture-panel::after{bottom:-160px;left:-120px;width:320px;height:320px;background:radial-gradient(circle,color-mix(in srgb,var(--accent-soft) 70%,transparent) 0,transparent 70%)}
.capture-panel.wanted::before{transform:translate(-60px,40px) scale(1.2)}
.capture-panel.wanted::after{transform:translate(40px,-30px)}
.settings-button.ant-btn{position:absolute;top:18px;right:18px;width:40px;height:40px;color:var(--muted);background:var(--surface)}
.capture-title{margin:0;font-size:28px;line-height:1.3;font-weight:600;letter-spacing:-.5px;color:var(--ink)}
.ownership-choice{display:flex;align-items:center;gap:8px;margin-top:22px}
.ownership-switch.ant-segmented{background:var(--surface)}
.ownership-switch :deep(.ant-segmented-item-label){min-height:34px;line-height:34px;padding:0 16px;font-size:13px}
.ownership-switch :deep(.ant-segmented-item-selected),.ownership-switch :deep(.ant-segmented-thumb){background:var(--accent-soft);color:var(--accent-strong);box-shadow:none}
.ownership-help{font-size:14px;color:var(--muted-subtle);cursor:help}
.ownership-help:hover,.ownership-help:focus-visible{color:var(--accent-strong)}
.capture-actions{display:flex;justify-content:center;gap:12px;width:100%;max-width:440px;margin-top:40px}
.capture-actions .ant-btn{flex:1;height:60px;border-radius:999px;font-size:17px;font-weight:600;display:flex;justify-content:center;align-items:center;gap:8px}
.capture-actions .capture-main{flex:1.3}
.capture-actions .anticon{font-size:21px}
.capture-main.ant-btn{box-shadow:0 16px 30px -18px var(--accent)}
.capture-soft.ant-btn{border:0;background:var(--surface);color:var(--ink)}
.capture-soft.ant-btn:not(:disabled):hover{color:var(--accent-strong);background:var(--accent-soft)}
.capture-hint{margin:14px 0 0;font-size:12px;color:var(--muted-subtle)}
.capture-receipt{display:flex;align-items:center;gap:14px;width:100%;max-width:440px;margin-top:28px;font-size:13px;color:var(--muted-strong)}
.capture-receipt>.anticon{color:var(--accent)}
.session-copy{flex:none;font-variant-numeric:tabular-nums}
.session-progress{flex:1;margin:0;line-height:1}
.capture-local{margin:10px 0 0;font-size:12px;color:var(--warning)}
.capture-error{margin-top:16px}
.recent-section{margin-top:48px}
.recent-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 4px 16px}
.recent-heading h2{display:flex;align-items:baseline;gap:8px;margin:0;font-size:16px;font-weight:600}
.recent-heading h2 span{font-size:12px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums}
.recent-tools{display:flex;align-items:center}
.recent-tools .ant-btn{display:inline-flex;align-items:center;gap:4px;color:var(--muted)}.recent-tools .anticon-down{font-size:10px}
.capture-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0;color:var(--muted-subtle);font-size:13px}
.capture-empty p{margin:0}
.empty-hanger{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--surface-alt)}
.empty-hanger svg{width:30px;fill:none;stroke:var(--accent);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;transform-origin:50% 10%;animation:hanger-sway 2.6s ease-in-out infinite}
.quick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:24px 18px}
.quick-tile{min-width:0}
.quick-image{position:relative;display:block;width:100%;aspect-ratio:4/5;padding:0;border:0;border-radius:24px;overflow:hidden;background:var(--surface-alt);cursor:pointer;transition:transform .35s var(--spring),box-shadow .35s ease}
.quick-image:hover{transform:translateY(-3px);box-shadow:0 18px 30px -20px #00000040}
.quick-image:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.quick-image img{width:100%;height:100%;object-fit:contain;padding:12px}
.quick-tile.wanted .quick-image{outline:1.5px dashed var(--accent);outline-offset:-7px}
.ai-label{position:absolute;right:10px;bottom:10px;padding:0 6px;border-radius:999px;font-size:10px;line-height:16px;color:var(--muted);background:var(--surface)}
.tile-foot{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:8px 4px 0 6px}
.tile-chip{display:inline-flex;align-items:center;gap:6px;min-width:0;font-size:12px;color:var(--muted-strong);white-space:nowrap}
.tile-dot{width:6px;height:6px;border-radius:50%;background:var(--muted-subtle)}
.tile-chip.success .tile-dot{background:var(--success)}
.tile-chip.wanted{color:var(--accent-strong)}.tile-chip.wanted .tile-dot{background:var(--accent)}
.tile-chip.warning{color:var(--warning)}
.tile-chip.processing{color:var(--accent-strong)}
.tile-more.ant-btn{flex:none;color:var(--muted)}
.show-more.ant-btn{margin-top:20px;color:var(--muted)}
.quick-settings{max-width:600px;margin:auto;padding-bottom:env(safe-area-inset-bottom)}
.quick-settings h3{font-size:15px;margin:0 0 12px}
.quick-settings :deep(.ant-radio-group){display:grid;gap:12px}
.quick-settings :deep(.ant-radio-wrapper){align-items:flex-start;min-height:54px}
.quick-settings strong{display:block;font-size:14px;font-weight:500}
.quick-settings small{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
.marker-setting{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:24px;padding-top:20px;border-top:1px solid var(--line)}
.marker-setting h3{margin:0}
.marker-setting p,.storage-note{font-size:12px;line-height:1.8;color:var(--muted);margin:6px 0 0}
.marker-setting :deep(.ant-switch){flex-shrink:0}
.storage-note{margin:20px 0}
.drop-veil{position:absolute;inset:10px;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:2px dashed var(--accent);border-radius:28px;background:color-mix(in srgb,var(--surface) 90%,var(--accent) 10%);color:var(--accent-strong);pointer-events:none;animation:veil-in .18s ease-out}
.drop-veil .anticon{font-size:36px;animation:veil-bob 1s ease-in-out infinite}.drop-veil strong{font-size:18px}
.celebration{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px;margin-top:16px;padding:16px 44px 16px 18px;overflow:hidden;border-radius:28px;background:var(--success-bg)}
.celebration-badge{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--surface);color:var(--success);font-size:22px;animation:badge-pop .5s cubic-bezier(.34,1.56,.64,1) both .1s}
.celebration-copy strong{display:block;font-size:14px;font-weight:500;color:var(--ink)}.celebration-copy p{margin:2px 0 0;font-size:12px;color:var(--muted)}
.celebration-actions{display:flex;gap:8px}.celebration-actions .ant-btn{min-height:36px}
.celebration-close{position:absolute;top:6px;right:6px;color:var(--muted)}
.confetti{position:absolute;inset:0;pointer-events:none}
.confetti i{position:absolute;top:50%;left:38px;width:6px;height:6px;border-radius:2px;opacity:0;animation:confetti 1.1s cubic-bezier(.2,.7,.3,1) forwards}
.confetti i:nth-child(4n+1){background:var(--accent)}.confetti i:nth-child(4n+2){background:var(--warning)}.confetti i:nth-child(4n+3){background:var(--info)}.confetti i:nth-child(4n){background:var(--danger);border-radius:50%}
.confetti i:nth-child(1){--x:60px;--y:-40px}.confetti i:nth-child(2){--x:110px;--y:-22px}.confetti i:nth-child(3){--x:150px;--y:18px}.confetti i:nth-child(4){--x:90px;--y:34px}.confetti i:nth-child(5){--x:40px;--y:44px}.confetti i:nth-child(6){--x:-10px;--y:-46px}.confetti i:nth-child(7){--x:190px;--y:-34px}.confetti i:nth-child(8){--x:230px;--y:10px}.confetti i:nth-child(9){--x:130px;--y:-48px}.confetti i:nth-child(10){--x:-24px;--y:30px}.confetti i:nth-child(11){--x:270px;--y:-20px}.confetti i:nth-child(12){--x:200px;--y:40px}.confetti i:nth-child(13){--x:310px;--y:24px}.confetti i:nth-child(14){--x:75px;--y:-58px}
.celebrate-enter-active{transition:opacity .3s ease-out,transform .35s cubic-bezier(.34,1.56,.64,1)}.celebrate-leave-active{transition:opacity .2s ease-in}
.celebrate-enter-from{opacity:0;transform:translateY(8px) scale(.98)}.celebrate-leave-to{opacity:0}
.note-enter-active,.note-leave-active{transition:opacity .25s,transform .3s}.note-enter-from,.note-leave-to{opacity:0;transform:translateY(-4px)}
.quick-tile[data-tone="processing"] .quick-image::after,.quick-tile[data-state="UPLOADING"] .quick-image::after{content:'';position:absolute;left:0;right:0;top:0;height:36%;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--accent) 18%,transparent) 85%,color-mix(in srgb,var(--accent) 55%,transparent));animation:scan 1.8s ease-in-out infinite;pointer-events:none}
.quick-tile.just-ready .quick-image{animation:sticker-pop .6s cubic-bezier(.34,1.56,.64,1);box-shadow:0 0 0 4px var(--success-bg)}
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
@keyframes sparkle{0%{opacity:0;transform:scale(.2) rotate(0)}40%{opacity:1;transform:scale(1.2) rotate(45deg)}100%{opacity:0;transform:scale(.6) rotate(90deg)}}
@media(max-width:767px){
  .capture-panel{padding:44px 20px 32px;border-radius:30px}
  .capture-panel::before{width:240px;height:240px;top:-100px;right:-80px}
  .capture-panel::after{width:220px;height:220px;bottom:-120px;left:-90px}
  .settings-button.ant-btn{top:12px;right:12px}
  .capture-title{font-size:23px}
  .ownership-switch :deep(.ant-segmented-item-label){padding:0 12px}
  .capture-actions{margin-top:32px;gap:10px}
  .capture-actions .ant-btn{height:56px;font-size:16px}
  .recent-section{margin-top:36px}
  .quick-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px}
  .quick-image{border-radius:20px}
  .celebration{grid-template-columns:auto minmax(0,1fr);padding:14px;gap:12px}.celebration-copy{padding-right:24px}.celebration-actions{grid-column:1/-1}.celebration-actions .ant-btn{flex:1}
}
@media(prefers-reduced-motion:reduce){.drop-veil,.drop-veil .anticon,.celebration-badge,.confetti i,.empty-hanger svg,.quick-tile .quick-image::after,.quick-tile.just-ready .quick-image,.sparkles i{animation:none}.confetti,.sparkles{display:none}.row-enter-from,.celebrate-enter-from,.note-enter-from{transform:none}.capture-panel,.capture-panel::before,.capture-panel::after,.quick-image{transition:none}}
</style>
