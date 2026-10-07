<script setup lang="ts">
import { createUuid } from '../domain/id'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { CameraOutlined, PictureOutlined, SettingOutlined, CheckCircleFilled, LoadingOutlined, ClockCircleOutlined, ArrowRightOutlined } from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { mediaUrl } from '../services/urls'
import { prefersNativeCamera } from '../services/camera'
import CameraCapture from './CameraCapture.vue'
import TargetMarker from './TargetMarker.vue'
import { savePhoto, checkLocalStorage, updateSavedResult, refreshUploads, pumpUploads, uploadRows, uploadError, markPhoto, retryPhoto, removePhoto, quickApi, type LocalPhoto, type Hint } from '../services/quickIntake'

const closet = useClosetStore(), router = useRouter()
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
  if (row.result) return mediaUrl(row.result.garment.displayUrl || row.result.garment.sourceUrl)
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
async function capture(file: File, specify = false) {
  const account = owner(); if (!account) return
  saving.value = true; received.value = '已收到照片，正在保存在本机…'
  const dismiss = message.loading({ content: '已收到照片，正在保存…', duration: 0 })
  try {
    const row = await savePhoto(account, file, mode.value, session, specify || markerMode.value)
    if (owner() !== account) return
    if (row.state === 'MARKING' && !marker.value) marker.value = row
    received.value = row.state === 'MARKING' ? '照片已收到，请指定这张的主视衣物。' : navigator.onLine ? '照片已收到，正在上传。可以继续拍下一件。' : '照片已保存在本机，联网后会自动上传。'
    error.value = ''; message.success({ content: received.value, duration: 3 }); void pumpUploads(owner)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '照片保存失败，请重试'; received.value = ''; camera.value = false; message.error(error.value) }
  finally { dismiss(); saving.value = false }
}
async function selected(event: Event) {
  const element = event.target as HTMLInputElement, files = Array.from(element.files || [])
  element.value = ''
  for (const file of files) { await capture(file); if (error.value) break }
}
async function marked(hint?: Hint) {
  if (!marker.value || !owner()) return
  try { const id = marker.value.id; await markPhoto(id, owner()!, hint); marker.value = rows.value.find(row => row.state === 'MARKING' && row.id !== id); error.value = ''; void pumpUploads(owner) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '目标保存失败，请重试' }
}
async function retry(row: LocalPhoto) { await retryPhoto(row.id, owner()!); await refreshUploads(owner()!); void pumpUploads(owner) }
async function refresh() {
  const account = owner(); if (!alive || !account) return
  try {
    await refreshUploads(account)
    await Promise.all(rows.value.filter(row => row.state === 'SAVED' && active(row)).map(async row => {
      const view = await quickApi.get(row.id)
      if (!alive || account !== owner()) return
      await updateSavedResult(row.id, account, view)
      const current = uploadRows.value.find(item => item.id === row.id)
      if (current) current.result = view
    }))
    error.value = ''
  } catch { if (rows.value.some(row => row.state === 'SAVED' && active(row))) error.value = '暂时无法刷新进度，已保存的照片不受影响，连接恢复后继续。' }
  if (alive) timer = window.setTimeout(refresh, rows.value.some(active) || localCount.value ? 1200 : 4000)
}
watch(rows, list => {
  for (const [id, url] of thumbnails) if (!list.some(row => row.id === id && row.blob)) { URL.revokeObjectURL(url); thumbnails.delete(id) }
})
watch(() => owner(), () => { marker.value = undefined; received.value = ''; uploadRows.value = []; void refreshUploads(owner() || '') })
function screenChanged() { compact.value = window.matchMedia('(max-width: 1023px)').matches }
onMounted(() => { void refresh(); window.addEventListener('resize', screenChanged) })
onBeforeUnmount(() => { alive = false; clearTimeout(timer); for (const url of thumbnails.values()) URL.revokeObjectURL(url); window.removeEventListener('resize', screenChanged) })
</script>

<template>
  <section class="quick-intake" aria-label="快速拍照入柜">
    <div class="capture-panel">
      <div class="capture-heading"><div><h2>拍一件，收一件</h2><p>先做好贴纸给你看，资料自动补齐。</p></div><a-button type="text" class="settings-button" aria-label="录入设置" @click="settings = true"><SettingOutlined /><span>设置</span></a-button></div>
      <div class="capture-actions">
        <a-button type="primary" size="large" :disabled="saving || Boolean(uploadError)" :loading="saving" @click="takePhoto"><CameraOutlined v-if="!saving" />{{ rows.length ? '再拍一件' : '拍照' }}</a-button>
        <a-button size="large" :disabled="saving || Boolean(uploadError)" @click="input?.click()"><PictureOutlined />从相册选</a-button>
      </div>
      <p class="capture-hint">相册可多选 · 拍完自动上传 · 不用等上一件</p>
      <div class="capture-receipt" role="status" aria-live="polite" aria-atomic="true">
        <template v-if="saving"><LoadingOutlined spin /><span>收到照片，正在保存…</span></template>
        <template v-else-if="rows[0]"><CheckCircleFilled v-if="status(rows[0]).tone === 'success'" class="success" /><LoadingOutlined v-else-if="status(rows[0]).tone === 'processing'" spin /><ClockCircleOutlined v-else /><span>{{ status(rows[0]).title }}<small>{{ localCount ? `${localCount} 张仍在本机，请保持网页打开完成上传。` : '可以继续拍照，或离开页面做别的事。' }}</small></span></template>
        <template v-else><CheckCircleFilled /><span>贴纸做好后自动入柜<small>无需逐件确认，可随时修改和换图。</small></span></template>
      </div>
      <p v-if="markerMode || mode === 'UPLOAD_READY'" class="custom-settings">{{ mode === 'UPLOAD_READY' ? '当前：原图保存即入柜' : '' }}{{ markerMode ? ' · 每张指定主视衣物' : '' }}</p>
    </div>
    <input ref="input" type="file" class="hidden-file-input" multiple accept="image/jpeg,image/png" tabindex="-1" @change="selected" />
    <input ref="nativeInput" type="file" class="hidden-file-input" accept="image/*" capture="environment" tabindex="-1" @change="selected" />
    <CameraCapture v-if="camera" continuous :disabled="saving || Boolean(uploadError)" @close="camera = false" @capture="capture" />
    <TargetMarker v-if="marker" :key="marker.id" :blob="marker.blob!" @finish="marked" @close="marker = undefined" />
    <a-alert v-if="error || uploadError" class="capture-error" type="warning" :message="uploadError || error" show-icon />
    <a-button v-if="uploadError" @click="checkLocalStorage(owner()!)">释放空间后重新检查</a-button>
    <section class="recent-section" aria-label="本机最近录入">
      <div class="recent-heading"><h2>最近录入 <span v-if="rows.length">{{ admitted }} 件已入柜</span></h2><a-button type="text" @click="router.push('/tasks')">全部任务<ArrowRightOutlined /></a-button></div>
      <div v-if="!rows.length" class="capture-empty"><PictureOutlined /><div><strong>从第一张衣物照片开始</strong><p>照片与贴纸会在这里更新，处理进度一眼可见。</p></div></div>
      <div v-else class="quick-list">
        <article v-for="row in visibleRows" :key="row.id" class="quick-row" :data-state="row.state">
          <div class="quick-image"><img :src="thumbnail(row)" :alt="row.result?.garment.imageProcessing?.stickerReady ? '已制作的衣物贴纸' : '本次录入的衣物照片'" /><span v-if="aiImage(row)" class="ai-label">AI 生成</span></div>
          <div class="quick-row-copy"><p class="row-status" :class="status(row).tone"><LoadingOutlined v-if="status(row).tone === 'processing'" spin /><CheckCircleFilled v-else-if="status(row).tone === 'success'" />{{ status(row).title }}</p><p class="row-detail">{{ status(row).detail }}</p><p v-if="aiImage(row)" class="row-detail">可能包含推测细节</p>
            <div class="row-actions"><a-button v-if="row.result" size="small" @click="router.push(`/garment/${row.result.garmentId}`)">查看衣物<ArrowRightOutlined /></a-button><a-button v-if="row.state === 'ERROR'" size="small" @click="retry(row)">重试上传</a-button><a-button v-if="row.state === 'MARKING'" size="small" @click="marker = row">指定目标</a-button><a-button v-if="row.state === 'ERROR' || row.state === 'MARKING'" type="text" size="small" @click="removePhoto(row.id, owner()!)">移除</a-button></div>
          </div>
        </article>
      </div>
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
.quick-intake{max-width:900px;margin:0 auto}.capture-panel{padding:28px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-xl)}.capture-heading,.recent-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.capture-heading h2{font-size:22px;line-height:1.4;margin:0;letter-spacing:-.4px}.capture-heading p{font-size:14px;color:var(--muted);margin:6px 0 0}.settings-button{min-height:44px;color:var(--muted);display:inline-flex;align-items:center;gap:5px;padding:0 10px}.capture-actions{display:grid;grid-template-columns:1.2fr 1fr;gap:12px;margin-top:24px}.capture-actions .ant-btn{height:60px;border-radius:var(--radius-lg);font-size:17px;font-weight:600;display:flex;justify-content:center;align-items:center;gap:8px}.capture-actions .anticon{font-size:23px}.capture-hint{font-size:12px;line-height:1.6;color:var(--muted);margin:12px 0 0;text-align:center}.capture-receipt{display:flex;align-items:center;gap:12px;border-top:1px solid var(--line);padding-top:18px;margin-top:20px;font-size:14px;color:var(--ink);min-height:61px}.capture-receipt>.anticon{font-size:21px;color:var(--accent)}.capture-receipt small{display:block;font-size:12px;color:var(--muted);margin-top:4px;line-height:1.6}.capture-receipt .success{color:var(--success)}.custom-settings{font-size:12px;color:var(--muted);margin:12px 0 0}.capture-error{margin-top:16px}.recent-section{margin-top:28px}.recent-heading{margin-bottom:8px}.recent-heading h2{font-size:17px;margin:0}.recent-heading h2 span{font-size:12px;font-weight:400;color:var(--muted);margin-left:8px}.recent-heading .ant-btn{min-height:44px;padding-right:0;color:var(--muted)}.capture-empty{display:flex;align-items:center;gap:16px;border:1px dashed var(--line);border-radius:var(--radius-lg);padding:28px 24px;color:var(--muted)}.capture-empty>.anticon{font-size:32px;color:var(--muted-copy)}.capture-empty strong{font-size:14px;font-weight:500;color:var(--ink)}.capture-empty p{font-size:12px;margin:6px 0 0;line-height:1.7}.quick-row{display:flex;align-items:center;gap:20px;padding:18px 0;border-bottom:1px solid var(--line)}.quick-image{position:relative;flex:none;width:112px;height:120px;border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;background:var(--surface-alt)}.quick-image img{width:100%;height:100%;object-fit:contain}.ai-label{position:absolute;bottom:0;left:0;right:0;font-size:10px;text-align:center;background:var(--surface);color:var(--muted);padding:2px}.quick-row-copy{flex:1;min-width:0}.row-status{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600;line-height:1.5;color:var(--ink);margin:0}.row-status.success{color:var(--success)}.row-status.warning{color:var(--warning)}.row-detail{font-size:12px;color:var(--muted);line-height:1.7;margin:5px 0 0}.row-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.row-actions .ant-btn{min-height:44px;padding:0 12px;display:flex;align-items:center;gap:6px}.row-actions .ant-btn-default{border-color:transparent;background:var(--surface);color:var(--accent-strong)}.show-more{margin-top:16px;min-height:44px}.quick-settings{max-width:600px;margin:auto;padding-bottom:env(safe-area-inset-bottom)}.quick-settings h3{font-size:15px;margin:0 0 12px}.quick-settings :deep(.ant-radio-group){display:grid;gap:12px}.quick-settings :deep(.ant-radio-wrapper){align-items:flex-start;min-height:54px}.quick-settings strong{display:block;font-size:14px;font-weight:500}.quick-settings small{display:block;margin-top:6px;font-size:12px;color:var(--muted)}.marker-setting{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:24px;padding-top:20px;border-top:1px solid var(--line)}.marker-setting h3{margin:0}.marker-setting p,.storage-note{font-size:12px;line-height:1.8;color:var(--muted);margin:6px 0 0}.marker-setting :deep(.ant-switch){flex-shrink:0}.storage-note{margin:20px 0}
@media(max-width:767px){.capture-panel{padding:20px;border-radius:var(--radius-lg)}.capture-heading h2{font-size:20px}.capture-heading p{font-size:12px}.settings-button{padding:0 4px}.capture-actions{margin-top:20px;gap:10px;grid-template-columns:1.1fr 1fr}.capture-actions .ant-btn{height:58px;font-size:16px;padding:0 8px}.capture-hint{font-size:11px}.capture-receipt{font-size:13px;gap:10px}.capture-receipt small{font-size:11px}.recent-section{margin-top:22px}.recent-heading h2{font-size:16px}.recent-heading .ant-btn{font-size:12px}.quick-row{gap:14px;padding:16px 0;align-items:flex-start}.quick-image{width:88px;height:104px;border-radius:var(--radius-md)}.row-status{font-size:14px}.row-detail{font-size:12px}.capture-empty{padding:22px 18px;gap:12px}.capture-empty>.anticon{font-size:26px}}
</style>
