<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftOutlined, CheckOutlined, DeleteOutlined, ReloadOutlined, RollbackOutlined, SaveOutlined, PictureOutlined, LoadingOutlined, PlusOutlined, StopOutlined, EyeOutlined, ArrowRightOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { App as AntApp } from 'ant-design-vue'
import { closetApi, fieldLabels, usingMocks, type Garment, type ClosetTask } from '../services/api'
import { metadataChoices, matchesMetadataOption, metadataPatch, rebaseMetadata, type MetadataField } from '../domain/metadata'
import { isProcessing, blocksConfirmation, workflowSummary, generatedImages, imageLabels } from '../domain/workflow'
import { useClosetStore } from '../stores/closet'
import TaskProgress from '../components/TaskProgress.vue'
import { batchApi } from '../services/batches'
import { playSound } from '../services/sound'

const source = ref<{batchId?: string; originalUrl?: string; previewUrl?: string; completion?: boolean}>({})
const { modal } = AntApp.useApp()
const route = useRoute(); const router = useRouter(); const closet = useClosetStore()
const garment = ref<Garment | null>(null); const task = ref<ClosetTask | null>(null)
const imageTask = ref<ClosetTask | null>(null); const parentTask = ref<ClosetTask | null>(null)
const continuationKeys = new Map<string, string>()
const values = reactive<Record<string, string[]>>({}); const baseline = ref<Garment | null>(null)
const loading = ref(true); const busy = ref(''); const error = ref(''); const connectionError = ref(''); const success = ref('')
const viewedResultId = ref(''); const selectedAssetId = ref(''); const resetFields = ref<string[]>([]); const imageTab = ref('处理结果'); const now = ref(Date.now())
const schema = ref<MetadataField[]>([])
const layeringFields = ['fit', 'thickness', 'wearingModes']
const confirmLayering = ref(false)
const fields = Object.keys(fieldLabels) as (keyof typeof fieldLabels)[]
const dirty = computed(() => Boolean(baseline.value && (confirmLayering.value || resetFields.value.length || selectedAssetId.value !== baseline.value.displayAssetId || fields.some(key => JSON.stringify(values[key] || []) !== JSON.stringify(baseline.value?.[key] || [])))))
const title = computed(() => garment.value?.category[0] ? `${garment.value.primaryColor[0] || ''}${garment.value.category[0]}` : '新上传衣物')
const processing = computed(() => isProcessing(task.value?.status) || isProcessing(garment.value?.taskStatus) || isProcessing(imageTask.value?.status))
const summary = computed(() => garment.value ? workflowSummary(garment.value, processing.value ? (isProcessing(task.value?.status) ? task.value : imageTask.value) : imageTask.value || task.value) : null)
const results = computed(() => generatedImages(imageTask.value || task.value))
const imageOptions = computed(() => {
  const record = garment.value
  if (!record) return []
  const original = record.images.find(image => image.url === record.sourceUrl)
  const current = record.images.find(image => image.id === record.displayAssetId)
  const choices = [original, ...results.value, current].filter((image): image is Garment['images'][number] => Boolean(image))
  return choices.filter((image, index) => choices.findIndex(other => other.id === image.id) === index)
})
const selectedImage = computed(() => imageOptions.value.find(image => image.id === selectedAssetId.value))
const latestResult = computed(() => results.value.find(image => image.id === viewedResultId.value) || results.value[results.value.length - 1])
const resultUrl = computed(() => imageTab.value === '上传原图' ? garment.value?.sourceUrl : latestResult.value?.url)
const resultCaption = computed(() => imageTab.value === '上传原图' ? '上传原图' : imageLabels[latestResult.value?.kind || ''] || '本次处理结果')
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
function editField(key: string, next: string[]) { values[key] = next; resetFields.value = resetFields.value.filter(field => field !== key) }
function restoreAutomatic(key: string) { if (layeringFields.includes(key)) confirmLayering.value = false; if (!resetFields.value.includes(key)) resetFields.value.push(key); values[key] = [...(garment.value?.automatic[key] || [])] }
async function save(confirming = false, originalFallback = false) {
  if (!garment.value || !baseline.value || !schema.value.length || busy.value || processing.value) return
  busy.value = confirming ? 'confirm' : 'save'; error.value = ''; success.value = ''
  try {
    let record = confirming
      ? await closetApi.confirm(garment.value.id, { revision: baseline.value.revision, assetId: originalFallback ? garment.value.images.find(image => image.url === garment.value?.sourceUrl)?.id : selectedAssetId.value, allowIncompleteSticker: originalFallback, fields: patchFromForm(), resetFields: [...resetFields.value] })
      : await closetApi.update(garment.value.id, { revision: baseline.value.revision, fields: patchFromForm(), resetFields: [...resetFields.value] })
    if (!confirming && selectedAssetId.value !== record.displayAssetId) record = await closetApi.chooseDisplay(record.id, selectedAssetId.value, record.revision)
    garment.value = record; syncForm(record); success.value = confirming ? originalFallback ? '已暂用原图入柜，贴纸仍未完成，可稍后继续制作。' : '已确认入柜，图片和信息已保存。' : '修改已保存。'
    playSound('success')
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
  const key = continuationKeys.get(identity) || crypto.randomUUID(); continuationKeys.set(identity, key)
  try {
    const next = await closetApi.continueSticker(run.id, asset.id, policy, key)
    imageTask.value = next; task.value = next; viewedResultId.value = ''; imageTab.value = '处理结果'
    continuationKeys.delete(identity)
    await router.replace({ path: route.path, query: { task: next.id } }); await load(); schedulePoll()
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
    baseline.value = structuredClone(toRaw(garment.value)); error.value = ''; success.value = '输入已保留，请核对服务端当前值后保存。'
  } })
}
async function startRun(mode: 'recognize' | 'reprocess') {
  if (!garment.value || busy.value || processing.value || usingMocks) return
  if (dirty.value) { error.value = '请先保存当前修改，再提交新的处理任务。'; return }
  modal.confirm({ title: mode === 'recognize' ? '重新识别衣物信息？' : '重新整理图片？', content: '会调用真实模型并使用 1 次 AI 任务额度。已有人工修改和图片会保留。', okText: '提交真实任务', cancelText: '取消', onOk: async () => {
    busy.value = 'retry'; error.value = ''; success.value = ''
    try { const next = await closetApi[mode](garment.value!.id); task.value = next; imageTab.value = '处理结果'; await router.replace({ path: route.path, query: { task: next.id } }); await load(); await closet.refreshCounts(); schedulePoll() }
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
    try { if (processing.value) { for (const id of [...new Set([garment.value!.taskId, imageTask.value?.id].filter((id): id is string => Boolean(id)))]) await closetApi.cancelAndWait(id) }; const record = await closetApi.detail(garment.value!.id); await closetApi.trash(record.id, record.revision); await closet.refreshCounts(); await router.replace('/pending') }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '操作失败。' }
    finally { busy.value = '' }
  } })
}
async function restore() { if (!garment.value) return; busy.value = 'restore'; try { garment.value = await closetApi.restore(garment.value.id, 'DRAFT', garment.value.revision); syncForm(garment.value); await closet.refreshCounts() } catch (cause) { error.value = String(cause) } finally { busy.value = '' } }
async function refresh() { await load(); schedulePoll() }
onMounted(async () => { alive = true; void batchApi.provenance(String(route.params.id)).then(value => { source.value=value }).catch(() => {}); await load(true); schedulePoll(); elapsedTimer = window.setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { alive = false; generation++; window.clearTimeout(timer); window.clearInterval(elapsedTimer) })
watch(() => route.params.id, async () => { generation++; window.clearTimeout(timer); baseline.value = null; task.value = null; imageTask.value = null; parentTask.value = null; continuationKeys.clear(); garment.value = null; loading.value = true; await load(true); schedulePoll() })
watch(() => route.query.task, async () => { await load(); schedulePoll() })
</script>

<template>
  <div class="detail-page">
    <div class="workspace-toolbar"><a-button type="text" @click="router.push(garment?.status === 'ACTIVE' ? '/wardrobe' : '/pending')"><ArrowLeftOutlined /> {{ garment?.status === 'ACTIVE' ? '返回衣柜' : '所有未入柜衣物' }}</a-button><a-button @click="router.push('/add')"><PlusOutlined /> 继续添加</a-button></div>
    <a-skeleton v-if="loading" active :paragraph="{ rows: 8 }" />
    <a-alert v-else-if="!garment" type="error" :message="connectionError" show-icon><template #action><a-button @click="refresh">重试</a-button></template></a-alert>
    <template v-else>
      <header class="page-heading workspace-heading"><div><h1>{{ garment.status === 'ACTIVE' ? title : '衣物处理工作台' }}</h1><p class="page-subtitle">{{ title }}<span v-if="task"> · {{ task.mode }}</span></p></div><span class="state-badge" :class="garment.status.toLowerCase()">{{ garment.status === 'ACTIVE' ? '已入柜' : garment.status === 'TRASHED' ? '回收站' : '尚未入柜' }}</span></header>
      <div v-if="garment.status === 'DRAFT'" class="flow-rail"><span class="done"><CheckOutlined /> 照片已保存</span><ArrowRightOutlined /><span :class="{ current: processing || stickerPending, done: !processing && !stickerPending }"><b>2</b> 处理与结果</span><ArrowRightOutlined /><span :class="{ current: !processing && !stickerPending }"><b>3</b> 核对入柜</span></div>
      <div v-if="summary" class="workflow-status" :class="summary.tone" role="status" aria-live="polite"><LoadingOutlined v-if="processing" spin /><CheckOutlined v-else-if="garment.status === 'ACTIVE' && !stickerPending" /><ExclamationCircleOutlined v-else /><div><strong>{{ summary.title }}</strong><p>{{ summary.description }}</p></div><a-button v-if="processing" :disabled="busy !== '' || task?.status === 'CANCEL_REQUESTED'" :loading="busy === 'cancel'" @click="cancel"><StopOutlined /> 取消处理</a-button><a-button v-else-if="garment.status === 'DRAFT' && !blocked && !stickerPending" type="primary" href="#review-fields">核对并入柜 <ArrowRightOutlined /></a-button></div>
      <a-alert v-if="connectionError" type="warning" :message="`连接中断：${connectionError}。当前保留上次状态，正在重试。`" show-icon class="page-alert"><template #action><a-button @click="refresh">重新连接</a-button></template></a-alert>
      <a-alert v-if="error" type="error" :message="error" description="你的图片选择和表单输入仍保留。" show-icon class="page-alert"><template #action><a-button @click="reconcile">核对最新版本</a-button></template></a-alert>
      <a-alert v-if="success" type="success" :message="success" show-icon class="page-alert" />
      <div class="workspace-grid">
        <section class="result-panel">
          <a-alert v-if="source.completion" type="warning" show-icon message="这件衣物包含推测补全，请对照来源照片核对。" /><div v-if="source.batchId" class="batch-actions"><a-button :href="source.originalUrl" target="_blank">查看完整来源原图</a-button><a-button @click="router.push(`/batches/${source.batchId}`)">返回本批次，单件重做</a-button></div><div class="panel-heading"><h2>图片结果</h2><a-segmented v-model:value="imageTab" :options="['处理结果', '上传原图']" /></div>
          <div v-if="imageTab === '处理结果' && results.length > 1" class="result-choices"><a-button v-for="image in results" :key="image.id" :type="latestResult?.id === image.id ? 'primary' : 'text'" @click="viewedResultId = image.id">{{ imageLabels[image.kind] || '处理图片' }}</a-button></div><div class="result-canvas" :class="{ checkerboard: imageTab === '处理结果' && resultUrl }">
            <img v-if="resultUrl" :src="resultUrl" :alt="resultCaption" />
            <div v-else class="result-placeholder"><LoadingOutlined v-if="processing" spin /><PictureOutlined v-else /><h3>{{ processing ? task?.mode === '本地贴纸' ? '正在本地处理图片' : '结果图片尚未返回' : task?.mode === '仅识别' ? '本次只识别信息' : '本次没有可用结果图' }}</h3><p>{{ processing ? task?.mode === '本地贴纸' ? '正在本地抠图与制作贴纸，结果会在完成后显示。' : '请查看右侧处理进度，模型返回后会显示在这里。' : task?.mode === '仅识别' ? '此模式不会生成新图片，请查看上传原图及下方识别信息。' : '原图已保留，你可以重新处理，或使用原图入柜。' }}</p><a-button v-if="!processing" @click="imageTab = '上传原图'">查看上传原图</a-button></div>
            <span v-if="resultUrl" class="canvas-caption">{{ resultCaption }}</span>
          </div>
          <div v-if="garment.imageProcessing?.stickerReady && garment.imageProcessing.stickerAssetId !== selectedAssetId" class="result-choices"><a-button type="primary" :disabled="processing || Boolean(busy)" @click="selectedAssetId = garment.imageProcessing!.stickerAssetId!">选用贴纸展示图</a-button><span class="muted">{{ garment.status === 'ACTIVE' ? '选择后点击下方保存修改。' : '选择后核对信息并确认入柜。' }}</span></div>
          <a-alert v-if="mainTarget" type="info" :message="`本次识别的是：${mainTarget.description}`" :description="mainTarget.worn ? '穿着照只整理这件衣物。被遮挡的细节可能无法还原，请对照原图核对后入柜。' : '信息与图片整理都以这件衣物为目标，请核对颜色、图案和细节。'" show-icon class="target-note" />
          <div v-if="!stickerPending && !processing && forceAsset && garment.status !== 'TRASHED'" class="recut-completed"><span>背景还在，或衣物边缘不满意？</span><a-button :disabled="Boolean(busy) || usingMocks || blocked || Boolean(connectionError)" :loading="busy === 'continue'" @click="continueSticker('FORCE')">重新去背景</a-button><small>从抠图前的图片处理，不使用 AI 额度。</small></div>
          <div class="result-bottom"><span>{{ imageTab === '处理结果' && resultUrl ? task?.mode === '本地贴纸' ? '本地图片处理结果，请检查衣物边缘和透明背景。' : '请对照原图检查款式、颜色与细节。' : '上传原图始终保留，不会被处理结果覆盖。' }}</span><a-button v-if="resultUrl" type="text" :href="resultUrl" target="_blank"><EyeOutlined /> 查看大图</a-button></div>
          <section v-if="stickerPending && !processing && garment.status !== 'TRASHED'" class="sticker-recovery" aria-label="继续制作贴纸">
            <h3>还差一步：制作贴纸</h3><p>上方是中间结果，尚未贴纸化。透明检查是本地检测，耗时不代表 AI 生图时间。</p>
            <ul v-if="transparency?.reasons.length"><li v-for="reason in transparency.reasons" :key="reason">{{ checkReasons[reason] || '透明背景需要人工检查' }}</li></ul>
            <div class="recovery-actions"><a-button type="primary" :disabled="!recoveryAsset || Boolean(busy) || usingMocks || blocked" :loading="busy === 'continue'" @click="continueSticker('FORCE')">重新抠图并制作贴纸</a-button><a-button v-if="canApproveTransparency" :disabled="Boolean(busy) || usingMocks || blocked" @click="approveTransparency">已核对透明图，继续制作</a-button></div>
            <small>仅做本地处理，不重新生图、不使用 AI 额度。{{ dirty ? '当前修改会先暂存。' : '' }}</small>
            <a-button v-if="garment.status === 'DRAFT'" type="link" :disabled="Boolean(busy) || blocked || Boolean(connectionError) || !schema.length" @click="useOriginal">暂用原图入柜，稍后制作</a-button>
          </section>
        </section>
        <aside class="workspace-side"><TaskProgress v-if="imageTask || task" :task="(imageTask || task)!" :now="now" /><TaskProgress v-if="task && imageTask && task.id !== imageTask.id" :task="task" :now="now" /><details v-if="parentTask" class="previous-progress"><summary>此前处理记录 · 原任务与图片已保留</summary><TaskProgress :task="parentTask" :now="now" /></details><section class="original-panel"><div class="panel-heading"><h2>上传原图</h2><span>已保存</span></div><button class="original-photo" aria-label="查看上传原图" @click="imageTab = '上传原图'"><img :src="garment.sourceUrl" alt="已保存的上传原图" /></button></section></aside>
      </div>
      <section id="review-fields" class="review-panel">
        <div class="panel-heading"><div><h2>{{ garment.status === 'ACTIVE' ? '图片与衣物信息' : '核对并入柜' }}</h2><p>{{ processing ? '处理结束或取消后，即可选择展示图并编辑信息。' : '选择衣柜里的展示图片，检查识别信息。未知字段可以留空。' }}</p></div><span v-if="dirty" class="unsaved-indicator">有未保存修改</span></div>
        <div class="review-grid">
          <div class="display-picker"><h3>1. 选择展示图</h3><div class="candidate-grid"><button v-for="image in imageOptions" :key="image.id" class="candidate-option" :class="{ selected: image.id === selectedAssetId }" :disabled="processing || garment.status === 'TRASHED'" :aria-pressed="image.id === selectedAssetId" @click="selectedAssetId = image.id"><img :src="image.url" :alt="imageLabels[image.kind] || '处理图片'" /><span>{{ imageLabels[image.kind] || '处理图片' }}</span><CheckOutlined v-if="image.id === selectedAssetId" /></button></div><p v-if="selectedImage" class="muted">将使用：{{ imageLabels[selectedImage.kind] || '所选图片' }}</p><div class="detail-process-actions"><a-button :disabled="processing || dirty || usingMocks || garment.status === 'TRASHED'" :loading="busy === 'retry'" @click="startRun('reprocess')"><ReloadOutlined /> 重新整理图片</a-button><a-button :disabled="processing || dirty || usingMocks || garment.status === 'TRASHED'" @click="startRun('recognize')">重新识别信息</a-button></div></div>
          <div class="metadata-panel"><h3>2. 核对衣物信息</h3><a-alert type="info" show-icon message="版型、厚薄、穿着用途是照片建议，不能保证实际叠穿。可根据实物核对；未知可留空，无需每次搭配重新识别。" class="form-alert" /><a-button :disabled="processing || garment.status === 'TRASHED' || !layeringFields.every(key => values[key]?.length)" @click="confirmLayering = true">{{ confirmLayering ? '已核对，请保存修改' : '我已根据实物核对三项穿着资料' }}</a-button><p v-if="!Object.keys(garment.automatic).length" class="muted">{{ processing ? task?.mode === '本地贴纸' ? '本次只做本地图片处理，结束后可手动填写信息。' : '识别结果尚未返回，暂不填入任何自动值。' : '没有识别结果，可根据原图手动填写。' }}</p><a-alert v-for="(issue, index) in garment.issues" :key="index" type="warning" :message="issue.message" show-icon class="form-alert" /><div class="metadata-grid">
            <div v-for="field in schema" :key="field.key" class="metadata-field">
              <div class="metadata-label"><label :for="`field-${field.key}`">{{ field.label }}</label><button v-if="Object.hasOwn(garment.overrides, field.key) || resetFields.includes(field.key)" :disabled="processing" type="button" class="restore-field" @click="restoreAutomatic(field.key)"><RollbackOutlined /> 恢复自动值</button></div>
              <a-select v-if="field.multiple" :id="`field-${field.key}`" :aria-label="field.label" :value="values[field.key] || []" mode="tags" :options="metadataChoices(field, values[field.key] || [])" :disabled="processing || garment.status === 'TRASHED'" allow-clear show-search placeholder="选择或输入新值" @update:value="editField(field.key, Array.isArray($event) ? $event.map(String) : [])" />
              <a-auto-complete v-else-if="field.options.length" :id="`field-${field.key}`" :aria-label="field.label" :value="values[field.key]?.[0] || ''" :options="metadataChoices(field, values[field.key] || [])" :filter-option="matchesMetadataOption" :disabled="processing || garment.status === 'TRASHED'" allow-clear @update:value="editField(field.key, $event ? [String($event)] : [])"><a-input :maxlength="400" placeholder="选择或填写新值，未知可留空" /></a-auto-complete>
              <a-input v-else :id="`field-${field.key}`" :aria-label="field.label" :value="values[field.key]?.[0] || ''" :disabled="processing || garment.status === 'TRASHED'" :maxlength="400" placeholder="未知，可留空" @update:value="editField(field.key, $event ? [$event] : [])" />
              <small v-if="layeringFields.includes(field.key)" class="field-latest">{{ garment.overrides[field.key]?.length ? '来源：用户核对' : garment.automatic[field.key]?.length ? '来源：自动建议，尚未核对' : '尚缺资料，可根据实物填写' }}<br />{{ garment.metadataEvidence?.[field.key]?.evidence }}</small><small v-if="field.multiple" class="field-latest">输入后按回车添加，未知可留空。</small>
              <small v-if="error || success.includes('核对')" class="field-latest">服务端当前值：{{ garment[field.key as keyof typeof fieldLabels]?.join('、') || '未知' }}</small>
            </div>
          </div></div>
        </div>
        <div class="review-actions"><a-button danger type="text" :disabled="Boolean(busy)" @click="remove"><DeleteOutlined /> 移入回收站</a-button><div><a-button v-if="garment.status !== 'TRASHED'" :disabled="processing || !dirty || Boolean(busy)" :loading="busy === 'save'" @click="save(false)"><SaveOutlined /> {{ garment.status === 'DRAFT' ? '暂存修改' : '保存修改' }}</a-button><a-button v-if="garment.status === 'DRAFT'" type="primary" :disabled="!canConfirm || Boolean(busy)" :loading="busy === 'confirm'" @click="save(true)"><CheckOutlined /> 确认入柜</a-button><a-button v-if="garment.status === 'ACTIVE'" type="primary" @click="router.push('/wardrobe')">返回衣柜 <ArrowRightOutlined /></a-button><a-button v-if="garment.status === 'TRASHED'" type="primary" :loading="busy === 'restore'" @click="restore"><RollbackOutlined /> 恢复衣物</a-button></div></div>
        <p v-if="blocked" class="blocked-hint">这张照片不满足单件衣物要求，请重新上传。</p>
      </section>
      <p class="workspace-footer">贴纸完成后，选择展示图并核对信息，再确认入柜。“仅识别”保留原图；贴纸未完成时，也可明确选择暂用原图入柜。</p>
    </template>
  </div>
</template>
