<script setup lang="ts">
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, InfoCircleOutlined, MinusOutlined, PlusOutlined, SwapOutlined, VerticalAlignBottomOutlined, VerticalAlignTopOutlined } from '@ant-design/icons-vue'
import { outfitRoleOptions, type OutfitElement, type OutfitRole } from '../domain/outfit'

defineProps<{ item: OutfitElement; canForward: boolean; canBackward: boolean }>()
const emit = defineEmits<{
  role: [value: OutfitRole]; resize: [width: number]; rotate: [angle: number]; scale: [factor: number];
  position: [axis: 'x' | 'y', value: number]; layer: [value: 'forward' | 'backward' | 'front' | 'back'];
  replace: []; remove: []; info: []
}>()
function numberChange(value: unknown, action: (value: number) => void) {
  if (typeof value === 'number' && Number.isFinite(value)) action(value)
}
</script>

<template>
  <div class="outfit-inspector-content">
    <div class="outfit-inspector-summary"><div class="outfit-inspector-preview"><img :src="item.assetUrl" :alt="item.garmentLabel" /></div><div><strong>{{ item.garmentLabel }}</strong><a-button type="link" class="outfit-info-link" @click="emit('info')"><InfoCircleOutlined /> 查看衣物信息</a-button></div></div>
    <a-alert v-if="item.garmentStatus === 'TRASHED' || item.garmentChanged" type="warning" show-icon :message="item.garmentStatus === 'TRASHED' ? '衣物已在回收站，画板仍保留原图片。' : '衣物已有更新，画板仍保留原图片。'" class="outfit-inspector-notice" />
    <a-tag v-if="item.assetKind === 'INPUT' || item.assetKind === 'GENERATE'" color="orange">当前素材带背景</a-tag>
    <a-form layout="vertical" class="outfit-property-form">
      <a-form-item label="画板分组"><a-select :value="item.role" :options="outfitRoleOptions" aria-label="画板分组" @update:value="emit('role', $event as OutfitRole)" /></a-form-item>
      <a-form-item label="大小（等比缩放）"><div class="outfit-number-control"><a-button aria-label="缩小衣物" @click="emit('scale', .9)"><MinusOutlined /></a-button><a-input-number :value="Math.round(item.width)" :min="24" :max="2160" :precision="0" aria-label="衣物宽度" addon-after="px" @change="numberChange($event, value => emit('resize', value))" /><a-button aria-label="放大衣物" @click="emit('scale', 1.1)"><PlusOutlined /></a-button></div></a-form-item>
      <a-form-item label="旋转角度"><div class="outfit-number-control"><a-button aria-label="向左旋转 15 度" @click="emit('rotate', item.rotation - 15)">−15°</a-button><a-input-number :value="Math.round(item.rotation)" :min="-360" :max="360" :precision="0" aria-label="衣物旋转角度" addon-after="°" @change="numberChange($event, value => emit('rotate', value))" /><a-button aria-label="向右旋转 15 度" @click="emit('rotate', item.rotation + 15)">+15°</a-button></div><a-slider :value="item.rotation" :min="0" :max="360" :step="5" aria-label="旋转衣物" @after-change="numberChange($event, value => emit('rotate', value))" /></a-form-item>
      <a-form-item label="位置"><div class="outfit-position-control"><a-input-number :value="Math.round(item.x)" :min="0" :max="1080" :precision="0" addon-before="X" aria-label="衣物横向位置" @change="numberChange($event, value => emit('position', 'x', value))" /><a-input-number :value="Math.round(item.y)" :min="0" :max="1350" :precision="0" addon-before="Y" aria-label="衣物纵向位置" @change="numberChange($event, value => emit('position', 'y', value))" /></div></a-form-item>
      <a-form-item label="前后层级"><div class="outfit-layer-buttons"><a-button :disabled="!canForward" @click="emit('layer', 'forward')"><ArrowUpOutlined /> 前移一层</a-button><a-button :disabled="!canBackward" @click="emit('layer', 'backward')"><ArrowDownOutlined /> 后移一层</a-button><a-button :disabled="!canForward" @click="emit('layer', 'front')"><VerticalAlignTopOutlined /> 置于顶层</a-button><a-button :disabled="!canBackward" @click="emit('layer', 'back')"><VerticalAlignBottomOutlined /> 置于底层</a-button></div></a-form-item>
    </a-form>
    <div class="outfit-inspector-actions"><a-button block :disabled="item.garmentStatus === 'TRASHED'" @click="emit('replace')"><SwapOutlined /> 替换衣物</a-button><a-button block danger @click="emit('remove')"><DeleteOutlined /> 从搭配移除</a-button></div>
  </div>
</template>
