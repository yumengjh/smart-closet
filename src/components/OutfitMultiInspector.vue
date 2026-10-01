<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{ count: number }>()
const emit = defineEmits<{ rotate: [angle: number, relative: boolean]; scale: [factor: number]; offset: [x: number, y: number]; flip: []; stretch: [value: boolean]; remove: [] }>()
const angle = ref(0), percent = ref(100), dx = ref(0), dy = ref(0)
</script>
<template>
  <div class="outfit-inspector-content">
    <strong>已选中 {{ props.count }} 张贴纸</strong>
    <p class="outfit-panel-description">画布选框可整体缩放、旋转；以下属性应用到每张选中贴纸，可一次撤销。</p>
    <a-form layout="vertical" class="outfit-property-form">
      <a-form-item label="统一旋转角度"><a-input-number v-model:value="angle" :min="0" :max="360" aria-label="批量旋转角度" addon-after="°" /><a-button block @click="emit('rotate', angle ?? 0, false)">应用角度</a-button><div class="outfit-layer-buttons"><a-button @click="emit('rotate', -15, true)">各自 −15°</a-button><a-button @click="emit('rotate', 15, true)">各自 +15°</a-button></div></a-form-item>
      <a-form-item label="各自等比缩放"><a-input-number v-model:value="percent" :min="10" :max="500" aria-label="批量缩放百分比" addon-after="%" /><a-button block @click="emit('scale', (percent ?? 100) / 100)">应用缩放</a-button></a-form-item>
      <a-form-item label="整体平移"><div class="outfit-position-control"><a-input-number v-model:value="dx" :min="-1080" :max="1080" aria-label="批量水平偏移" addon-before="X" /><a-input-number v-model:value="dy" :min="-1350" :max="1350" aria-label="批量垂直偏移" addon-before="Y" /></div><a-button block @click="emit('offset', dx ?? 0, dy ?? 0)">应用偏移</a-button></a-form-item>
      <a-form-item label="批量操作"><div class="outfit-layer-buttons"><a-button @click="emit('flip')">各自水平翻转</a-button><a-button @click="emit('stretch', true)">开启自由拉伸</a-button><a-button @click="emit('stretch', false)">恢复等比缩放</a-button><a-button danger @click="emit('remove')">删除所选</a-button></div></a-form-item>
    </a-form>
  </div>
</template>
