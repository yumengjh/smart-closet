<script setup lang="ts">
import { computed } from 'vue'
import { MoreOutlined } from '@ant-design/icons-vue'
import { Empty } from 'ant-design-vue'
import type { OutfitElement } from '../domain/outfit'
const props = defineProps<{ elements: OutfitElement[]; selectedId: string }>()
const emit = defineEmits<{ select: [id: string]; context: [event: MouseEvent, id: string] }>()
const layers = computed(() => [...props.elements].reverse())
</script>
<template>
  <div class="outfit-layers"><p class="outfit-panel-description">上面的衣物会覆盖下面的衣物。</p><a-empty v-if="!elements.length" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="加入衣物后管理层级" /><div v-for="item in layers" :key="item.garmentId" class="outfit-layer-row" :class="{ active: selectedId === item.garmentId }" @contextmenu.prevent="emit('context', $event, item.garmentId)"><a-button type="text" class="outfit-layer-select" :aria-pressed="selectedId === item.garmentId" @click="emit('select', item.garmentId)"><img :src="item.assetUrl" alt="" /><span><strong>{{ item.garmentLabel }}</strong><small>第 {{ item.zIndex + 1 }} 层{{ item.zIndex === elements.length - 1 ? ' · 顶层' : '' }}</small></span></a-button><a-button type="text" aria-label="衣物更多操作" @click="emit('context', $event, item.garmentId)"><MoreOutlined /></a-button></div></div>
</template>
