<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRightOutlined, ClockCircleOutlined, CheckCircleFilled, ThunderboltOutlined } from '@ant-design/icons-vue'
import { taskLabels, isProcessing } from '../domain/workflow'
import type { Garment } from '../services/api'
import GarmentArt from './GarmentArt.vue'
import { playSound } from '../services/sound'

const props = defineProps<{ garment: Garment; pending?: boolean; trashed?: boolean; selectable?: boolean; selected?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const router = useRouter()
const stickerPending = computed(() => Boolean(props.garment.imageProcessing?.stickerRequired && !props.garment.imageProcessing.stickerReady && !isProcessing(props.garment.taskStatus)))
const title = computed(() => props.garment.name || (props.garment.category[0] && props.garment.category[0] !== '未分类'
  ? `${props.garment.primaryColor[0] === '未知颜色' ? '' : props.garment.primaryColor[0] || ''}${props.garment.category[0]}`
  : '未分类衣物'))
const aiGenerated = computed(() => Boolean(props.garment.images.find(image => image.id === props.garment.displayAssetId)?.aiGenerated))
const pendingLabel = computed(() => `${stickerPending.value ? '贴纸待继续' : props.garment.taskStatus ? taskLabels[props.garment.taskStatus] : '待核对'} · 未入柜`)
function openGarment() { if (props.selectable) { emit('toggle'); return }
  if (!props.pending && !props.trashed) playSound('tap'); void router.push(`/garment/${props.garment.id}`) }
</script>

<template>
  <article class="garment-card" :class="{ selected }" tabindex="0" :role="selectable ? 'checkbox' : 'link'" :aria-checked="selectable ? selected : undefined" :aria-label="selectable ? `选择${title}` : `打开${title}`" @keydown.enter="openGarment()" @click="openGarment()">
    <div class="card-image-wrap">
      <GarmentArt :garment="garment" />
      <a-checkbox v-if="selectable" class="card-check" :checked="selected" tabindex="-1" @click.stop @change="emit('toggle')" />
      <button v-if="!pending && !trashed && !selectable" class="card-more" aria-label="打开衣物详情" @click.stop="openGarment()"><ArrowRightOutlined /></button>
    </div>
    <div class="card-copy">
      <div>
        <div class="card-title-row">
          <h3>{{ title }}</h3>
          <span class="card-badges">
            <a-tooltip v-if="pending" :title="pendingLabel" :trigger="['hover', 'focus']">
              <span class="card-badge pending" tabindex="0" role="img" :aria-label="pendingLabel"><ClockCircleOutlined /></span>
            </a-tooltip>
            <a-tooltip v-else-if="!trashed && stickerPending" title="已入柜 · 贴纸未完成" :trigger="['hover', 'focus']">
              <span class="card-badge done" tabindex="0" role="img" aria-label="已入柜 · 贴纸未完成"><CheckCircleFilled /></span>
            </a-tooltip>
            <a-tooltip v-if="aiGenerated" title="AI 生成 · 可能含推测细节" :trigger="['hover', 'focus']">
              <span class="card-badge ai" tabindex="0" role="img" aria-label="AI 生成 · 可能含推测细节"><ThunderboltOutlined /></span>
            </a-tooltip>
          </span>
        </div>
        <p>{{ garment.patterns[0] || '信息待补充' }}<span v-if="garment.seasons.length"> · {{ garment.seasons.slice(0, 2).join(' / ') }}</span></p>
      </div>
      <span class="card-swatch" :style="{ background: garment.imageColor }" :aria-label="garment.primaryColor[0] || '未知颜色'"></span>
    </div>
  </article>
</template>

<style scoped>
.card-title-row{display:flex;align-items:center;gap:6px;min-width:0}
.card-title-row h3{flex:1;min-width:0}
.card-badges{display:flex;align-items:center;gap:4px;flex-shrink:0}
.card-badge{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;color:var(--muted-strong);font-size:12px;cursor:default}
.card-badge.pending{color:var(--warning)}
.card-badge.done{color:var(--success)}
.card-check{position:absolute;left:10px;top:10px;z-index:1}
.garment-card.selected .card-image-wrap{box-shadow:0 0 0 2px var(--accent)}
</style>
