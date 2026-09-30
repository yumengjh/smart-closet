<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeftOutlined, PictureOutlined, CameraOutlined, RotateRightOutlined, ScanOutlined, BgColorsOutlined, FileImageOutlined, ArrowRightOutlined, InfoCircleOutlined, CheckOutlined } from '@ant-design/icons-vue'
import { closetApi, usingMocks, type ClosetTask, type ProcessingChoice } from '../services/api'

const router = useRouter()
const file = ref<File>()
const preview = ref('')
const mode = ref<Exclude<ClosetTask['mode'], '图片整理'>>('识别并整理')
const busy = ref(false)
const error = ref('')
const configError = ref('')
const quotaLeft = ref<number | null>(null)
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
  { value: '识别并整理', title: '识别 + 图片整理', body: 'AI 识别信息、整理照片，再制作透明贴纸', icon: BgColorsOutlined },
  { value: '仅识别', title: '只识别衣物信息', body: '调用识图模型，展示图片保留上传原图', icon: ScanOutlined },
  { value: '本地贴纸', title: '本地制作贴纸', body: '服务端本地处理图片，衣物信息手动填写', icon: FileImageOutlined },
]
onMounted(async () => {
  try {
    const [quota, choices] = await Promise.all([closetApi.quota(), closetApi.processingChoices()])
    quotaLeft.value = Math.max(0, quota.limit - quota.used)
    generationChoices.value = choices.generation; recognitionChoices.value = choices.recognition
    generationChoice.value = choices.generation[0]?.value || ''; recognitionChoice.value = choices.recognition[0]?.value || ''
  } catch (cause) { configError.value = cause instanceof Error ? cause.message : '无法读取模型配置，请检查后端连接。' }
})
function setFile(candidate?: File) {
  if (!candidate) return
  error.value = ''
  const extension = candidate.name.split('.').pop()?.toLowerCase()
  if (!['image/jpeg', 'image/png'].includes(candidate.type) && !(candidate.type === '' && ['jpg', 'jpeg', 'png'].includes(extension || ''))) { error.value = '请选择 JPEG 或 PNG 图片，HEIC 请先转换为 JPEG。'; return }
  if (candidate.size > 15 * 1024 * 1024) { error.value = '图片不能超过 15 MB。'; return }
  if (preview.value) URL.revokeObjectURL(preview.value)
  file.value = candidate; rotationDegrees.value = 0; preview.value = URL.createObjectURL(candidate)
}
// Native input receives the user's click directly, including in embedded browsers.
function handleFileChange(event: Event) { const input = event.currentTarget as HTMLInputElement; setFile(input.files?.[0]); input.value = '' }
function drop(event: DragEvent) { event.preventDefault(); if (!busy.value) setFile(event.dataTransfer?.files[0]) }
onBeforeUnmount(() => { if (preview.value) URL.revokeObjectURL(preview.value) })
async function submit() {
  if (!file.value || busy.value || usingMocks) return
  busy.value = true; error.value = ''
  try {
    const generation = JSON.parse(generationChoice.value || '{}') as { provider?: string; model?: string }
    const recognition = JSON.parse(recognitionChoice.value || '{}') as { provider?: string; model?: string }
    const task = await closetApi.create(file.value, mode.value, { restage: restage.value, precut: precut.value, postcut: postcut.value, rotationDegrees: rotationDegrees.value,
      generationProvider: generation.provider, generationModel: generation.model, recognitionProvider: recognition.provider, recognitionModel: recognition.model })
    await router.replace({ path: `/garment/${task.garmentId}`, query: { task: task.id } })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '提交失败，照片仍保留在此处。' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="add-page">
    <a-button type="text" class="back-link" @click="router.push('/wardrobe')"><ArrowLeftOutlined /> 返回衣柜</a-button>
    <header class="page-heading"><div><h1>添加衣物</h1><p class="page-subtitle">上传一件衣物，处理后核对图片和信息，再确认入柜。</p></div><span class="context-label">{{ usingMocks ? '界面演示 · 无 AI 调用' : '真实模型处理' }}</span></header>
    <div class="flow-rail" aria-label="添加衣物流程"><span class="current"><b>1</b> 上传照片</span><ArrowRightOutlined /><span><b>2</b> 查看处理与结果</span><ArrowRightOutlined /><span><b>3</b> 核对入柜</span></div>
    <div class="add-layout">
      <section class="upload-panel" @dragover.prevent @drop="drop">
        <div class="panel-heading"><h2>衣物照片</h2><span>每次一张 · 一件衣物</span></div>
        <div v-if="!file" class="drop-zone">
          <div class="upload-icon"><PictureOutlined /></div><h2>从一张照片开始</h2><p>平铺或悬挂单件衣物，保持光线清楚、轮廓完整</p>
          <div class="upload-actions">
            <label class="native-file-button primary"><PictureOutlined /> 从相册选择<input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" aria-label="从相册选择" @change="handleFileChange" /></label>
            <label class="native-file-button"><CameraOutlined /> 拍照<input type="file" accept="image/jpeg,image/png" capture="environment" aria-label="拍摄衣物照片" @change="handleFileChange" /></label>
          </div><span class="upload-limits">也可将照片拖到这里 · JPEG / PNG · 最大 15 MB</span>
        </div>
        <div v-else class="upload-preview"><img :src="preview" alt="上传原图预览" :style="{ transform: `rotate(${rotationDegrees}deg)` }" /><div class="preview-toolbar"><label class="native-file-button"><PictureOutlined /> 更换照片<input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" aria-label="更换照片" :disabled="busy" @change="handleFileChange" /></label><a-button :disabled="busy" @click="rotationDegrees = (rotationDegrees + 90) % 360"><RotateRightOutlined /> 旋转</a-button></div><div class="preview-file"><PictureOutlined /><span>{{ file.name }}</span><small>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</small></div></div>
        <div class="upload-footnote"><InfoCircleOutlined /><span>提交后原图会保存在服务端，可以离开页面或继续上传。</span></div>
      </section>
      <section class="process-panel">
        <div class="panel-heading"><h2>处理方式</h2></div>
        <div class="mode-list" role="radiogroup" aria-label="处理方式">
          <button v-for="option in modes" :key="option.value" class="mode-option" :class="{ selected: mode === option.value }" role="radio" :aria-checked="mode === option.value" :disabled="busy" @click="mode = option.value as Exclude<ClosetTask['mode'], '图片整理'>"><component :is="option.icon" /><span class="mode-copy"><strong>{{ option.title }}</strong><small>{{ option.body }}</small></span><CheckOutlined v-if="mode === option.value" class="mode-check" /></button>
        </div>
        <div v-if="isAI && recognitionChoice" class="model-summary"><span>识图模型</span><strong>{{ JSON.parse(recognitionChoice).model }}</strong><template v-if="mode === '识别并整理' && generationChoice"><span>图片模型</span><strong>{{ JSON.parse(generationChoice).model }}</strong></template></div>
        <details v-if="isAI" class="advanced-box"><summary>模型与高级选项</summary><div class="advanced-choices"><label v-if="recognitionChoices.length" class="choice-line"><span>识图模型</span><a-select v-model:value="recognitionChoice" :options="recognitionChoices" class="choice-select" aria-label="识图模型" /></label><template v-if="mode === '识别并整理'"><label v-if="generationChoices.length" class="choice-line"><span>图片模型</span><a-select v-model:value="generationChoice" :options="generationChoices" class="choice-select" aria-label="图片模型" /></label><label class="choice-line"><span>摆正并整理衣物</span><a-switch v-model:checked="restage" /></label><label class="choice-line"><span>先抠除原背景</span><a-switch v-model:checked="precut" /></label><label class="choice-line"><span>生成透明贴纸</span><a-switch v-model:checked="postcut" /></label></template></div></details>
        <div class="cost-note"><InfoCircleOutlined /><p>{{ isAI ? '本次使用 1 次 AI 任务额度' : '不调用云端 AI，不使用 AI 额度' }}<small>今日剩余 {{ quotaLeft === null ? '—' : quotaLeft }} / 20 次</small></p></div>
        <a-alert v-if="usingMocks" type="warning" message="演示模式禁止提交 AI 任务。请连接真实后端使用。" show-icon class="form-alert" />
        <a-alert v-if="configError || !configured && !configError" type="warning" :message="configError || '当前模式需要的模型未配置，请联系管理员。'" show-icon class="form-alert" />
        <a-alert v-if="error" type="error" :message="error" show-icon class="form-alert" />
        <a-button type="primary" block :loading="busy" :disabled="!file || usingMocks || !configured || Boolean(configError) || isAI && quotaLeft === 0" class="submit-garment" @click="submit">{{ busy ? '正在上传并提交…' : isAI && quotaLeft === 0 ? '今日 AI 额度已用完' : '提交并查看处理进度' }}<ArrowRightOutlined v-if="!busy" /></a-button>
        <p class="privacy-note">{{ isAI ? '照片将发送到已配置的模型服务。处理时长由模型决定，结果返回后请检查衣物细节。' : '图片由你的衣柜服务在本机处理，衣物信息需要手动填写。' }}</p>
      </section>
    </div>
  </div>
</template>
