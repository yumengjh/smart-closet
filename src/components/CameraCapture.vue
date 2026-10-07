<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { CameraOutlined, SwapOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { cameraError } from '../services/camera'

const props = defineProps<{ continuous?: boolean; disabled?: boolean; count?: number }>()
const flash = ref(false)
const capturing = ref(false)
const emit = defineEmits<{ close: []; capture: [file: File, specify?: boolean] }>()
const video = ref<HTMLVideoElement>()
const facing = ref<'environment' | 'user'>('environment')
const loading = ref(false)
const ready = ref(false)
const error = ref('')
let stream: MediaStream | undefined
let epoch = 0
let closed = false
function release() { stream?.getTracks().forEach(track => track.stop()); stream = undefined; ready.value = false }
function close() { closed = true; epoch++; release(); emit('close') }
async function start() {
  const attempt = ++epoch
  release(); loading.value = true; error.value = ''
  try {
    const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing.value } }, audio: false })
    if (closed || attempt !== epoch) { next.getTracks().forEach(track => track.stop()); return }
    stream = next
    await nextTick()
    if (!video.value || closed || attempt !== epoch) { release(); return }
    video.value.srcObject = next
    await video.value.play()
  } catch (cause) { if (!closed && attempt === epoch) { release(); error.value = cameraError(cause) } }
  finally { if (!closed && attempt === epoch) loading.value = false }
}
function switchCamera() { facing.value = facing.value === 'environment' ? 'user' : 'environment'; void start() }
function takePhoto(specify = false) {
  const source = video.value
  if (!source || !ready.value || !source.videoWidth || closed || capturing.value || props.disabled) return
  capturing.value = true
  flash.value = false; requestAnimationFrame(() => { flash.value = true; window.setTimeout(() => { flash.value = false }, 380) })
  const canvas = document.createElement('canvas')
  canvas.width = source.videoWidth; canvas.height = source.videoHeight
  canvas.getContext('2d')!.drawImage(source, 0, 0)
  const attempt = epoch
  canvas.toBlob(blob => {
    capturing.value = false
    if (closed || attempt !== epoch) return
    if (!blob) { error.value = '照片暂时没有保存好，请再拍一次。'; return }
    emit('capture', new File([blob], `衣物照片-${Date.now()}.jpg`, { type: 'image/jpeg' }), specify)
    if (!props.continuous) close()
  }, 'image/jpeg', .92)
}
onMounted(start)
onBeforeUnmount(() => { closed = true; epoch++; release() })
</script>

<template>
  <a-modal :open="true" :title="continuous ? '连续拍摄衣物' : '拍一张衣物照片'" :footer="null" :width="640" @cancel="close">
    <p class="camera-guidance">让想录入的衣物尽量完整地出现在画面里，不用露脸也可以。</p>
    <div class="camera-preview"><video ref="video" autoplay muted playsinline aria-label="摄像头预览" @loadeddata="ready = true" /><a-spin v-if="loading" class="camera-loading" /><span v-if="flash" class="camera-flash" aria-hidden="true"></span><span v-if="continuous && count" :key="count" class="camera-count" role="status">已收 {{ count }} 件</span></div>
    <a-alert v-if="error" type="warning" :message="error" show-icon />
    <div class="camera-actions">
      <a-button @click="close">返回选择照片</a-button>
      <a-button v-if="error" :loading="loading" @click="start"><ReloadOutlined /> 重试</a-button>
      <a-button v-else :disabled="loading" @click="switchCamera"><SwapOutlined /> 切换摄像头</a-button>
      <a-button type="primary" :disabled="!ready || loading || capturing || disabled" @click="takePhoto()"><CameraOutlined /> {{ continuous ? '拍下即上传' : '使用这张照片' }}</a-button>
      <a-button v-if="continuous" :disabled="!ready || loading || capturing || disabled" @click="takePhoto(true)">拍摄并指定目标</a-button>
    </div>
  </a-modal>
</template>

<style scoped>
.camera-flash { position: absolute; inset: 0; background: #fff; pointer-events: none; animation: camera-flash .38s ease-out forwards; }
.camera-count { position: absolute; top: 12px; left: 12px; padding: 4px 10px; border-radius: 999px; background: #000000a0; color: #fff; font-size: 12px; font-variant-numeric: tabular-nums; animation: count-bump .35s cubic-bezier(.34, 1.56, .64, 1); }
@keyframes camera-flash { from { opacity: .75; } to { opacity: 0; } }
@keyframes count-bump { from { transform: scale(1.25); } }
@media (prefers-reduced-motion: reduce) { .camera-flash { animation-duration: .01ms; opacity: 0; } .camera-count { animation: none; } }
</style>
