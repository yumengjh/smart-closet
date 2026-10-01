<script setup lang="ts">
import { computed, ref } from 'vue'
import { HolderOutlined, MoreOutlined } from '@ant-design/icons-vue'
import { Empty } from 'ant-design-vue'
import { elementKey, type OutfitElement } from '../domain/outfit'
const props = defineProps<{ elements: OutfitElement[]; selectedId: string; selectedIds: string[] }>()
const emit = defineEmits<{ select: [id: string, additive?: boolean, range?: boolean]; all: []; clear: []; context: [event: MouseEvent, id: string]; reorder: [source: string, target: string, above: boolean] }>()
const layers = computed(() => [...props.elements].reverse())
const dragging = ref('')
const target = ref('')
const above = ref(true)
let originY = 0
let moved = false
function start(event: PointerEvent, id: string) {
  if (event.button !== 0) return
  originY = event.clientY; moved = false; dragging.value = id; target.value = ''
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (!dragging.value) return
  moved ||= Math.abs(event.clientY - originY) > 5
  if (!moved) return
  event.preventDefault()
  const root = (event.currentTarget as HTMLElement).closest('.outfit-layers')
  const scroller = root?.closest<HTMLElement>('.outfit-inspector-body, .ant-drawer-body')
  if (scroller) {
    const box = scroller.getBoundingClientRect()
    if (event.clientY < box.top + 32) scroller.scrollTop -= 16
    else if (event.clientY > box.bottom - 32) scroller.scrollTop += 16
  }
  const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-layer-id]')
  if (!row || !root?.contains(row)) { target.value = ''; return }
  target.value = row.dataset.layerId || ''
  const bounds = row.getBoundingClientRect()
  above.value = event.clientY < bounds.top + bounds.height / 2
}
function end(cancel = false) {
  if (!cancel && moved && target.value) emit('reorder', dragging.value, target.value, above.value)
  dragging.value = ''; target.value = ''; moved = false
}
function keyboard(event: KeyboardEvent, id: string) {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  const index = layers.value.findIndex(item => elementKey(item) === id)
  const item = layers.value[index + (event.key === 'ArrowUp' ? -1 : 1)]
  if (item) emit('reorder', id, elementKey(item), event.key === 'ArrowUp')
}
</script>
<template>
  <div class="outfit-layers">
    <div class="outfit-layer-buttons"><a-button @click="emit('all')">全选</a-button><a-button :disabled="!selectedIds.length" @click="emit('clear')">清除选择</a-button></div><p class="outfit-panel-description">勾选可多选，Shift 点选可连续选择。拖动把手调整叠放顺序，上面覆盖下面。也可聚焦把手后按 ↑ / ↓。</p>
    <a-empty v-if="!elements.length" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="加入贴纸后管理图层" />
    <div v-for="item in layers" :key="elementKey(item)" :data-layer-id="elementKey(item)" class="outfit-layer-row" :class="{ active: selectedIds.includes(elementKey(item)), dragging: dragging === elementKey(item), 'drop-above': target === elementKey(item) && target !== dragging && above, 'drop-below': target === elementKey(item) && target !== dragging && !above }" @contextmenu.prevent="emit('context', $event, elementKey(item))">
      <a-checkbox class="outfit-layer-check" :aria-label="`选择：${item.garmentLabel}`" :checked="selectedIds.includes(elementKey(item))" @change="emit('select', elementKey(item), true)" /><button type="button" class="outfit-layer-handle" :aria-label="`排序：${item.garmentLabel}`" @pointerdown="start($event, elementKey(item))" @pointermove="move" @pointerup="end()" @pointercancel="end(true)" @lostpointercapture="end(true)" @keydown="keyboard($event, elementKey(item))"><HolderOutlined /></button>
      <button type="button" class="outfit-layer-select" :aria-pressed="selectedIds.includes(elementKey(item))" @click="emit('select', elementKey(item), $event.ctrlKey || $event.metaKey || $event.shiftKey, $event.shiftKey)"><img :src="item.assetUrl" alt="" /><span><strong>{{ item.garmentLabel }}</strong><small>{{ item.kind === 'PERSON_PART' ? '人物' : '衣物' }} · 第 {{ item.zIndex + 1 }} 层{{ item.zIndex === elements.length - 1 ? ' · 顶层' : '' }}</small></span></button>
      <a-button type="text" :aria-label="`${item.garmentLabel}更多操作`" @click="emit('context', $event, elementKey(item))"><MoreOutlined /></a-button>
    </div>
    <span class="sr-only" role="status" aria-live="polite">{{ dragging ? '正在调整图层顺序' : '' }}</span>
  </div>
</template>
