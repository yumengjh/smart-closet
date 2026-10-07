<script setup lang="ts">
import { computed } from 'vue'
import { LoadingOutlined } from '@ant-design/icons-vue'
import { useProcessingStore } from '../stores/processing'
import WaitingActivities from './WaitingActivities.vue'
const processing = useProcessingStore()
const stage = computed(() => processing.entries.find(entry => entry.key === processing.startPrompt?.key)?.stage || processing.startPrompt?.stage)
</script>
<template>
  <a-modal :open="Boolean(processing.startPrompt)" title="衣物已开始处理" :footer="null" :width="420" centered @cancel="processing.dismissStartPrompt()">
    <p class="started-stage"><LoadingOutlined spin /> {{ stage }}</p>
    <WaitingActivities invitation @chosen="processing.dismissStartPrompt()" />
    <a-button class="started-stay" type="link" block @click="processing.dismissStartPrompt()">留在这里看进度</a-button>
  </a-modal>
</template>
<style scoped>
.started-stage{display:flex;align-items:center;gap:8px;margin:4px 0 20px;color:var(--muted);font-size:13px}.started-stage .anticon{color:var(--accent)}.started-stay{margin-top:12px}
</style>
