<script setup lang="ts">
import { computed, ref } from 'vue'
import { useClosetStore } from '../stores/closet'
import { useFloatingPosition } from './useFloatingPosition'
import AssistantFace from './AssistantFace.vue'
const props = defineProps<{ open: boolean; mood: string; busy: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const closet = useClosetStore()
const hovered = ref(false)
const control = ref<{ $el: HTMLButtonElement } | null>(null)
const key = computed(() => `yixu.assistant-orb.v1:${closet.user?.username || 'local'}`)
const position = useFloatingPosition(key, computed(() => ({ width: 64, height: 64 })), () => window.innerWidth < 1024 ? 96 : 24)
function activate() { if (position.clicked()) emit('toggle') }
defineExpose({ focus: () => control.value?.$el.focus() })
</script>
<template>
  <Teleport to="body">
    <a-tooltip :title="position.dragging.value ? '' : open ? '收起助手 · 拖动可以移动' : '找我聊聊 · 拖动可以移动'" placement="left">
      <a-button ref="control" class="assistant-orb" shape="circle" :class="{ dragging: position.dragging.value, active: open }" :style="position.style.value" data-sound="off" :aria-label="open ? '收起个人助手' : '打开个人助手'" :aria-expanded="open" aria-controls="closet-assistant" @pointerdown="position.start" @pointermove="position.move" @pointerup="position.end" @pointercancel="position.end" @lostpointercapture="position.end" @keydown="position.keyboard" @click="activate" @pointerenter="hovered = true" @pointerleave="hovered = false">
        <AssistantFace :mood="mood === 'idle' && hovered ? 'happy' : mood" /><span v-if="busy" class="assistant-orb-busy" aria-hidden="true" />
      </a-button>
    </a-tooltip>
  </Teleport>
</template>
