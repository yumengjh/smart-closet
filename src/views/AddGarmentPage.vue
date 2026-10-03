<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeftOutlined, PictureOutlined, CameraOutlined, RotateRightOutlined, ScanOutlined, BgColorsOutlined, FileImageOutlined, ArrowRightOutlined, InfoCircleOutlined, CheckOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import CameraCapture from '../components/CameraCapture.vue'
import BatchIntake from '../components/BatchIntake.vue'
const intake = ref(true)
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
  { value: '识别并整理', title: '帮我识别并整理', body: '自动填写信息，整理图片并制作透明贴纸', suitable: '自拍、镜子照或单件衣物都可以', detail: '会自动选择主视的一件衣物，去掉人物和背景。完成后请对照原图检查颜色、印花和衣物细节。', tag: '推荐', icon: BgColorsOutlined },
  { value: '仅识别', title: '只帮我填写信息', body: '识别颜色、款式等信息，保留你拍的照片', suitable: '适合已经拍得满意的照片', detail: '只填写有照片依据的信息，不整理图片，也不去背景。品牌、尺码等需要照片中清晰可读的衣标。', tag: '', icon: ScanOutlined },
  { value: '本地贴纸', title: '本地去背景，自己填写', body: '去掉照片背景，衣物信息由你填写', suitable: '适合平铺或悬挂的单件衣物', detail: '由衣柜服务本地处理，不发送到云端模型，不使用 AI 额度。穿着照可能连人物一起保留，自拍建议使用识别并整理。', tag: '不使用 AI 额度', icon: FileImageOutlined },
]
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
  <div class="add-page">
    <input ref="fileInput" class="hidden-file-input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" tabindex="-1" :disabled="busy" @change="handleFileChange" />
    <input ref="rearInput" class="hidden-file-input" type="file" accept="image/jpeg,image/png" capture="environment" tabindex="-1" :disabled="busy" @change="handleFileChange" />
    <input ref="selfieInput" class="hidden-file-input" type="file" accept="image/jpeg,image/png" capture="user" tabindex="-1" :disabled="busy" @change="handleFileChange" />
    <CameraCapture v-if="cameraOpen" @close="cameraOpen = false" @capture="setFile" />
    <a-button type="text" class="back-link" @click="router.push('/wardrobe')"><ArrowLeftOutlined /> 返回衣柜</a-button>
    <header class="page-heading"><div><h1>添加衣物</h1><p class="page-subtitle">选好照片，我们来整理。单件、多件同框和自拍都可以。</p></div><span class="context-label">{{ usingMocks ? '界面演示 · 无 AI 调用' : '真实模型处理' }}</span></header>
    <a-button v-if="!intake" type="link" @click="intake = true">返回照片录入</a-button>
    <BatchIntake v-if="intake" />
    <a-button v-if="intake" type="link" class="local-tools-link" @click="intake = false">已有单件图？使用仅识别或本地去背景工具</a-button>
    <template v-else>
    <div class="flow-rail" aria-label="添加衣物流程"><span class="current"><b>1</b> 上传照片</span><ArrowRightOutlined /><span><b>2</b> 查看处理与结果</span><ArrowRightOutlined /><span><b>3</b> 核对入柜</span></div>
    <div class="add-layout">
      <section class="upload-panel" @dragover.prevent @drop="drop">
        <div class="panel-heading"><h2>衣物照片</h2><span>每次一张 · 一件衣物</span></div>
        <div v-if="!file" class="drop-zone">
          <div class="upload-icon"><PictureOutlined /></div><h2>从一张照片开始</h2><p>平铺、悬挂或自拍都可以，让想录入的衣物完整入镜</p>
          <div class="upload-actions">
            <a-button type="primary" size="large" @click="fileInput?.click()"><PictureOutlined /> 从相册选择</a-button>
            <a-dropdown v-if="cameraAvailable && mobileCamera" :trigger="['click']"><a-button size="large"><CameraOutlined /> 拍一张照片</a-button><template #overlay><a-menu @click="chooseCamera"><a-menu-item key="rear">拍衣物（后置摄像头）</a-menu-item><a-menu-item key="selfie">自拍（前置摄像头）</a-menu-item></a-menu></template></a-dropdown>
            <a-button v-else-if="cameraAvailable" size="large" @click="cameraOpen = true"><CameraOutlined /> 拍一张照片</a-button>
          </div><span class="upload-limits">也可将照片拖到这里 · JPEG / PNG · 最大 50 MB</span>
        </div>
        <div v-else class="upload-preview"><img :src="preview" alt="上传原图预览" :style="{ transform: `rotate(${rotationDegrees}deg)` }" /><div class="preview-toolbar"><a-button :disabled="busy" @click="fileInput?.click()"><PictureOutlined /> 更换照片</a-button><a-button :disabled="busy" @click="rotationDegrees = (rotationDegrees + 90) % 360"><RotateRightOutlined /> 旋转</a-button></div><div class="preview-file"><PictureOutlined /><span>{{ file.name }}</span><small>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</small></div></div>
        <div class="photo-guidance"><span>拍得清楚就很好，不必像商品图一样完美。</span><a-popover trigger="click" placement="top"><template #content><div class="photo-tips"><p>光线均匀，衣物轮廓尽量完整，四周留一点空隙。</p><p>自拍不用露脸，让想录入的那件更突出；多件同样突出时会请你补拍。</p><p>被手、手机或外套挡住的细节可能无法还原，完成后记得核对。</p><p>本地去背景更适合单件平铺或悬挂，选择与衣物不同颜色的背景。</p></div></template><a-button type="link"><QuestionCircleOutlined /> 怎么拍更清楚</a-button></a-popover></div>
        <div class="upload-footnote"><InfoCircleOutlined /><span>提交后照片会保存到你的衣柜服务。可以先去做别的，回来再核对。</span></div>
      </section>
      <section class="process-panel">
        <div class="panel-heading"><h2>处理方式</h2></div>
        <div class="mode-list" role="radiogroup" aria-label="处理方式">
          <div v-for="option in modes" :key="option.value" class="mode-entry">
            <a-button class="mode-option" :class="{ selected: mode === option.value }" role="radio" :aria-checked="mode === option.value" :disabled="busy" @click="mode = option.value as Exclude<ClosetTask['mode'], '图片整理'>"><component :is="option.icon" /><span class="mode-copy"><strong>{{ option.title }} <a-tag v-if="option.tag">{{ option.tag }}</a-tag></strong><small>{{ option.body }}</small><small class="mode-suitable">{{ option.suitable }}</small></span><CheckOutlined v-if="mode === option.value" class="mode-check" /></a-button>
            <a-popover trigger="click" placement="top"><template #content><p class="mode-detail">{{ option.detail }}</p></template><a-button type="link" size="small" :aria-label="`${option.title}的说明`"><InfoCircleOutlined /> 了解这个方式</a-button></a-popover>
          </div>
        </div>
        <a-alert v-if="mode === '本地贴纸'" type="info" message="自拍可能连人物一起保留。平铺或挂起单件衣物，本地去背景会更容易。" show-icon class="form-alert" />
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
        <div class="cost-note"><InfoCircleOutlined /><p>{{ isAI ? '本次使用 1 次 AI 任务额度' : '不调用云端 AI，不使用 AI 额度' }}<small v-if="isAI">今日剩余 {{ quotaLeft === null ? '—' : quotaLeft }} / {{ quotaLimit ?? '—' }} 次</small></p></div>
        <a-alert v-if="usingMocks" type="warning" message="演示模式禁止提交 AI 任务。请连接真实后端使用。" show-icon class="form-alert" />
        <a-alert v-if="isAI && (configError || quotaError || !configured)" type="warning" :message="configError || quotaError || '当前模式需要的模型未配置。你可以先使用本地去背景，或联系管理员。'" show-icon class="form-alert" />
        <a-alert v-if="error" type="error" :message="error" show-icon class="form-alert" />
        <a-button type="primary" block :loading="busy" :disabled="!file || usingMocks || !configured || isAI && (Boolean(configError || quotaError) || quotaLeft === null || quotaLeft === 0)" class="submit-garment" @click="submit">{{ busy ? '正在上传并提交…' : isAI && quotaLeft === 0 ? '今日 AI 额度已用完' : '开始处理这件衣物' }}<ArrowRightOutlined v-if="!busy" /></a-button>
        <p class="privacy-note">{{ isAI ? '照片将发送到已配置的模型服务。处理时长由模型决定，结果返回后请检查衣物细节。' : '照片由你的衣柜服务本地处理，不发送到云端模型。衣物信息可以稍后慢慢填写。' }}</p>
      </section>
    </div>
    </template>
  </div>
</template>
