<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftOutlined, PictureOutlined, CameraOutlined, RotateRightOutlined, ArrowRightOutlined, InfoCircleOutlined } from '@ant-design/icons-vue'
import CameraCapture from '../components/CameraCapture.vue'
import BatchIntake from '../components/BatchIntake.vue'
import GarmentEdgeHelp from '../components/GarmentEdgeHelp.vue'
const intake = ref(useRoute().query.mode === 'multiple')
import { hasCamera } from '../services/camera'
import { closetApi, usingMocks, type ClosetTask, type ProcessingChoice } from '../services/api'

const router = useRouter()
const file = ref<File>()
const preview = ref('')
const mode = ref<Exclude<ClosetTask['mode'], '图片整理'>>('识别并整理')
const busy = ref(false)
const error = ref('')
const configError = ref('')
const quotaLeft = ref<number | null>(null)
const quotaLimit = ref<number | null>(null)
const quotaError = ref('')
const cameraAvailable = ref(false)
const cameraOpen = ref(false)
const mobileCamera = ref(false)
const fileInput = ref<HTMLInputElement>()
const rearInput = ref<HTMLInputElement>()
const selfieInput = ref<HTMLInputElement>()
const reuseTransparency = ref(false)
let alive = true
let cameraEpoch = 0
const restage = ref(true)
const precut = ref(false)
const postcut = ref(true)
const rotationDegrees = ref(0)
const generationChoices = ref<ProcessingChoice[]>([])
const recognitionChoices = ref<ProcessingChoice[]>([])
const generationChoice = ref('')
const recognitionChoice = ref('')
const isAI = computed(() => mode.value !== '本地贴纸')
const configured = computed(() => !isAI.value || (recognitionChoices.value.length > 0 && (mode.value === '仅识别' || generationChoices.value.length > 0)))
const modes = [
  { value: '识别并整理', title: '识别并整理', body: '填写信息，整理照片并制作透明贴纸。', suitable: '适合自拍、穿着照或需要整理外观的单件。', cost: '1 次 AI 任务额度 · 需要等待模型' },
  { value: '仅识别', title: '仅识别信息', body: '自动填写信息，保留原照片。', suitable: '照片已拍得满意，无需改变外观。', cost: '1 次 AI 任务额度 · 不生成新图片' },
  { value: '本地贴纸', title: '本地去背景', body: '保留照片里的外观，衣物信息自己填写。', suitable: '适合平铺或悬挂；穿着照可能保留人物。', cost: '0 次 AI 额度 · 不发送云端' },
]
const selectedMode = computed(() => modes.find(option => option.value === mode.value)!)

async function detectCamera() {
  const attempt = ++cameraEpoch
  const available = await hasCamera(navigator.mediaDevices)
  if (alive && attempt === cameraEpoch) cameraAvailable.value = available
}
function chooseCamera({ key }: { key: string | number }) { (key === 'selfie' ? selfieInput.value : rearInput.value)?.click() }
onMounted(async () => {
  mobileCamera.value = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  void detectCamera()
  navigator.mediaDevices?.addEventListener('devicechange', detectCamera)
  const [quota, choices] = await Promise.allSettled([closetApi.quota(), closetApi.processingChoices()])
  if (!alive) return
  if (quota.status === 'fulfilled') { quotaLeft.value = Math.max(0, quota.value.limit - quota.value.used); quotaLimit.value = quota.value.limit }
  else quotaError.value = '暂时无法读取今日额度，请稍后重试。本地去背景仍可使用。'
  if (choices.status === 'fulfilled') {
    generationChoices.value = choices.value.generation; recognitionChoices.value = choices.value.recognition
    generationChoice.value = choices.value.generation[0]?.value || ''; recognitionChoice.value = choices.value.recognition[0]?.value || ''
  } else configError.value = choices.reason instanceof Error ? choices.reason.message : '暂时无法读取模型配置。本地去背景仍可使用。'
})
function setFile(candidate?: File) {
  if (!candidate || busy.value) return
  error.value = ''
  const extension = candidate.name.split('.').pop()?.toLowerCase()
  if (!['image/jpeg', 'image/png'].includes(candidate.type) && !(candidate.type === '' && ['jpg', 'jpeg', 'png'].includes(extension || ''))) { error.value = '请选择 JPEG 或 PNG 图片，HEIC 请先转换为 JPEG。'; return }
  if (candidate.size > 50 * 1024 * 1024) { error.value = '图片不能超过 50 MB。'; return }
  if (preview.value) URL.revokeObjectURL(preview.value)
  file.value = candidate; rotationDegrees.value = 0; preview.value = URL.createObjectURL(candidate)
}
// Hidden inputs are triggered synchronously by Ant Design buttons or menu actions.
function handleFileChange(event: Event) { const input = event.currentTarget as HTMLInputElement; setFile(input.files?.[0]); input.value = '' }
function drop(event: DragEvent) { event.preventDefault(); if (!busy.value) setFile(event.dataTransfer?.files[0]) }
onBeforeUnmount(() => { alive = false; cameraEpoch++; navigator.mediaDevices?.removeEventListener('devicechange', detectCamera); if (preview.value) URL.revokeObjectURL(preview.value) })
async function submit() {
  if (!file.value || busy.value || usingMocks || !configured.value || isAI.value && (Boolean(configError.value || quotaError.value) || quotaLeft.value === null || quotaLeft.value === 0)) return
  busy.value = true; error.value = ''
  try {
    const generation = JSON.parse(generationChoice.value || '{}') as { provider?: string; model?: string }
    const recognition = JSON.parse(recognitionChoice.value || '{}') as { provider?: string; model?: string }
    const task = await closetApi.create(file.value, mode.value, { restage: restage.value, precut: precut.value, postcut: postcut.value, rotationDegrees: rotationDegrees.value, transparencyPolicy: reuseTransparency.value ? 'AUTO' : 'FORCE',
      generationProvider: generation.provider, generationModel: generation.model, recognitionProvider: recognition.provider, recognitionModel: recognition.model })
    await router.replace({ path: `/garment/${task.garmentId}`, query: { task: task.id } })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '提交失败，照片仍保留在此处。' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="add-page redesigned-intake">
    <input ref="fileInput" class="hidden-file-input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" tabindex="-1" :disabled="busy" @change="handleFileChange" />
    <input ref="rearInput" class="hidden-file-input" type="file" accept="image/jpeg,image/png" capture="environment" tabindex="-1" :disabled="busy" @change="handleFileChange" />
    <input ref="selfieInput" class="hidden-file-input" type="file" accept="image/jpeg,image/png" capture="user" tabindex="-1" :disabled="busy" @change="handleFileChange" />
    <CameraCapture v-if="cameraOpen" @close="cameraOpen = false" @capture="setFile" />
    <a-button type="text" class="back-link" @click="router.push('/wardrobe')"><ArrowLeftOutlined /> 返回衣柜</a-button>
    <header class="page-heading"><div><h1>添加衣物</h1><p class="page-subtitle">{{ intake ? '多张单件照、多件同框或自拍，分开整理后逐件核对。' : '一件衣物，用单件工具更直接；多件照片，再选择批量整理。' }}</p></div></header>
    <a-radio-group v-model:value="intake" :disabled="busy" class="intake-switch" aria-label="录入方式">
      <a-radio-button :value="false"><strong>单件处理</strong><small>一张照片、一件衣物 · 按需处理</small></a-radio-button>
      <a-radio-button :value="true"><strong>多件整理</strong><small>多张照片或多件同框 · 分别整理</small></a-radio-button>
    </a-radio-group>
    <KeepAlive><BatchIntake v-if="intake" embedded /></KeepAlive>
    <template v-if="!intake">
    <div class="add-layout">
      <section class="upload-panel" @dragover.prevent @drop="drop">
        <div class="panel-heading"><h2>衣物照片</h2><span>每次一张 · 一件衣物</span></div>
        <div v-if="!file" class="drop-zone">
          <div class="upload-icon"><PictureOutlined /></div><h2>选一张想收进衣柜的照片</h2><p>平铺、悬挂或自拍都可以，让想录入的衣物完整入镜</p>
          <div class="upload-actions">
            <a-button type="primary" size="large" @click="fileInput?.click()"><PictureOutlined /> 选择照片</a-button>
            <a-dropdown v-if="cameraAvailable && mobileCamera" :trigger="['click']"><a-button size="large"><CameraOutlined /> 拍一张照片</a-button><template #overlay><a-menu @click="chooseCamera"><a-menu-item key="rear">拍衣物（后置摄像头）</a-menu-item><a-menu-item key="selfie">自拍（前置摄像头）</a-menu-item></a-menu></template></a-dropdown>
            <a-button v-else-if="cameraAvailable" size="large" @click="cameraOpen = true"><CameraOutlined /> 拍一张照片</a-button>
          </div><span class="upload-limits">也可将照片拖到这里 · JPEG / PNG · 最大 50 MB</span>
        </div>
        <div v-else class="upload-preview"><img :src="preview" alt="上传原图预览" :style="{ transform: `rotate(${rotationDegrees}deg)` }" /><div class="preview-toolbar"><a-button :disabled="busy" @click="fileInput?.click()"><PictureOutlined /> 更换照片</a-button><a-button :disabled="busy" @click="rotationDegrees = (rotationDegrees + 90) % 360"><RotateRightOutlined /> 旋转</a-button></div><div class="preview-file"><PictureOutlined /><span>{{ file.name }}</span><small>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</small></div></div>
        <p class="single-supported">T恤、衬衫、外套、裤裙、鞋帽包及配饰均可录入。</p>
      </section>
      <section class="process-panel">
        <div class="panel-heading"><h2>处理方式</h2><a-popover :trigger="['hover','click']" title="怎么选择处理方式"><template #content><div class="mode-help"><p v-for="option in modes" :key="option.value"><strong>{{option.title}}</strong><br />{{option.suitable}}<br />{{option.cost}}</p></div></template><a-button type="text" aria-label="了解单件处理方式"><InfoCircleOutlined /></a-button></a-popover></div>
        <a-radio-group v-model:value="mode" :disabled="busy" class="single-mode-list" aria-label="单件处理方式">
          <a-radio v-for="option in modes" :key="option.value" :value="option.value" class="single-mode-card" :class="{ selected: mode === option.value }">
            <span class="mode-copy"><strong>{{ option.title }}</strong><small>{{ option.body }}</small></span>
          </a-radio>
        </a-radio-group>
      </section>
    </div>
    <section class="single-submit-section">
        <a-collapse class="add-advanced" ghost><a-collapse-panel key="options" header="按自己的习惯调整" :disabled="busy">
          <p class="advanced-intro">默认已经替你选好，想调整时再打开就好。</p>
          <div class="advanced-choices">
            <label v-if="isAI && recognitionChoices.length" class="choice-line"><span>识图模型<small>负责填写衣物信息</small></span><a-select v-model:value="recognitionChoice" :options="recognitionChoices" :disabled="busy" class="choice-select" aria-label="识图模型" /></label>
            <template v-if="mode === '识别并整理'">
              <label v-if="generationChoices.length" class="choice-line"><span>图片模型<small>负责整理衣物照片</small></span><a-select v-model:value="generationChoice" :options="generationChoices" :disabled="busy" class="choice-select" aria-label="图片模型" /></label>
              <label class="choice-line"><span>摆正并适度整理<small>减轻随机褶皱，保留衣物原款</small></span><a-switch v-model:checked="restage" :disabled="busy" aria-label="摆正并适度整理" /></label>
              <label class="choice-line"><span>先去掉原背景<small>适合复杂背景的单件照片；穿着照会自动跳过</small></span><a-switch v-model:checked="precut" :disabled="busy" aria-label="先去掉原背景" /></label>
              <label class="choice-line"><span>制作透明贴纸<small>方便之后放进穿搭画板</small></span><a-switch v-model:checked="postcut" :disabled="busy" aria-label="制作透明贴纸" /></label>
            </template>
            <label v-if="mode === '本地贴纸'" class="choice-line"><span>背景已经透明，直接制作贴纸<small>仅适用于已经去干净背景的衣物图；截图的透明圆角不算</small></span><a-switch v-model:checked="reuseTransparency" :disabled="busy" aria-label="背景已经透明，直接制作贴纸" /></label>
          </div>
        </a-collapse-panel></a-collapse>
        <a-alert v-if="usingMocks" type="warning" message="演示模式禁止提交 AI 任务。请连接真实后端使用。" show-icon class="form-alert" />
        <a-alert v-if="isAI && (configError || quotaError || !configured)" type="warning" :message="configError || quotaError || '当前模式需要的模型未配置。你可以先使用本地去背景，或联系管理员。'" show-icon class="form-alert" />
        <a-alert v-if="error" type="error" :message="error" show-icon class="form-alert" />
        <div class="single-submit-row"><div class="cost-note"><p>当前：{{ selectedMode.title }} · {{ isAI ? '1 次 AI 任务额度' : '0 次 AI 额度' }}<small v-if="isAI">今日剩余 {{ quotaLeft === null ? '—' : quotaLeft }} / {{ quotaLimit ?? '—' }} 次</small></p></div>
        <a-button type="primary" block :loading="busy" :disabled="!file || usingMocks || !configured || isAI && (Boolean(configError || quotaError) || quotaLeft === null || quotaLeft === 0)" class="submit-garment" @click="submit">{{ busy ? '正在上传并提交…' : isAI && quotaLeft === 0 ? '今日 AI 额度已用完' : !file ? '选择照片后开始处理' : mode === '仅识别' ? '开始识别衣物信息' : mode === '本地贴纸' ? '开始本地去背景' : '识别并整理' }}<ArrowRightOutlined v-if="!busy" /></a-button>
        </div>
        <p class="privacy-note">{{ isAI ? '照片将发送到已配置的模型服务。处理时长由模型决定，结果返回后请检查衣物细节。' : '照片由你的衣柜服务本地处理，不发送到云端模型。衣物信息可以稍后慢慢填写。' }}</p>
    </section>
    </template>
    <GarmentEdgeHelp />
  </div>
</template>

<style scoped>
.redesigned-intake .intake-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px;margin-bottom:24px;background:var(--surface-alt);border-radius:12px}.intake-switch :deep(.ant-radio-button-wrapper){height:auto;min-height:88px;display:flex;align-items:center;padding:14px 20px;border:1px solid transparent!important;border-radius:8px!important;color:var(--muted);background:transparent;box-shadow:none!important;white-space:normal}.intake-switch :deep(.ant-radio-button-wrapper:before){display:none}.intake-switch :deep(.ant-radio-button-wrapper-checked){background:var(--surface);border-color:var(--line)!important;color:var(--ink)}.intake-switch strong{display:block;font-size:18px;line-height:28px}.intake-switch small{display:block;margin-top:6px;font-size:13px;line-height:20px;font-weight:400;color:var(--muted)}.redesigned-intake .add-layout{grid-template-columns:minmax(0,1.4fr) minmax(360px,1fr)}.redesigned-intake .upload-panel,.redesigned-intake .process-panel{border-radius:12px}.redesigned-intake .upload-panel>.panel-heading{border:0;align-items:flex-start;flex-direction:column;gap:8px;padding:24px 24px 0}.redesigned-intake .drop-zone{min-height:350px;padding:32px 24px}.redesigned-intake .upload-icon{background:transparent;border-radius:0;margin-bottom:22px;font-size:42px;height:52px;width:52px}.redesigned-intake .drop-zone h2{font-size:20px}.redesigned-intake .upload-actions .ant-btn{min-width:150px;display:inline-flex;align-items:center;justify-content:center;gap:8px}.redesigned-intake :deep(.ant-btn-primary){background:var(--blue);border-color:var(--blue);color:var(--surface)}.redesigned-intake :deep(.ant-btn-primary:disabled){color:var(--muted-subtle);background:var(--surface-alt);border-color:var(--line)}.single-supported{padding:12px 24px 24px;color:var(--muted);font-size:13px;line-height:1.7}.single-mode-list{display:grid;gap:12px;margin-top:20px;width:100%}.single-mode-card{display:flex;align-items:flex-start;gap:10px;width:100%;margin:0;padding:12px 16px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}.single-mode-card.selected{background:var(--selection-bg);border-color:var(--blue)}.single-mode-card :deep(.ant-radio){top:4px;align-self:flex-start}.single-mode-card :deep(.ant-radio+span){padding:0;min-width:0;flex:1}.single-mode-card :deep(.ant-radio-checked .ant-radio-inner){border-color:var(--blue);background:var(--blue)}.single-mode-card .mode-copy{gap:2px}.single-mode-card strong{font-size:16px;line-height:24px;font-weight:600;color:var(--ink)}.single-mode-card.selected strong{color:var(--link)}.single-mode-card small{font-size:12px;line-height:20px}.single-mode-card small:first-of-type{font-size:13px;margin-top:0}.single-mode-card small:last-of-type{margin-top:4px}.single-mode-card .local-cost{color:var(--success)}.single-submit-section{margin-top:16px}.single-submit-section :deep(.ant-collapse-header){padding-left:0!important}.single-submit-row{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:18px}.single-submit-row .cost-note{background:none;padding:0;margin:0}.single-submit-row .cost-note p{font-weight:600;color:var(--ink)}.single-submit-row .cost-note small{font-weight:400}.single-submit-row .submit-garment{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:auto;min-width:264px;height:44px}.single-submit-section .privacy-note{margin-top:10px}.single-submit-section .form-alert{margin:12px 0}.redesigned-intake .upload-preview{min-height:370px}.redesigned-intake .upload-preview>img{height:320px}.redesigned-intake .preview-toolbar{position:static;padding:12px 20px;justify-content:flex-start;box-shadow:none}.redesigned-intake .preview-file{padding:0 24px 12px}
@media(max-width:767px){.redesigned-intake .add-layout{grid-template-columns:1fr;gap:20px}.redesigned-intake .process-panel{padding:20px}.intake-switch :deep(.ant-radio-button-wrapper){justify-content:center;text-align:center;min-height:44px;padding:8px 12px}.intake-switch strong{font-size:14px;line-height:22px}.intake-switch small{display:none}.redesigned-intake .intake-switch{gap:4px;padding:4px}.redesigned-intake .drop-zone{min-height:220px;padding:24px 20px}.redesigned-intake .upload-panel>.panel-heading{padding:20px 20px 0}.redesigned-intake .drop-zone h2{font-size:18px}.redesigned-intake .upload-actions{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.redesigned-intake .upload-actions .ant-btn{min-width:0;padding:0 10px;font-size:13px}.single-mode-card{padding:14px 16px}.single-supported{padding:0 20px 20px;font-size:12px}.single-submit-row{align-items:stretch;flex-direction:column;gap:16px}.single-submit-row .submit-garment{width:100%;min-width:0}.redesigned-intake .upload-preview>img{height:280px}}
</style>
<style scoped>
.redesigned-intake .upload-preview{height:auto;min-height:0;padding-top:16px}.redesigned-intake .upload-preview>img{padding:16px 24px;height:320px;min-height:0}.redesigned-intake .preview-file{position:static;margin:0 20px 16px;padding:0;border:0;background:none}.redesigned-intake .preview-toolbar{padding:12px 20px}.redesigned-intake .upload-panel>.panel-heading span{font-size:13px;color:var(--muted)}
@media(max-width:767px){.redesigned-intake .upload-preview{height:auto;min-height:0}.redesigned-intake .upload-preview>img{height:280px;min-height:0}}
</style>

<style scoped>
.mode-help{max-width:320px;line-height:1.8;font-size:13px}.mode-help p+p{margin-top:16px}.single-mode-card{min-height:88px;align-items:center}.single-mode-card :deep(.ant-radio){top:0;align-self:center}.redesigned-intake .process-panel>.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.redesigned-intake .process-panel>.panel-heading :deep(.ant-btn){min-height:44px}.single-mode-card .mode-copy{gap:4px}
</style>
