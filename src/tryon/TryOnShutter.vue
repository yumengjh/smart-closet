<script setup lang="ts">
import { computed } from 'vue'
import { CameraOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons-vue'
import type { ShutterIntent } from './stage'

const props = defineProps<{ intent: ShutterIntent; label: string; text?: string; progress?: number; busy?: boolean }>()
defineEmits<{ press: [] }>()
const inert = computed(() => props.intent === 'disabled' || props.intent === 'wait' || props.busy)
const spinning = computed(() => props.intent === 'cancel' || props.intent === 'wait' || props.busy)
const ring = computed(() => `${Math.round(Math.min(1, Math.max(0, props.progress ?? 0)) * 360)}deg`)
</script>

<template>
  <a-button class="tryon-shutter" :class="[`is-${intent}`, { 'is-spinning': spinning, 'has-progress': progress !== undefined }]" :style="{ '--ring': ring }" shape="circle" :disabled="inert" :aria-label="label" @click="$emit('press')">
    <span class="shutter-ring" aria-hidden="true"></span>
    <span class="shutter-core" aria-hidden="true">
      <CameraOutlined v-if="intent === 'open'" />
      <PlusOutlined v-else-if="intent === 'pick'" />
      <CloseOutlined v-else-if="intent === 'cancel'" />
      <span v-else-if="text" class="shutter-text">{{ text }}</span>
    </span>
  </a-button>
</template>

<style scoped>
.tryon-shutter.ant-btn {
  --size: 76px;
  position: relative;
  display: grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  padding: 0;
  color: #17211c;
  background: transparent;
  border: 0;
  box-shadow: none;
  touch-action: manipulation;
}
.tryon-shutter.ant-btn:not(:disabled):hover,
.tryon-shutter.ant-btn:not(:disabled):focus-visible { color: #17211c; background: transparent; }
.tryon-shutter.ant-btn:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.tryon-shutter.ant-btn:disabled { color: #17211c; background: transparent; opacity: .55; }

.shutter-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: #fff;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
  transition: background .3s ease;
}
.has-progress .shutter-ring { background: conic-gradient(#ff5a4e var(--ring), #ffffff59 0); }
.is-accept.has-progress .shutter-ring { background: conic-gradient(#9fe8c3 var(--ring), #ffffff59 0); }
.is-spinning .shutter-ring {
  background: conic-gradient(from 0deg, #fff0 10%, #fff 90%);
  animation: shutter-spin 1s linear infinite;
}

.shutter-core {
  position: absolute;
  inset: 7px;
  display: grid;
  place-items: center;
  font-size: 24px;
  border-radius: 50%;
  background: #fff;
  transition: inset .22s cubic-bezier(.22, 1, .36, 1), border-radius .22s cubic-bezier(.22, 1, .36, 1), background .22s ease, transform .12s ease;
}
.tryon-shutter:not(:disabled):active .shutter-core { transform: scale(.88); }
.shutter-text { font-size: 15px; font-weight: 600; letter-spacing: .04em; }

.is-start .shutter-core,
.is-accept .shutter-core { background: #9fe8c3; }
.is-accept .shutter-core { animation: shutter-call 1.1s ease-in-out infinite; }
.is-cancel .shutter-core,
.is-wait .shutter-core { inset: 14px; color: #fff; background: #ffffff33; backdrop-filter: blur(8px); }
.is-record .shutter-core { background: #ff4d42; }
.is-stop-record .shutter-core { inset: 22px; border-radius: 8px; background: #ff4d42; }
.is-disabled .shutter-core { background: #ffffffb3; }

@keyframes shutter-spin { to { transform: rotate(360deg); } }
@keyframes shutter-call { 50% { transform: scale(.9); } }
@media (prefers-reduced-motion: reduce) {
  .shutter-ring, .shutter-core { animation: none !important; transition: none !important; }
}
</style>
