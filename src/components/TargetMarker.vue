<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Hint } from '../services/quickIntake'
const props = defineProps<{ blob: Blob }>()
const emit = defineEmits<{ finish: [hint?: Hint]; close: [] }>()
const url = URL.createObjectURL(props.blob)
const kind = ref<'POINT' | 'BOX'>('POINT'); const hint = ref<Hint>(); const start = ref<{ x: number; y: number }>(); const image = ref<HTMLImageElement>()
const style = computed(() => hint.value ? { left: `${hint.value.x * 100}%`, top: `${hint.value.y * 100}%`, width: `${(hint.value.width || 0) * 100}%`, height: `${(hint.value.height || 0) * 100}%` } : {})
function point(e: PointerEvent) { const rect = image.value!.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) } }
function down(e: PointerEvent) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start.value = point(e); hint.value = { kind: 'POINT', ...start.value } }
function move(e: PointerEvent) { if (!start.value || kind.value !== 'BOX') return; const p = point(e); hint.value = { kind: 'BOX', x: Math.min(start.value.x, p.x), y: Math.min(start.value.y, p.y), width: Math.abs(start.value.x - p.x), height: Math.abs(start.value.y - p.y) } }
function up(e: PointerEvent) { move(e); start.value = undefined; if (hint.value?.kind === 'BOX' && (!hint.value.width || !hint.value.height)) hint.value = undefined }
onBeforeUnmount(() => URL.revokeObjectURL(url))
</script>
<template><a-modal open title="指定这张照片的主目标" :footer="null" @cancel="emit('close')"><p>每张照片收录一件衣物。点一下目标，或拖出一个框。其他照片仍会继续上传。</p><a-radio-group v-model:value="kind" :options="[{ label: '点选', value: 'POINT' }, { label: '框选', value: 'BOX' }]" /><div class="marker" @pointerdown="down" @pointermove="move" @pointerup="up"><img ref="image" :src="url" alt="待标记照片" draggable="false" /><span v-if="hint" :class="hint.kind.toLowerCase()" :style="style" /></div><a-space><a-button @click="emit('finish')">不指定，直接上传</a-button><a-button type="primary" :disabled="!hint" @click="emit('finish', hint)">保存标记并上传</a-button></a-space></a-modal></template>
<style scoped>.marker{position:relative;margin:18px 0;touch-action:none;line-height:0;width:fit-content;max-width:100%}.marker img{max-width:100%;max-height:55vh;user-select:none}.marker span{position:absolute;pointer-events:none;border:3px solid #ef6e34}.marker .point{width:20px!important;height:20px!important;border-radius:50%;transform:translate(-50%,-50%);background:#ef6e3455}.marker .box{background:#ef6e3422}</style>
