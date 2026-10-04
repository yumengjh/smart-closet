<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useProcessingStore } from '../stores/processing'
const emit = defineEmits<{ opened: [] }>()
const processing = useProcessingStore()
const router = useRouter()
function openResult() {
  const entry = processing.latestNotice
  if (!entry) return
  processing.viewed(entry); emit('opened'); void router.push(entry.href)
}
</script>
<template>
  <a-alert v-if="processing.latestNotice" class="task-notice" :type="processing.latestNotice.state === 'ready' ? 'success' : processing.latestNotice.state === 'attention' ? 'warning' : 'info'" show-icon closable @close="processing.dismissNotice()">
    <template #message><span role="status">{{ processing.latestNotice.stage }}</span></template>
    <template #description><div class="task-notice-actions"><span>{{ processing.latestNotice.title }}</span><a-button size="small" @click="openResult">{{ processing.latestNotice.state === 'ready' ? '去核对' : '查看任务' }}</a-button></div></template>
  </a-alert>
</template>
<style scoped>
.task-notice{margin-bottom:16px;text-align:left}.task-notice-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}.task-notice-actions>span{min-width:0;overflow-wrap:anywhere}
</style>
