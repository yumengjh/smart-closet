<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { CameraOutlined, SwapOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { cameraError } from '../services/camera'

const emit = defineEmits<{ close: []; capture: [file: File] }>()
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
function takePhoto() {
  const source = video.value
  if (!source || !ready.value || !source.videoWidth || closed) return
  const canvas = document.createElement('canvas')
  canvas.width = source.videoWidth; canvas.height = source.videoHeight
  canvas.getContext('2d')!.drawImage(source, 0, 0)
  const attempt = epoch
  canvas.toBlob(blob => {
    if (closed || attempt !== epoch) return
    if (!blob) { error.value = '照片暂时没有保存好，请再拍一次。'; return }
    emit('capture', new File([blob], `衣物照片-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    close()
  }, 'image/jpeg', .92)
}
onMounted(start)
onBeforeUnmount(() => { closed = true; epoch++; release() })
</script>

<template>
  <a-modal :open="true" title="拍一张衣物照片" :footer="null" :width="640" @cancel="close">
    <p class="camera-guidance">让想录入的衣物尽量完整地出现在画面里，不用露脸也可以。</p>
    <div class="camera-preview"><video ref="video" autoplay muted playsinline aria-label="摄像头预览" @loadeddata="ready = true" /><a-spin v-if="loading" class="camera-loading" /></div>
    <a-alert v-if="error" type="warning" :message="error" show-icon />
    <div class="camera-actions">
      <a-button @click="close">返回选择照片</a-button>
      <a-button v-if="error" :loading="loading" @click="start"><ReloadOutlined /> 重试</a-button>
      <a-button v-else :disabled="loading" @click="switchCamera"><SwapOutlined /> 切换摄像头</a-button>
      <a-button type="primary" :disabled="!ready || loading" @click="takePhoto"><CameraOutlined /> 使用这张照片</a-button>
    </div>
  </a-modal>
</template>
