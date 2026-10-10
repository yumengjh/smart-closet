<script setup lang="ts">
import { createUuid } from '../domain/id'
import { quickApi } from '../services/quickIntake'
import { mediaUrl } from '../services/urls'
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import GarmentRecommendPanel from '../recommend/GarmentRecommendPanel.vue'
import SimilarGarmentsPanel from '../similar/SimilarGarmentsPanel.vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ArrowLeftOutlined, CheckOutlined, DeleteOutlined, ReloadOutlined, RollbackOutlined, PictureOutlined, StopOutlined, EyeOutlined, InfoCircleOutlined, EditOutlined, SettingOutlined, HistoryOutlined } from '@ant-design/icons-vue'
import { App as AntApp } from 'ant-design-vue'
import { closetApi, fieldLabels, usingMocks, type Garment, type ClosetTask } from '../services/api'
import { metadataPatch, rebaseMetadata, type MetadataField } from '../domain/metadata'
import { isProcessing, blocksConfirmation, workflowSummary, generatedImages, imageLabels, orderedTasks } from '../domain/workflow'
import { useClosetStore } from '../stores/closet'
import TaskProgress from '../components/TaskProgress.vue'
import WaitingActivities from '../components/WaitingActivities.vue'
import { useProcessingStore } from '../stores/processing'
import GarmentMetadataFields from '../components/GarmentMetadataFields.vue'
import GarmentEdgeHelp from '../components/GarmentEdgeHelp.vue'
import { batchApi } from '../services/batches'
import { playSound } from '../services/sound'

const quickIntakeId = ref(''), enhanceOpen = ref(false), enhanceFeedback = ref(''), enhanceKey = ref('')
async function enhanceQuick() { if (!quickIntakeId.value || busy.value) return; busy.value = 'enhance'; try { enhanceKey.value ||= createUuid(); const view = await quickApi.enhance(quickIntakeId.value, enhanceKey.value, enhanceFeedback.value); quickIntakeId.value = view.intakeId; enhanceKey.value = ''; enhanceOpen.value = false; await load(); schedulePoll() } catch (cause) { error.value = String(cause) } finally { busy.value = '' } }
const source = ref<{batchId?: string; originalUrl?: string; previewUrl?: string; completion?: boolean}>({})
const { modal, message } = AntApp.useApp()
/** Set once the garment is in the trash: leaving must not be blocked by the busy or unsaved-changes guard (issue #13). */
let trashed = false
const route = useRoute(); const router = useRouter(); const closet = useClosetStore()
const garment = ref<Garment | null>(null); const task = ref<ClosetTask | null>(null)
const imageTask = ref<ClosetTask | null>(null); const parentTask = ref<ClosetTask | null>(null)
const processingTasks = useProcessingStore()
watch([task, imageTask], tasks => { for (const item of tasks) if (item) processingTasks.trackTask(item, false, !route.query.batch) })
const continuationKeys = new Map<string, string>()
const values = reactive<Record<string, string[]>>({}); const baseline = ref<Garment | null>(null)
const loading = ref(true); const busy = ref(''); const error = ref(''); const connectionError = ref(''); const success = ref('')
const viewedResultId = ref(''); const selectedAssetId = ref(''); const resetFields = ref<string[]>([]); const now = ref(Date.now())
const schema = ref<MetadataField[]>([])
const layeringFields = ['fit', 'thickness', 'wearingModes']
const confirmLayering = ref(false)
const layeringVerified = computed(() => layeringFields.every(key => (garment.value?.overrides[key] || []).length && JSON.stringify(values[key] || []) === JSON.stringify(garment.value?.overrides[key] || [])))
const fields = Object.keys(fieldLabels) as (keyof typeof fieldLabels)[]
const dirty = computed(() => Boolean(baseline.value && (confirmLayering.value || resetFields.value.length || selectedAssetId.value !== baseline.value.displayAssetId || fields.some(key => JSON.stringify(values[key] || []) !== JSON.stringify(baseline.value?.[key] || [])))))
const title = computed(() => garment.value?.name || (garment.value?.category[0] ? `${garment.value.primaryColor[0] || ''}${garment.value.category[0]}` : '新上传衣物'))
const processing = computed(() => isProcessing(task.value?.status) || isProcessing(garment.value?.taskStatus) || isProcessing(imageTask.value?.status))
const currentTasks = computed(() => orderedTasks(task.value, imageTask.value))
const displayTask = computed(() => currentTasks.value[0] || null)
const historyTasks = computed(() => orderedTasks(task.value, imageTask.value, parentTask.value))
const summary = computed(() => garment.value ? workflowSummary(garment.value, displayTask.value) : null)
const recognitionOpen = ref(false), recognitionHint = ref('')
async function submitRecognition() {
  if (!garment.value || busy.value || processing.value || dirty.value) return
  busy.value = 'retry'; error.value = ''; success.value = ''
  try {
    const next = await closetApi.recognize(garment.value.id, recognitionHint.value.trim())
    task.value = next; recognitionOpen.value = false; returnResult()
    await router.replace({ path: route.path, query: { ...route.query, task: next.id } })
    await load(); await closet.refreshCounts(); schedulePoll()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '识别任务提交失败。' }
  finally { busy.value = '' }
}
const results = computed(() => quickIntakeId.value ? (garment.value?.images || []).filter(image => ['BASE', 'BASE_STICKER', 'AI_ENHANCED'].includes(image.kind)) : generatedImages(imageTask.value || task.value))
const imageOptions = computed(() => {
  const record = garment.value
  if (!record) return []
  const original = record.images.find(image => image.url === record.sourceUrl)
  const current = record.images.find(image => image.id === record.displayAssetId)
  const choices = [original, ...(quickIntakeId.value ? record.images : results.value), current].filter((image): image is Garment['images'][number] => Boolean(image))
  return choices.filter((image, index) => choices.findIndex(other => other.id === image.id) === index)
})
const selectedImage = computed(() => imageOptions.value.find(image => image.id === selectedAssetId.value))
const latestResult = computed(() => results.value.find(image => image.id === viewedResultId.value) || results.value[results.value.length - 1])
const mainTarget = computed(() => task.value?.steps.find(step => step.recognition?.target)?.recognition?.target || garment.value?.target)
const blocked = computed(() => blocksConfirmation(garment.value?.assessment))
const stickerPending = computed(() => Boolean(garment.value?.imageProcessing?.stickerRequired && !garment.value.imageProcessing.stickerReady))
const recoveryAsset = computed(() => {
  const run = imageTask.value || task.value
  if (!run) return null
  const step = [...run.steps].reverse().find(step => step.outputUrl && ['ENSURE_TRANSPARENCY', 'SEGMENT', 'GENERATE', 'STICKER'].includes(step.type || ''))
  return run.assets?.find(asset => asset.url === step?.outputUrl) || run.assets?.find(asset => asset.url === run.inputUrl) || null
})
const forceAsset = computed(() => {
  const run = imageTask.value || task.value
  const check = [...(run?.steps || [])].reverse().find(step => step.type === 'ENSURE_TRANSPARENCY')
  // Re-cut the image before its mask, so a damaged mask does not erase source pixels.
  return run?.assets?.find(asset => asset.url === check?.inputUrl) || run?.assets?.find(asset => asset.url === run.inputUrl) || recoveryAsset.value
})
const transparency = computed(() => [...(imageTask.value?.steps || [])].reverse().find(step => step.transparency)?.transparency?.after)
const canApproveTransparency = computed(() => Boolean(transparency.value?.hasAlpha && transparency.value.transparentRatio >= .005 && ['USABLE', 'SUSPICIOUS'].includes(transparency.value.verdict)))
const checkReasons: Record<string, string> = { FOREGROUND_TOUCHES_IMAGE_EDGE: '衣物或残留像素接触画面边缘', FRAGMENTED_FOREGROUND: '检测到多个分离的区域', LARGE_SEMITRANSPARENT_AREA: '半透明区域较大', VERY_SMALL_FOREGROUND: '主体面积偏小', MOST_OF_IMAGE_IS_FOREGROUND: '主体占比过大', INSUFFICIENT_EXTERIOR_TRANSPARENCY: '画面外缘透明区域不足', NO_EFFECTIVE_TRANSPARENCY: '图片没有有效透明背景', NO_EFFECTIVE_FOREGROUND: '没有可用的衣物主体' }
const canConfirm = computed(() => !processing.value && schema.value.length > 0 && !connectionError.value && !blocked.value && !stickerPending.value && Boolean(selectedAssetId.value))
const latestTaskId = computed(() => String(route.query.task || garment.value?.taskId || ''))

const panel = ref<'result' | 'metadata' | 'images' | 'history'>('result')
const advanced = ref<'appearance' | 'labels' | ''>('')
const originalOpen = ref(false), completed = ref(false)
const basicKeys = ['category', 'primaryColor', 'patterns', 'seasons']
const appearanceKeys = ['secondaryColors', 'neckline', 'sleeveLength', 'garmentLength', 'closure', 'texture', 'styles']
const basicSchema = computed(() => schema.value.filter(field => basicKeys.includes(field.key)))
const layeringSchema = computed(() => schema.value.filter(field => layeringFields.includes(field.key)))
const advancedSchema = computed(() => schema.value.filter(field => !basicKeys.includes(field.key) && !layeringFields.includes(field.key) && (advanced.value === 'appearance' ? appearanceKeys.includes(field.key) : !appearanceKeys.includes(field.key))))
const previewUrl = computed(() => !quickIntakeId.value && (processing.value || blocked.value) ? garment.value?.sourceUrl : selectedImage.value?.url || latestResult.value?.url || garment.value?.displayUrl || garment.value?.sourceUrl)
const pageTitle = computed(() => completed.value ? '已放进衣柜' : panel.value === 'metadata' ? '编辑衣物资料' : panel.value === 'images' ? '调整展示图片' : panel.value === 'history' ? '处理记录' : processing.value ? '正在识别与整理' : blocked.value ? '先解决照片问题，再继续入柜' : stickerPending.value ? '图片已保留，贴纸还差一步' : garment.value?.status === 'ACTIVE' ? title.value : garment.value?.status === 'TRASHED' ? '衣物已移入回收站' : '识别与整理结果')
const pageSubtitle = computed(() => panel.value === 'metadata' ? '按需修改，未知可留空。保存后返回结果，无需重新识别。' : panel.value === 'images' ? '对照原图选择展示图片，需要时重新处理衣物边缘。' : panel.value === 'history' ? '任务与图片保留，展示服务端的实际处理状态。' : completed.value ? '图片与衣物信息已保存，之后仍可继续修改。' : processing.value ? '处理在后台继续，你可以先离开，回来后继续。' : blocked.value ? '当前照片无法确认单件衣物，已填写的信息与原图都保留。' : stickerPending.value ? '可继续本地处理，也可以明确选择暂用原图入柜。' : quickIntakeId.value ? '图片保存后自动入柜，可随时调整展示图或编辑资料。' : '确认入柜即可，需要时再调整图片或编辑资料。')
function fieldValue(key: string) { return (values[key] || []).join('、') || '未知' }
let editorSnapshot: { values: Record<string, string[]>; image: string; resets: string[]; layering: boolean } | undefined
function openPanel(next: typeof panel.value) {
  editorSnapshot = { values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [...value]])), image: selectedAssetId.value, resets: [...resetFields.value], layering: confirmLayering.value }
  panel.value = next; advanced.value = ''; window.scrollTo({ top: 0, behavior: 'instant' })
}
function returnResult(cancelEdits = false) {
  if (cancelEdits && editorSnapshot) {
    for (const key of fields) values[key] = [...(editorSnapshot.values[key] || [])]
    selectedAssetId.value = editorSnapshot.image; resetFields.value = [...editorSnapshot.resets]; confirmLayering.value = editorSnapshot.layering
  }
  if (cancelEdits) { error.value = ''; success.value = '' }
  panel.value = 'result'; advanced.value = ''; editorSnapshot = undefined; window.scrollTo({ top: 0, behavior: 'instant' })
}
async function saveAndReturn() {
  if (!dirty.value && !(quickIntakeId.value && panel.value === 'images')) { returnResult(); return }
  await save(false)
  if (!error.value) returnResult()
}
function leaveWorkspace() {
  const leave = () => router.push(source.value.batchId ? `/batches/${source.value.batchId}` : garment.value?.status === 'ACTIVE' ? '/wardrobe' : '/pending')
  if (dirty.value) modal.confirm({ title: '离开前保存修改？', content: '当前资料或展示图还有未保存的修改。', okText: '保存并离开', cancelText: '继续编辑', onOk: async () => { await save(false); if (!error.value) await leave() } })
  else void leave()
}
async function loadSource() {
  const id = String(route.params.id); source.value = {}
  try { const value = await batchApi.provenance(id); if (String(route.params.id) === id) source.value = value } catch { /* Single-item uploads have no batch provenance. */ }
}

onBeforeRouteLeave(() => {
  if (trashed) return true
  if (busy.value) return false
  if (!dirty.value) return true
  return new Promise<boolean>(resolve => modal.confirm({ title: '离开前保存修改？', content: '当前资料或展示图还有未保存的修改。', okText: '保存并离开', cancelText: '继续编辑', closable: false, maskClosable: false, onCancel: () => resolve(false), onOk: async () => { await save(false); resolve(!error.value) } }))
})

let timer = 0; let elapsedTimer = 0; let alive = false; let pollDelay = 2000; let generation = 0
function syncForm(record: Garment) {
  confirmLayering.value = false
  baseline.value = structuredClone(toRaw(record)); selectedAssetId.value = record.displayAssetId; resetFields.value = []
  for (const key of fields) values[key] = [...(record[key] || [])]
}
async function load(reset = false) {
  const epoch = generation
  try {
    const [record, definitions] = await Promise.all([closetApi.detail(String(route.params.id)), schema.value.length ? Promise.resolve(schema.value) : closetApi.metadataFields()])
    const id = String(route.query.task || record.taskId || '')
    quickIntakeId.value = (usingMocks ? {} : await quickApi.provenance(record.id)).intakeId || ''
    const imageId = record.imageProcessing?.jobId
    const [currentTask, currentImageTask] = await Promise.all([id ? closetApi.task(id) : null, imageId && imageId !== id ? closetApi.task(imageId) : null])
    const previousId = (imageId === id ? currentTask : currentImageTask)?.parentJobId
    const previousTask = previousId ? await closetApi.task(previousId) : null
    if (!alive || epoch !== generation) return
    parentTask.value = previousTask
    const hadEdits = dirty.value
    const wasProcessing = processing.value
    garment.value = record; task.value = currentTask; imageTask.value = imageId === id ? currentTask : currentImageTask; schema.value = definitions
    if (reset || !baseline.value || !hadEdits) syncForm(record)
    connectionError.value = ''; pollDelay = 2000
    if (reset || wasProcessing && !processing.value) void closet.refreshCounts()
  } catch (cause) {
    if (!alive || epoch !== generation) return
    connectionError.value = cause instanceof Error ? cause.message : '无法获取服务端状态。'
    pollDelay = Math.min(pollDelay * 2, 30000)
  } finally { if (epoch === generation) loading.value = false }
}
function schedulePoll() {
  window.clearTimeout(timer)
  if (!alive || (!processing.value && !connectionError.value)) return
  timer = window.setTimeout(async () => { await load(); schedulePoll() }, pollDelay)
}
function patchFromForm() { const patch = metadataPatch(schema.value, values, baseline.value || {}, resetFields.value); if (confirmLayering.value) for (const key of layeringFields) patch[key] = [...(values[key] || [])]; return patch }
function editField(key: string, next: string[]) { if (layeringFields.includes(key)) confirmLayering.value = false; values[key] = next; resetFields.value = resetFields.value.filter(field => field !== key) }
function restoreAutomatic(key: string) { if (layeringFields.includes(key)) confirmLayering.value = false; if (!resetFields.value.includes(key)) resetFields.value.push(key); values[key] = [...(garment.value?.automatic[key] || [])] }
async function save(confirming = false, originalFallback = false) {
  if (!garment.value || !baseline.value || !schema.value.length || busy.value || processing.value && !quickIntakeId.value) return
  busy.value = confirming ? 'confirm' : 'save'; error.value = ''; success.value = ''
  try {
    let record = confirming
      ? await closetApi.confirm(garment.value.id, { revision: baseline.value.revision, assetId: originalFallback ? garment.value.images.find(image => image.url === garment.value?.sourceUrl)?.id : selectedAssetId.value, allowIncompleteSticker: originalFallback, fields: patchFromForm(), resetFields: [...resetFields.value] })
      : await closetApi.update(garment.value.id, { revision: baseline.value.revision, fields: patchFromForm(), resetFields: [...resetFields.value] })
    if (!confirming && (selectedAssetId.value !== record.displayAssetId || quickIntakeId.value && panel.value === 'images')) record = await closetApi.chooseDisplay(record.id, selectedAssetId.value, record.revision)
    garment.value = record; syncForm(record); success.value = confirming ? originalFallback ? '已暂用原图入柜，贴纸仍未完成，可稍后继续制作。' : '已确认入柜，图片和信息已保存。' : '修改已保存。'
    playSound('success')
    if (confirming && !originalFallback) { completed.value = true; panel.value = 'result' }
    await closet.refreshCounts()
  } catch (cause) { playSound('denied'); error.value = cause instanceof Error ? cause.message : '保存失败，你的输入仍保留。' }
  finally { busy.value = '' }
}
function useOriginal() {
  modal.confirm({ title: '暂用上传原图入柜？', content: '贴纸尚未完成。本次保存原图和信息，不会把中间结果标记成贴纸。以后可从衣物详情继续制作。', okText: '暂用原图入柜', cancelText: '继续制作贴纸', onOk: () => save(true, true) })
}
async function continueSticker(policy: 'FORCE' | 'REVIEWED') {
  const run = imageTask.value || task.value; const asset = policy === 'FORCE' ? forceAsset.value : recoveryAsset.value
  if (!run || !asset || processing.value || busy.value || connectionError.value) return
  if (dirty.value) { await save(false); if (error.value) return }
  busy.value = 'continue'; error.value = ''; success.value = ''
  const identity = `${run.id}:${asset.id}:${policy}`
  const key = continuationKeys.get(identity) || createUuid(); continuationKeys.set(identity, key)
  try {
    const next = await closetApi.continueSticker(run.id, asset.id, policy, key)
    imageTask.value = next; task.value = next; viewedResultId.value = ''; returnResult()
    continuationKeys.delete(identity)
    await router.replace({ path: route.path, query: { ...route.query, task: next.id } }); await load(); schedulePoll()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '本地处理提交失败，原图和修改已保留。' }
  finally { busy.value = '' }
}
function approveTransparency() {
  modal.confirm({ title: '已核对这张透明图片？', content: '请先对照原图，确认衣物完整、背景已去除、没有明显杂物。继续后会实际制作白边贴纸，不再调用 AI。', okText: '确认并制作贴纸', cancelText: '返回检查', onOk: () => continueSticker('REVIEWED') })
}
function reconcile() {
  modal.confirm({ title: '核对当前服务端版本', content: '保留你修改过的字段，更新未修改的字段。请核对服务端当前值后再主动保存。', okText: '保留输入并核对', cancelText: '返回编辑', onOk: async () => {
    const previous = baseline.value
    const input = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [...value]]))
    const image = selectedAssetId.value; const resets = [...resetFields.value]
    await load()
    if (!garment.value || !previous || connectionError.value) return
    Object.assign(values, rebaseMetadata(schema.value, input, previous, garment.value))
    selectedAssetId.value = image === previous.displayAssetId ? garment.value.displayAssetId : image
    resetFields.value = resets
    for (const key of resets) values[key] = [...(garment.value.automatic[key] || [])]
    if (editorSnapshot) {
      editorSnapshot.values = rebaseMetadata(schema.value, editorSnapshot.values, previous, garment.value)
      if (editorSnapshot.image === previous.displayAssetId) editorSnapshot.image = garment.value.displayAssetId
      for (const key of editorSnapshot.resets) editorSnapshot.values[key] = [...(garment.value.automatic[key] || [])]
    }
    baseline.value = structuredClone(toRaw(garment.value)); error.value = ''; success.value = '输入已保留，请核对服务端当前值后保存。'
  } })
}
async function startRun(mode: 'recognize' | 'reprocess') {
  if (!garment.value || busy.value || processing.value || usingMocks) return
  if (dirty.value) { error.value = '请先保存当前修改，再提交新的处理任务。'; return }
  if (mode === 'recognize') { recognitionOpen.value = true; return }
  modal.confirm({ title: '重新整理图片？', content: '会分别调用识别和整理模型，各使用 1 次 AI 额度，共 2 次。已有人工修改和图片会保留。', okText: '提交真实任务', cancelText: '取消', onOk: async () => {
    busy.value = 'retry'; error.value = ''; success.value = ''
    try { const next = await closetApi[mode](garment.value!.id); task.value = next; returnResult(); await router.replace({ path: route.path, query: { ...route.query, task: next.id } }); await load(); await closet.refreshCounts(); schedulePoll() }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '任务提交失败。' }
    finally { busy.value = '' }
  } })
}
function cancel() {
  const target = isProcessing(imageTask.value?.status) ? imageTask.value : task.value
  if (!target || busy.value) return
  modal.confirm({ title: '取消这次处理？', content: '原图和已完成步骤的图片会保留。取消请求提交后，需要等待服务端终止任务。', okText: '取消处理', cancelText: '继续等待', onOk: async () => {
    busy.value = 'cancel'
    try { await closetApi.cancel(target.id); await load(); schedulePoll() }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '取消失败。' }
    finally { busy.value = '' }
  } })
}
function remove() {
  if (!garment.value || busy.value) return
  modal.confirm({ title: '移入回收站？', content: processing.value ? '会先取消活动任务，等待终止后移入回收站。图片与历史保留，可以恢复。' : '图片与处理历史会保留，可以在回收站恢复。', okText: '移入回收站', cancelText: '取消', onOk: async () => {
    busy.value = 'trash'
    try { if (processing.value) { for (const id of [...new Set([garment.value!.taskId, imageTask.value?.id].filter((id): id is string => Boolean(id)))]) await closetApi.cancelAndWait(id) }; const record = await closetApi.detail(garment.value!.id); await closetApi.trash(record.id, record.revision)
      // Back to the list the garment was in (issue #13); the guard above lets the page go.
      trashed = true; busy.value = ''
      message.success({ content: `「${title.value || '这件衣物'}」已移入回收站，可在回收站恢复。`, duration: 4 })
      void closet.refreshCounts()
      await router.replace(record.status === 'ACTIVE' ? '/wardrobe' : '/pending') }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '操作失败。' }
    finally { busy.value = '' }
  } })
}
async function restore() { if (!garment.value) return; busy.value = 'restore'; try { garment.value = await closetApi.restore(garment.value.id, 'DRAFT', garment.value.revision); syncForm(garment.value); await closet.refreshCounts() } catch (cause) { error.value = String(cause) } finally { busy.value = '' } }
async function refresh() { await load(); schedulePoll() }
onMounted(async () => { alive = true; void loadSource(); await load(true); schedulePoll(); elapsedTimer = window.setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { alive = false; generation++; window.clearTimeout(timer); window.clearInterval(elapsedTimer) })
watch(() => route.params.id, async () => { trashed = false; generation++; window.clearTimeout(timer); panel.value = 'result'; completed.value = false; editorSnapshot = undefined; advanced.value = ''; void loadSource(); baseline.value = null; task.value = null; imageTask.value = null; parentTask.value = null; continuationKeys.clear(); garment.value = null; loading.value = true; await load(true); schedulePoll() })
watch(() => route.query.task, async () => { await load(); schedulePoll() })
</script>

<template>
  <a-modal v-model:open="recognitionOpen" title="重新识别衣物信息" ok-text="提交识别 · 1 次额度" cancel-text="取消" :confirm-loading="busy === 'retry'" @ok="submitRecognition">
    <p class="modal-intro">只更新自动识别资料，人工修改和展示图片会保留。</p>
    <a-form layout="vertical"><a-form-item label="这次识别哪件衣物（可选）"><a-textarea v-model:value="recognitionHint" :maxlength="200" show-count :rows="3" placeholder="例如：这是一件黑白拼接连衣裙；或只识别左侧外套。" /></a-form-item></a-form>
    <p class="quiet-copy">可以补充实物结构，帮助区分拼色、假两件和分开的衣物；看不清的标签信息仍会留空。</p>
  </a-modal>
  <a-modal v-model:open="enhanceOpen" title="独立增强图片" ok-text="开始增强" cancel-text="取消" :confirm-loading="busy === 'enhance'" @ok="enhanceQuick"><p>使用一次增强额度。原图、基础图和历史结果保留，成功后会采用新图；可在展示图片中回退。AI 生成可能包含推测细节。</p><a-textarea v-model:value="enhanceFeedback" :maxlength="1000" :rows="4" placeholder="可选：描述人物残留、边缘损坏、文字错误等问题" /></a-modal>
  <div class="detail-page garment-workspace">
    <div class="workspace-toolbar">
      <a-button type="text" @click="panel === 'result' ? leaveWorkspace() : returnResult(true)"><ArrowLeftOutlined /> {{ panel !== 'result' ? '返回处理结果' : source.batchId ? '返回本批次' : garment?.status === 'ACTIVE' ? '返回衣柜' : '所有未入柜衣物' }}</a-button>
      <a-tooltip title="处理记录"><a-button v-if="garment && panel !== 'history' && !completed" type="text" aria-label="查看处理记录" @click="openPanel('history')"><HistoryOutlined /></a-button></a-tooltip>
    </div>
    <a-skeleton v-if="loading" active :paragraph="{ rows: 8 }" />
    <a-alert v-else-if="!garment" type="error" :message="connectionError" show-icon><template #action><a-button @click="refresh">重试</a-button></template></a-alert>
    <template v-else>
      <header class="page-heading workspace-heading"><div><h1>{{ pageTitle }}</h1><p class="page-subtitle">{{ pageSubtitle }}</p></div><span class="state-badge" :class="garment.status === 'ACTIVE' ? 'active' : garment.status === 'TRASHED' ? '' : 'needs_review'">{{ garment.status === 'ACTIVE' ? '已入柜' : garment.status === 'TRASHED' ? '回收站' : '尚未入柜' }}</span></header>
      <a-alert v-if="connectionError" type="warning" :message="`连接中断：${connectionError}`" description="保留上次状态，正在重试。" show-icon><template #action><a-button @click="refresh">重新连接</a-button></template></a-alert>
      <a-alert v-if="error" type="error" :message="error" description="你的图片选择和表单输入仍保留。" show-icon><template #action><a-button @click="reconcile">核对最新版本</a-button></template></a-alert>
      <a-alert v-if="success && !completed" type="success" :message="success" show-icon />
      <section v-if="completed" class="workspace-complete">
        <CheckOutlined class="complete-icon" /><img :src="mediaUrl(garment.displayUrl || previewUrl)" alt="已入柜的衣物展示图" /><h2>{{ title }}</h2><a-alert v-if="garment.images.find(image => image.id === garment?.displayAssetId)?.aiGenerated" type="info" message="AI 生成，可能包含推测细节" show-icon /><p>{{ fieldValue('patterns') }} · {{ fieldValue('seasons') }}</p>
        <div><a-button type="primary" @click="router.push('/wardrobe')">查看衣柜</a-button><a-button @click="router.push('/add')">继续添加衣物</a-button><a-button type="text" @click="completed=false">查看衣物详情</a-button></div>
      </section>
      <template v-else>
        <div v-if="panel === 'metadata'" class="garment-layout editor-layout">
          <section class="garment-surface editor-preview"><h2>这次录入的衣物</h2><div class="garment-canvas"><img :src="mediaUrl(previewUrl)" alt="当前衣物展示图" /></div><h3>{{ title }}</h3><p>{{ selectedImage?.aiGenerated ? 'AI 生成，可能包含推测细节' : '当前展示图' }}</p><a-button @click="originalOpen=true"><PictureOutlined /> 查看上传原图</a-button></section>
          <section class="garment-surface metadata-editor">
            <div class="section-heading"><h2>衣物基本信息</h2><a-tag>按需修改</a-tag></div>
            <GarmentMetadataFields :schema="basicSchema" :values="values" :garment="garment" :reset-fields="resetFields" :disabled="processing && !quickIntakeId || Boolean(busy) || garment.status === 'TRASHED'" @edit="editField" @restore="restoreAutomatic" />
            <div class="section-heading section-divider"><h2>穿着建议</h2><a-popover title="根据实物核对" :trigger="['hover', 'click']"><template #content><p class="help-copy">照片不能保证实际版型、厚薄和叠穿用途。不确定可留空，资料不足不会自动推断为适合叠穿。</p></template><a-button type="text" aria-label="穿着建议说明"><InfoCircleOutlined /></a-button></a-popover></div>
            <GarmentMetadataFields :schema="layeringSchema" :values="values" :garment="garment" :reset-fields="resetFields" :disabled="processing && !quickIntakeId || Boolean(busy) || garment.status === 'TRASHED'" @edit="editField" @restore="restoreAutomatic" />
            <a-checkbox :checked="confirmLayering || layeringVerified" :disabled="processing && !quickIntakeId || Boolean(busy) || garment.status === 'TRASHED' || !layeringFields.every(key => values[key]?.length) || layeringVerified" @update:checked="confirmLayering=Boolean($event)">我已根据实物核对这些穿着建议</a-checkbox>
            <div class="advanced-actions section-divider"><a-button @click="advanced='appearance'"><SettingOutlined /> 更多外观资料</a-button><a-button @click="advanced='labels'">品牌、尺码与其他标签</a-button></div>
            <a-alert v-for="(issue,index) in garment.issues" :key="index" type="warning" :message="issue.message" show-icon />
          </section>
        </div>
        <div v-else-if="panel === 'images'" class="garment-layout image-layout">
          <section class="garment-surface"><div class="section-heading"><h2>图片对照</h2><a-tag :color="stickerPending ? 'warning' : 'success'">{{ stickerPending ? '尚未贴纸化' : '当前可用图片' }}</a-tag></div>
            <a-segmented v-if="results.length > 1" :value="latestResult?.id" :options="results.map(image => ({label:imageLabels[image.kind] || '处理图片',value:image.id}))" @update:value="viewedResultId=String($event)" class="image-stage-picker" />
            <div class="comparison-grid"><figure><figcaption>{{ imageLabels[latestResult?.kind || ''] || '处理结果' }}</figcaption><div class="garment-canvas"><img v-if="latestResult" :src="mediaUrl(latestResult.url)" alt="衣物处理结果" /><a-empty v-else description="本次没有生成图片" /></div></figure><figure><figcaption>上传原图</figcaption><div class="garment-canvas"><img :src="mediaUrl(garment.sourceUrl)" alt="上传原图" /></div></figure></div>
            <a-alert v-if="latestResult?.aiGenerated" type="info" message="AI 生成，可能包含推测细节" show-icon /><a-button @click="originalOpen=true"><EyeOutlined /> 放大对照</a-button>
          </section>
          <section class="garment-surface image-options"><h2>衣柜展示图</h2><a-radio-group v-model:value="selectedAssetId" :disabled="processing && !quickIntakeId || Boolean(busy) || garment.status === 'TRASHED'" class="display-options"><a-radio v-for="image in imageOptions" :key="image.id" :value="image.id"><img :src="mediaUrl(image.url)" :alt="imageLabels[image.kind] || '处理图片'" /><span>{{ imageLabels[image.kind] || '处理图片' }}<small v-if="image.aiGenerated">AI 生成，可能包含推测细节</small><small>{{ selectedAssetId === image.id ? '已选' : '选择这张图片' }}</small></span></a-radio></a-radio-group>
            <div class="section-divider"><h3>检查这些细节</h3><p>衣物轮廓完整；颜色、花纹与原图一致；背景没有明显杂物。</p><GarmentEdgeHelp /></div>
            <a-button v-if="forceAsset && !stickerPending" :disabled="processing || Boolean(busy) || usingMocks || blocked || Boolean(connectionError) || garment.status === 'TRASHED'" :loading="busy === 'continue'" @click="continueSticker('FORCE')"><ReloadOutlined /> 边缘不满意，重新去背景</a-button><small v-if="forceAsset && !stickerPending">本地处理，不使用 AI 额度</small>
            <a-collapse :bordered="false"><a-collapse-panel key="rework" header="重新处理"><div class="advanced-actions"><a-button :disabled="processing || dirty || usingMocks || garment.status === 'TRASHED'" @click="startRun('reprocess')">重新整理图片 · 1 次</a-button><a-button :disabled="processing || dirty || usingMocks || garment.status === 'TRASHED'" @click="startRun('recognize')">重新识别信息 · 1 次</a-button></div></a-collapse-panel></a-collapse>
          </section>
        </div>
        <div v-else-if="panel === 'history'" class="task-history"><section v-for="(run, index) in historyTasks" :key="run.id"><h2>{{ index === 0 ? '当前任务' : '较早处理记录' }}</h2><TaskProgress :task="run" :now="now" /></section><a-empty v-if="!historyTasks.length" description="本次没有处理任务" /></div>
        <div v-else class="garment-layout" :class="{'result-layout': !processing && !blocked && !stickerPending, 'processing-layout': processing || blocked || stickerPending}">
          <section class="garment-surface main-preview"><div class="section-heading"><h2>{{ processing || blocked ? '上传原图' : stickerPending ? '当前中间结果' : ['INPUT','ORIGINAL'].includes(selectedImage?.kind || '') ? '当前展示图' : '整理后的衣物' }}</h2><a-tooltip title="查看原图与当前展示图"><a-button type="text" aria-label="放大对照原图" @click="originalOpen=true"><PictureOutlined /></a-button></a-tooltip></div>
            <div class="garment-canvas"><img :src="mediaUrl(stickerPending && latestResult ? latestResult.url : previewUrl)" :alt="processing || blocked ? '上传原图' : '当前衣物展示图'" /></div>
            <a-alert v-if="garment.images.find(image => image.url === previewUrl)?.aiGenerated" type="info" message="AI 生成，可能包含推测细节" show-icon />
            <a-space v-if="quickIntakeId && garment.status !== 'TRASHED'" wrap><a-button :disabled="Boolean(busy)" @click="enhanceOpen = true">增强图片 / 描述问题重做</a-button><a-button @click="openPanel('metadata')">编辑资料</a-button></a-space>
            <div class="preview-caption"><h3>{{ title }}</h3><p>{{ fieldValue('patterns') }} · {{ fieldValue('seasons') }}</p></div>
            <a-alert v-if="source.completion" type="warning" show-icon message="包含推测补全，请对照来源照片检查。" />
            <a-button v-if="quickIntakeId || !processing && !blocked" block @click="openPanel('images')">调整展示图片</a-button>
            <p v-if="processing" class="quiet-copy">完成后会在这里展示结果。</p>
          </section>
          <section v-if="processing" class="garment-surface live-progress"><TaskProgress v-if="displayTask" :task="displayTask" :now="now" /><a-button @click="openPanel('history')"><HistoryOutlined /> 查看任务记录</a-button><a-button :disabled="busy !== '' || displayTask?.status === 'CANCEL_REQUESTED'" :loading="busy === 'cancel'" @click="cancel"><StopOutlined /> 取消本次处理</a-button><WaitingActivities /></section>
          <section v-else-if="blocked" class="garment-surface recovery-options"><a-alert type="warning" show-icon message="还不能确定要入柜哪一件" /><h3>照片里有多件衣物</h3><p>使用多件整理，分别处理每件衣物。</p><a-button @click="router.push({path:'/add',query:{mode:'multiple'}})">转到多件录入</a-button><div class="section-divider"><h3>只有一件，但模糊或被遮挡</h3><p>重新录入清楚、完整的照片。原草稿与资料会保留。</p><a-button type="primary" @click="router.push('/add')">更换照片</a-button></div><GarmentEdgeHelp /><a-button @click="openPanel('metadata')">编辑已填写的资料</a-button></section>
          <section v-else-if="stickerPending" class="garment-surface recovery-options"><h2>继续这件衣物</h2><div><h3>推荐：完成贴纸</h3><p>重新去背景与制作白边。本地处理，不使用 AI 额度。</p></div><a-alert v-if="transparency?.reasons.length" type="warning" show-icon :message="transparency.reasons.map(reason => checkReasons[reason] || '透明背景需要检查').join('；')" />
            <a-button type="primary" :disabled="!forceAsset || Boolean(busy) || usingMocks || blocked || Boolean(connectionError) || garment.status === 'TRASHED'" :loading="busy === 'continue'" @click="continueSticker('FORCE')">重新抠图并制作贴纸</a-button><a-button v-if="canApproveTransparency" :disabled="Boolean(busy) || usingMocks || blocked || Boolean(connectionError) || garment.status === 'TRASHED'" @click="approveTransparency">已核对透明图，继续制作</a-button>
            <div v-if="garment.status === 'DRAFT'" class="section-divider"><h3>稍后再做贴纸</h3><p>本次使用上传原图入柜，以后仍可继续制作。</p><a-button :disabled="Boolean(busy) || blocked || Boolean(connectionError) || !schema.length" @click="useOriginal">暂用上传原图入柜</a-button></div><a-button @click="openPanel('metadata')">编辑衣物资料</a-button><GarmentEdgeHelp />
          </section>
          <section v-else class="garment-surface garment-summary"><div class="section-heading"><h2>衣物资料</h2><a-button :disabled="garment.status === 'TRASHED'" @click="openPanel('metadata')"><EditOutlined /> 编辑资料</a-button></div><dl class="summary-fields"><div v-for="key in basicKeys" :key="key"><dt>{{ fieldLabels[key as keyof typeof fieldLabels] }}</dt><dd>{{ fieldValue(key) }}</dd></div></dl>
            <div class="section-heading section-divider"><h3>穿着建议</h3><a-popover :trigger="['hover','click']" title="可按实物修改"><template #content><p class="help-copy">照片建议尚未核实时，不能保证实际叠穿。点击编辑资料可核对或修改，也可保持未知。</p></template><a-button type="text" aria-label="穿着建议说明"><InfoCircleOutlined /></a-button></a-popover></div><dl class="summary-fields"><div v-for="key in layeringFields" :key="key"><dt>{{ key === 'fit' ? '版型' : key === 'thickness' ? '厚薄' : '用途' }}</dt><dd>{{ fieldValue(key) }}</dd></div></dl><p class="quiet-copy">{{ layeringVerified ? '穿着建议已根据实物核对。' : '照片建议尚未根据实物核对，之后仍可修改。' }}<a-button v-if="!layeringVerified && garment.status === 'ACTIVE'" type="link" size="small" @click="openPanel('metadata')">厚薄、版型、用途是推测，核对后推荐更准</a-button></p>
            <a-alert v-if="summary && ['warning','error'].includes(summary.tone)" :type="summary.tone === 'error' ? 'error' : 'warning'" :message="summary.title" show-icon><template #description><span>{{ summary.description }}</span><a-button type="link" :disabled="processing || dirty || garment.status === 'TRASHED'" @click="startRun('recognize')">补充说明并重新识别</a-button><a-button type="link" @click="openPanel('history')">查看当前任务</a-button></template></a-alert>
            <a-alert v-for="(issue,index) in garment.issues" :key="index" type="warning" :message="issue.message" show-icon />
            <a-popover :trigger="['hover','click']" title="资料可以之后补充"><template #content><p class="help-copy">品牌、尺码、成分等资料未知可以留空，不影响入柜。</p></template><a-button type="text" class="summary-help"><InfoCircleOutlined /> 还有资料未知？也可以入柜</a-button></a-popover>
          </section>
          <GarmentRecommendPanel v-if="garment.status === 'ACTIVE' && !processing" :garment-id="garment.id" />
          <SimilarGarmentsPanel v-if="['ACTIVE', 'DRAFT'].includes(garment.status) && !processing" :garment-id="garment.id" :draft="garment.status === 'DRAFT'" />
        </div>
        <footer class="workspace-actionbar">
          <div class="actionbar-status"><span>{{ dirty ? '有未保存修改' : processing ? '任务已提交，结果会自动保留' : garment.status === 'ACTIVE' ? '图片与资料已保存' : '处理结果已保留，尚未入柜' }}</span><a-popover title="图片和处理说明" :trigger="['hover','click']"><template #content><p class="help-copy">{{ summary?.description }} 原图与已完成图片始终保留。贴纸暂停时可继续本地处理；重新识别或整理图片需要 AI 额度。</p></template><a-button type="text" aria-label="查看当前处理说明"><InfoCircleOutlined /></a-button></a-popover></div>
          <div class="actionbar-buttons">
            <template v-if="panel === 'metadata' || panel === 'images'"><a-button :disabled="Boolean(busy)" @click="returnResult(true)">取消修改</a-button><a-button type="primary" :disabled="processing && !quickIntakeId || Boolean(busy) || Boolean(connectionError) || garment.status === 'TRASHED'" :loading="busy === 'save'" @click="saveAndReturn">{{ panel === 'images' ? '应用图片' : '保存并返回' }}</a-button></template>
            <template v-else-if="panel === 'history'"><a-button @click="returnResult()">返回处理结果</a-button></template>
            <template v-else><a-tooltip title="移入回收站"><a-button v-if="garment.status !== 'TRASHED'" type="text" danger aria-label="移入回收站" :disabled="Boolean(busy)" @click="remove"><DeleteOutlined /></a-button></a-tooltip><a-button v-if="dirty && garment.status !== 'TRASHED'" :disabled="processing || Boolean(busy)" :loading="busy === 'save'" @click="save(false)">保存草稿</a-button><a-button @click="router.push('/add')">继续添加</a-button><a-button v-if="garment.status === 'DRAFT'" type="primary" :disabled="!canConfirm || Boolean(busy)" :loading="busy === 'confirm'" @click="save(true)"><CheckOutlined /> {{ processing ? '处理中，请稍候' : blocked ? '先处理照片问题' : stickerPending ? '贴纸尚未完成' : '确认入柜' }}</a-button><a-button v-else-if="garment.status === 'ACTIVE'" type="primary" @click="router.push('/wardrobe')">返回衣柜</a-button><a-button v-else type="primary" :loading="busy === 'restore'" @click="restore">恢复衣物</a-button></template>
          </div>
        </footer>
      </template>
      <a-modal :open="Boolean(advanced)" :title="advanced === 'appearance' ? '更多外观资料' : '品牌、尺码与其他标签'" :footer="null" :width="720" @cancel="advanced=''">
        <p class="quiet-copy modal-intro">按需填写，未知可留空。修改随衣物资料一起保存。</p><GarmentMetadataFields :schema="advancedSchema" :values="values" :garment="garment" :reset-fields="resetFields" :disabled="processing && !quickIntakeId || Boolean(busy) || garment.status === 'TRASHED'" @edit="editField" @restore="restoreAutomatic" /><div class="modal-actions"><a-button type="primary" @click="advanced=''">返回资料编辑</a-button></div>
      </a-modal>
      <a-modal v-model:open="originalOpen" title="原图与当前展示图" :footer="null" :width="1000"><p v-if="mainTarget" class="quiet-copy modal-intro">识别目标：{{ mainTarget.description }}</p><div class="comparison-grid"><figure><figcaption>上传原图</figcaption><div class="garment-canvas"><img :src="mediaUrl(source.previewUrl || garment.sourceUrl)" alt="完整来源原图" /></div><a-button type="link" :href="mediaUrl(source.originalUrl || garment.sourceUrl)" target="_blank">查看原始大图</a-button></figure><figure><figcaption>当前选择的展示图</figcaption><div class="garment-canvas"><img :src="mediaUrl(selectedImage?.url || previewUrl)" alt="当前展示图" /></div><a-button type="link" :href="mediaUrl(selectedImage?.url || previewUrl)" target="_blank">查看展示大图</a-button></figure></div></a-modal>
    </template>
  </div>
</template>

<style scoped>
.garment-workspace{display:grid;gap:20px;max-width:1320px}.workspace-toolbar{margin:0}.workspace-heading{margin:0;align-items:center}.workspace-heading h1{font-size:26px;margin:0 0 8px}.page-subtitle{line-height:1.8}.garment-layout{display:grid;gap:24px;align-items:stretch;min-width:0}.result-layout,.editor-layout{grid-template-columns:minmax(280px,.85fr) minmax(0,1.55fr)}.processing-layout,.image-layout{grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr)}.garment-surface{padding:24px;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);min-width:0;display:flex;flex-direction:column;gap:20px}.garment-surface h2{font-size:17px;margin:0}.garment-surface h3{font-size:15px;margin:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px}.section-heading h2,.section-heading h3{margin:0}.section-divider{border-top:1px solid var(--line);padding-top:24px}.garment-canvas{background:var(--surface-alt);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;min-width:0;height:360px;overflow:hidden}.garment-canvas img{width:100%;height:100%;object-fit:contain;padding:20px}.main-preview .garment-canvas{height:clamp(220px,calc(100dvh - 560px),360px)}.preview-caption h3,.editor-preview h3{font-size:20px;line-height:1.5}.preview-caption p,.editor-preview>p,.quiet-copy,.garment-surface p,.garment-surface small{font-size:13px;color:var(--muted-copy);line-height:1.8;margin:0}.main-preview>.ant-btn:last-child{margin-top:auto}.summary-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin:0}.summary-fields>div{display:flex;gap:12px;min-width:0;align-items:baseline}.summary-fields dt{font-size:13px;color:var(--muted-copy);flex:none}.summary-fields dd{font-size:14px;margin:0;overflow-wrap:anywhere}.summary-help{margin-top:auto;align-self:flex-start;white-space:normal;height:auto!important;text-align:left;line-height:1.8}.metadata-editor{gap:24px}.advanced-actions{display:flex;gap:12px;flex-wrap:wrap}.advanced-actions>.ant-btn{flex:1}.comparison-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;min-width:0}.comparison-grid figure{margin:0;min-width:0;display:grid;gap:12px}.comparison-grid figcaption{font-size:13px;color:var(--muted-copy)}.image-stage-picker{max-width:100%;overflow-x:auto}.display-options{display:grid;gap:12px}.display-options :deep(.ant-radio-wrapper){margin:0;padding:16px;border:1px solid var(--line);border-radius:var(--radius-sm);align-items:center;min-height:88px}.display-options :deep(.ant-radio-wrapper-checked){border-color:var(--ink);background:var(--selection-bg)}.display-options :deep(.ant-radio-wrapper>span:last-child){display:flex;gap:12px;align-items:center;min-width:0;flex:1}.display-options img{width:56px;height:56px;object-fit:contain;background:var(--surface-alt);border-radius:var(--radius-sm);flex:none}.display-options small{display:block;margin-top:4px}.image-options .section-divider{display:grid;gap:12px}.recovery-options .section-divider{display:grid;gap:12px}.live-progress :deep(.progress-panel){padding:0;border:0;border-radius:0}.live-progress>.ant-btn:first-of-type{margin-top:auto}.task-history{display:grid;gap:24px}.workspace-actionbar{position:sticky;bottom:16px;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 20px;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);box-shadow:0 4px 20px #00000008}.actionbar-status{display:flex;align-items:center;gap:4px;min-width:0;font-size:12px;color:var(--muted-copy)}.actionbar-buttons{display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.actionbar-buttons>.ant-btn-primary{min-width:180px}.garment-workspace :deep(.ant-btn){min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px}.garment-workspace :deep(.ant-tag){margin:0}.help-copy{max-width:320px;font-size:14px;line-height:1.8}.workspace-complete{display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center;max-width:680px;width:100%;justify-self:center;padding:32px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg)}.workspace-complete>img{width:280px;max-width:100%;height:280px;object-fit:contain;background:var(--surface-alt);border-radius:var(--radius-md)}.complete-icon{color:var(--success);font-size:26px}.workspace-complete>div{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.workspace-complete p{color:var(--muted-copy);font-size:13px}.modal-intro{margin-bottom:24px}.modal-actions{display:flex;justify-content:flex-end;margin-top:24px}
@media(min-width:1024px){.workspace-actionbar{padding-right:72px}}
@media(max-width:1000px){.processing-layout,.image-layout{grid-template-columns:minmax(0,1.2fr) minmax(280px,1fr)}.comparison-grid{gap:12px}.comparison-grid .garment-canvas{height:280px}.garment-surface{padding:20px}.actionbar-status>span{max-width:220px}.actionbar-buttons>.ant-btn-primary{min-width:140px}}
@media(max-width:1023px){.workspace-actionbar{bottom:calc(84px + env(safe-area-inset-bottom))}}
@media(max-width:767px){.garment-workspace{gap:16px}.workspace-heading{align-items:flex-start;gap:10px}.workspace-heading h1{font-size:22px}.garment-layout{grid-template-columns:1fr;gap:16px}.garment-surface{padding:18px;gap:18px}.main-preview .garment-canvas,.editor-preview .garment-canvas{height:240px}.editor-preview{gap:12px}.editor-preview{display:grid;grid-template-columns:88px minmax(0,1fr);align-items:center}.editor-preview>h2{grid-column:1/-1}.editor-preview .garment-canvas{height:100px;grid-column:1;grid-row:2/4}.editor-preview .garment-canvas img{padding:8px}.editor-preview>h3{grid-column:2;grid-row:2;font-size:18px}.editor-preview>p{grid-column:2;grid-row:3}.editor-preview>.ant-btn{grid-column:1/-1}.section-divider{padding-top:18px}.summary-fields{gap:16px}.summary-fields>div{flex-direction:column;gap:4px}.preview-caption h3{font-size:18px}.comparison-grid .garment-canvas{height:230px}.comparison-grid .garment-canvas img{padding:10px}.workspace-actionbar{bottom:calc(84px + env(safe-area-inset-bottom));flex-direction:column;align-items:stretch;padding:12px;gap:8px}.actionbar-status{justify-content:space-between}.actionbar-status>span{max-width:none}.actionbar-buttons{display:flex;flex-wrap:wrap;gap:8px}.actionbar-buttons>.ant-btn:not(.ant-btn-text){flex:1;min-width:0}.actionbar-buttons>.ant-btn-primary{min-width:140px}.advanced-actions{flex-direction:column}.workspace-complete{padding:24px 18px}.workspace-complete>div{width:100%}.workspace-complete>div>.ant-btn{flex:1}.section-heading{gap:8px}.section-heading h2{font-size:16px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style>
