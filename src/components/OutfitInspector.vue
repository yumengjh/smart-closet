<script setup lang="ts">
import { mediaUrl } from '../services/urls'
import { ref, watch } from 'vue'
import { sliderSound } from '../services/sound'
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, InfoCircleOutlined, MinusOutlined, PlusOutlined, SwapOutlined, VerticalAlignBottomOutlined, VerticalAlignTopOutlined } from '@ant-design/icons-vue'
import { outfitRoleOptions, type OutfitElement, type OutfitRole, type OutfitCrop } from '../domain/outfit'

const props = defineProps<{ item: OutfitElement; canForward: boolean; canBackward: boolean }>()
const emit = defineEmits<{
  rotatePreview: [angle: number]; role: [value: OutfitRole]; resize: [width: number]; rotate: [angle: number]; scale: [factor: number];
  position: [axis: 'x' | 'y', value: number]; layer: [value: 'forward' | 'backward' | 'front' | 'back'];
  replace: []; remove: []; info: []; flip: []; duplicate: []; stretch: [value: boolean]; height: [value: number]; crop: [value: OutfitCrop]
}>()
const rotationPreview = ref(props.item.rotation)
let rotationDetent = Math.floor(props.item.rotation / 15)
watch(() => [props.item.elementId, props.item.garmentId, props.item.rotation], () => { rotationPreview.value = props.item.rotation; rotationDetent = Math.floor(props.item.rotation / 15) })
function previewAngle(angle: number) {
  const detent = Math.floor(angle / 15)
  if (detent !== rotationDetent) { rotationDetent = detent; sliderSound(angle / 360) }
  emit('rotatePreview', angle)
}
function cropChange(axis: 'x' | 'y' | 'width' | 'height', value: unknown) {
  if (typeof value !== 'number') return
  const item = props.item
  const crop = { x: item.cropX, y: item.cropY, width: item.cropWidth, height: item.cropHeight }
  crop[axis] = value / 100
  crop.width = Math.min(crop.width, 1 - crop.x)
  crop.height = Math.min(crop.height, 1 - crop.y)
  if (crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 && crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001) emit('crop', crop)
}
function numberChange(value: unknown, action: (value: number) => void) {
  if (typeof value === 'number' && Number.isFinite(value)) action(value)
}
</script>

<template>
  <div class="outfit-inspector-content">
    <div class="outfit-inspector-summary"><div class="outfit-inspector-preview"><img :src="mediaUrl(item.assetUrl)" :alt="item.garmentLabel" /></div><div><strong>{{ item.garmentLabel }}</strong><a-tag>{{ item.kind === 'PERSON_PART' ? '人物贴纸' : '衣物贴纸' }}</a-tag><a-button v-if="item.kind !== 'PERSON_PART'" type="link" class="outfit-info-link" @click="emit('info')"><InfoCircleOutlined /> 查看衣物信息</a-button></div></div>
    <a-alert v-if="item.garmentStatus === 'TRASHED' || item.garmentChanged" type="warning" show-icon :message="item.garmentStatus === 'TRASHED' ? '衣物已在回收站，画板仍保留原图片。' : '衣物已有更新，画板仍保留原图片。'" class="outfit-inspector-notice" />
    <a-tag v-if="item.assetKind === 'INPUT' || item.assetKind === 'GENERATE'" color="orange">当前素材带背景</a-tag>
    <a-form layout="vertical" class="outfit-property-form">
      <a-form-item v-if="item.kind !== 'PERSON_PART'" label="画板分组"><a-select :value="item.role" :options="outfitRoleOptions" aria-label="画板分组" @update:value="emit('role', $event as OutfitRole)" /></a-form-item>
      <a-form-item :label="item.freeStretch ? '宽度（自由拉伸）' : '大小（等比缩放）'"><div class="outfit-number-control"><a-button aria-label="缩小贴纸" @click="emit('scale', .9)"><MinusOutlined /></a-button><a-input-number :value="Math.round(item.width)" :min="24" :max="2160" :precision="0" aria-label="贴纸宽度" addon-after="px" @change="numberChange($event, value => emit('resize', value))" /><a-button aria-label="放大贴纸" @click="emit('scale', 1.1)"><PlusOutlined /></a-button></div></a-form-item>
      <a-form-item label="自由拉伸"><a-switch :checked="!!item.freeStretch" aria-label="自由拉伸" @update:checked="emit('stretch', $event)" /><span class="muted"> 开启后可分别调整宽高</span></a-form-item>
      <a-form-item v-if="item.freeStretch" label="高度"><a-input-number :value="Math.round(item.height)" :min="24" :max="2700" aria-label="贴纸高度" @change="numberChange($event, value => emit('height', value))" /></a-form-item>
      <a-form-item label="旋转角度"><div class="outfit-number-control"><a-button aria-label="向左旋转 15 度" @click="emit('rotate', item.rotation - 15)">−15°</a-button><a-input-number :value="Math.round(item.rotation)" :min="-360" :max="360" :precision="0" aria-label="贴纸旋转角度" addon-after="°" @change="numberChange($event, value => emit('rotate', value))" /><a-button aria-label="向右旋转 15 度" @click="emit('rotate', item.rotation + 15)">+15°</a-button></div><a-slider v-model:value="rotationPreview" :min="0" :max="360" :step="1" aria-label-for-handle="旋转贴纸" @change="numberChange($event, previewAngle)" @after-change="numberChange($event, value => emit('rotate', value))" /></a-form-item>
      <a-form-item label="贴纸操作"><div class="outfit-layer-buttons"><a-button @click="emit('flip')">水平翻转</a-button><a-button @click="emit('duplicate')">复制贴纸</a-button></div></a-form-item>
      <a-form-item label="裁剪范围（百分比）"><div class="outfit-position-control"><a-input-number :value="Math.round(item.cropX * 100)" :min="0" :max="99" addon-before="X" aria-label="裁剪起点X" @change="cropChange('x', $event)" /><a-input-number :value="Math.round(item.cropY * 100)" :min="0" :max="99" addon-before="Y" aria-label="裁剪起点Y" @change="cropChange('y', $event)" /><a-input-number :value="Math.round(item.cropWidth * 100)" :min="1" :max="100" addon-before="宽" aria-label="裁剪宽度" @change="cropChange('width', $event)" /><a-input-number :value="Math.round(item.cropHeight * 100)" :min="1" :max="100" addon-before="高" aria-label="裁剪高度" @change="cropChange('height', $event)" /></div><a-button type="link" @click="emit('crop', { x: 0, y: 0, width: 1, height: 1 })">恢复完整图片</a-button></a-form-item>
      <a-form-item label="位置"><div class="outfit-position-control"><a-input-number :value="Math.round(item.x)" :min="0" :max="1080" :precision="0" addon-before="X" aria-label="贴纸横向位置" @change="numberChange($event, value => emit('position', 'x', value))" /><a-input-number :value="Math.round(item.y)" :min="0" :max="1350" :precision="0" addon-before="Y" aria-label="贴纸纵向位置" @change="numberChange($event, value => emit('position', 'y', value))" /></div></a-form-item>
      <a-form-item label="前后层级"><div class="outfit-layer-buttons"><a-button :disabled="!canForward" @click="emit('layer', 'forward')"><ArrowUpOutlined /> 前移一层</a-button><a-button :disabled="!canBackward" @click="emit('layer', 'backward')"><ArrowDownOutlined /> 后移一层</a-button><a-button :disabled="!canForward" @click="emit('layer', 'front')"><VerticalAlignTopOutlined /> 置于顶层</a-button><a-button :disabled="!canBackward" @click="emit('layer', 'back')"><VerticalAlignBottomOutlined /> 置于底层</a-button></div></a-form-item>
    </a-form>
    <div class="outfit-inspector-actions"><a-button v-if="item.kind !== 'PERSON_PART'" block :disabled="item.garmentStatus === 'TRASHED'" @click="emit('replace')"><SwapOutlined /> 替换衣物</a-button><a-button block danger @click="emit('remove')"><DeleteOutlined /> 从搭配移除</a-button></div>
  </div>
</template>
