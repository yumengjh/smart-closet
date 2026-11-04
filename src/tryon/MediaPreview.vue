<script setup lang="ts">
import { ref } from 'vue'
import { PlayCircleOutlined, PauseCircleOutlined, SoundOutlined, AudioMutedOutlined } from '@ant-design/icons-vue'
import { duration } from './api'
const props = defineProps<{ src: string; durationMs: number }>()
const video = ref<HTMLVideoElement>(), playing = ref(false), muted = ref(true), current = ref(0), length = ref(props.durationMs / 1000), error = ref('')
async function toggle() { try { if (video.value?.paused) await video.value.play(); else video.value?.pause() } catch { error.value = '暂时无法播放，请尝试下载。' } }
function metadata() { const n = video.value?.duration; if (n && Number.isFinite(n)) length.value = n }
function seek(value: number | number[]) { if (video.value) video.value.currentTime = Number(value) }
</script>
<template>
  <div class="tryon-media-player">
    <video ref="video" :src="src" :muted="muted" playsinline preload="metadata" aria-label="试穿录像" @loadedmetadata="metadata" @timeupdate="current = video?.currentTime || 0" @play="playing=true" @pause="playing=false" @ended="playing=false" @error="error='片段暂不可播放，请尝试下载或稍后刷新。'"></video>
    <div class="tryon-media-player-actions"><a-button type="text" :aria-label="playing?'暂停录像':'播放录像'" @click="toggle"><PauseCircleOutlined v-if="playing" /><PlayCircleOutlined v-else /></a-button><a-button type="text" :aria-label="muted?'开启声音':'静音'" @click="muted=!muted"><AudioMutedOutlined v-if="muted" /><SoundOutlined v-else /></a-button><span>{{ duration(current) }}</span></div>
    <a-slider :value="current" :min="0" :max="Math.max(1,length)" :step=".1" :tip-formatter="null" aria-label="录像进度" @change="seek" />
    <p v-if="error" role="status">{{ error }}</p>
  </div>
</template>
<style scoped>
.tryon-media-player{min-width:0;width:100%;background:var(--surface-alt);border-radius:8px;overflow:hidden}.tryon-media-player video{display:block;width:100%;max-height:200px;object-fit:contain}.tryon-media-player-actions{display:flex;align-items:center;gap:2px}.tryon-media-player-actions .ant-btn{min-width:36px;height:36px;padding:4px}.tryon-media-player-actions span{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}.tryon-media-player .ant-slider{margin:2px 12px 12px}.tryon-media-player p{padding:8px;font-size:11px;color:var(--muted)}
</style>
