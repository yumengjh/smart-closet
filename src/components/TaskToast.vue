<script setup lang="ts">
import { h, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { App, Button } from 'ant-design-vue'
import { CheckCircleFilled, ExclamationCircleFilled, MinusCircleFilled } from '@ant-design/icons-vue'
import { useProcessingStore } from '../stores/processing'
import type { WaitingEntry } from '../domain/waiting'
import { thumbUrl } from '../services/urls'
// Finished tasks surface as a card under the processing center instead of a box at the top of every page.
const processing = useProcessingStore(), router = useRouter(), { notification } = App.useApp()
const icons = { ready: CheckCircleFilled, attention: ExclamationCircleFilled, cancelled: MinusCircleFilled } as const
let shown = ''
function show(entry: WaitingEntry) {
  if (shown) notification.destroy(shown)
  const key = shown = `task-toast:${entry.key}`
  const icon = icons[entry.state as keyof typeof icons]
  notification.open({
    key, class: `task-toast ${entry.state}`, duration: 8,
    placement: window.innerWidth < 768 ? 'top' : 'topRight',
    message: entry.stage, description: entry.thumb ? h('span', { class: 'task-toast-media' }, [h('img', { src: thumbUrl(entry.thumb, 160), alt: '' }), entry.title]) : entry.title,
    icon: icon && h(icon),
    btn: h(Button, { size: 'small', type: entry.state === 'ready' ? 'primary' : 'default', onClick: () => { processing.viewed(entry); notification.destroy(key); void router.push(entry.href) } }, () => entry.kind === 'render' && entry.state === 'ready' ? '去看看' : entry.state === 'ready' ? '去核对' : '查看任务'),
    onClose: () => { if (shown === key) shown = ''; if (processing.latestNotice?.key === entry.key) processing.dismissNotice() },
  })
}
watch(() => processing.latestNotice, entry => { if (entry) show(entry); else if (shown) { notification.destroy(shown); shown = '' } })
onUnmounted(() => { if (shown) notification.destroy(shown) })
</script>
<template><span hidden /></template>
