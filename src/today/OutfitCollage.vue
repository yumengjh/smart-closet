<script setup lang="ts">
// 平铺拼图（与“今天”卡片同一摆法）：衣服直接摆在浅灰底上，不画白色画板，任意宽高比的容器里都居中、不裁切。
import { computed } from 'vue'
import { thumbUrl } from '../services/urls'
import { collageSlots } from './deck'

const props = withDefaults(defineProps<{ pieces: { id: string; role: string; displayUrl?: string | null }[]; size?: number; title?: string }>(), { size: 480, title: '' })
const slots = computed(() => collageSlots(props.pieces, path => thumbUrl(path, props.size)))
</script>
<template>
  <span class="outfit-collage" role="img" :aria-label="title ? `${title}的搭配` : '搭配'">
    <span class="outfit-collage-box"><img v-for="slot in slots" :key="slot.id" :src="slot.url" alt="" draggable="false" loading="lazy" decoding="async" :style="{ left: `${slot.left}%`, top: `${slot.top}%`, width: `${slot.width}%`, height: `${slot.height}%` }" /></span>
  </span>
</template>
<style scoped>
.outfit-collage { display: grid; place-items: center; width: 100%; height: 100%; container-type: size; }
.outfit-collage-box { position: relative; width: min(92cqw, 92cqh); height: min(92cqw, 92cqh); }
.outfit-collage-box img { position: absolute; object-fit: contain; filter: drop-shadow(0 6px 10px #0000001a); pointer-events: none; }
</style>
