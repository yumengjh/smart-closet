<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRightOutlined } from '@ant-design/icons-vue'
import { taskLabels, isProcessing } from '../domain/workflow'
import type { Garment } from '../services/api'
import GarmentArt from './GarmentArt.vue'
import { playSound } from '../services/sound'

const props = defineProps<{ garment: Garment; pending?: boolean; trashed?: boolean }>()
const router = useRouter()
const stickerPending = computed(() => Boolean(props.garment.imageProcessing?.stickerRequired && !props.garment.imageProcessing.stickerReady && !isProcessing(props.garment.taskStatus)))
const title = computed(() => props.garment.name || (props.garment.category[0] && props.garment.category[0] !== '未分类'
  ? `${props.garment.primaryColor[0] === '未知颜色' ? '' : props.garment.primaryColor[0] || ''}${props.garment.category[0]}`
  : '未分类衣物'))
function openGarment() { if (!props.pending && !props.trashed) playSound('tap'); void router.push(`/garment/${props.garment.id}`) }
</script>

<template>
  <article class="garment-card" tabindex="0" role="link" :aria-label="`打开${title}`" @keydown.enter="openGarment()" @click="openGarment()">
    <div class="card-image-wrap">
      <GarmentArt :garment="garment" /><span v-if="garment.images.find(image => image.id === garment.displayAssetId)?.aiGenerated" class="ai-image-label">AI 生成 · 可能含推测细节</span>
      <span v-if="pending" class="card-status"><span class="status-dot"></span>{{ stickerPending ? '贴纸待继续' : garment.taskStatus ? taskLabels[garment.taskStatus] : '待核对' }} · 未入柜</span>
      <span v-if="!pending && !trashed && stickerPending" class="card-status">已入柜 · 贴纸未完成</span>
      <button v-if="!pending && !trashed" class="card-more" aria-label="打开衣物详情" @click.stop="openGarment()"><ArrowRightOutlined /></button>
    </div>
    <div class="card-copy">
      <div><h3>{{ title }}</h3><p>{{ garment.patterns[0] || '信息待补充' }}<span v-if="garment.seasons.length"> · {{ garment.seasons.slice(0, 2).join(' / ') }}</span></p></div>
      <span class="card-swatch" :style="{ background: garment.imageColor }" :aria-label="garment.primaryColor[0] || '未知颜色'"></span>
    </div>
  </article>
</template>

<style scoped>.ai-image-label{position:absolute;top:10px;left:10px;max-width:calc(100% - 20px);font-size:11px;padding:4px 8px;background:var(--surface);color:var(--muted);border-radius:6px}</style>
