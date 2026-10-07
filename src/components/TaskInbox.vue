<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BellOutlined } from '@ant-design/icons-vue'
import { useProcessingStore } from '../stores/processing'
import { useClosetStore } from '../stores/closet'
import type { WaitingEntry } from '../domain/waiting'
import TaskInboxPanel from './TaskInboxPanel.vue'
const processing = useProcessingStore(), closet = useClosetStore(), router = useRouter()
const open = ref(false)
// Anchored popover on desktop; phones get a bottom drawer within thumb reach.
const phoneQuery = window.matchMedia('(max-width: 767px)'), phone = ref(phoneQuery.matches)
// The server count also covers tasks started in another tab or before a reload.
const running = computed(() => Math.max(processing.activeCount, closet.taskCount))
const label = computed(() => running.value ? `${running.value} 个处理中` : processing.unreadCount ? `${processing.unreadCount} 个新结果` : '')
function show(visible: boolean) { open.value = visible; if (visible) { void processing.refresh(true); void closet.refreshCounts() } }
function visit(entry: WaitingEntry) { processing.viewed(entry); open.value = false; void router.push(entry.href) }
function go(path: string) { open.value = false; void router.push(path) }
function media() { phone.value = phoneQuery.matches; open.value = false }
onMounted(() => phoneQuery.addEventListener('change', media))
onUnmounted(() => phoneQuery.removeEventListener('change', media))
</script>
<template>
  <a-popover :open="open && !phone" trigger="click" placement="bottomRight" :arrow="false" overlay-class-name="task-inbox-popover" @update:open="(value: boolean) => !phone && show(value)">
    <a-tooltip :title="label || open ? '' : '衣物处理任务'">
      <a-button type="text" class="task-inbox-trigger" :class="{ busy: running, unread: !running && processing.unreadCount }" :aria-label="label ? `衣物处理任务：${label}` : '衣物处理任务'" :aria-expanded="open" @click="phone && show(!open)">
        <span class="inbox-glyph"><span v-if="running" class="inbox-trigger-ring" aria-hidden="true" /><BellOutlined v-else /><i v-if="processing.unreadCount" class="inbox-trigger-dot" /></span>
        <span v-if="label" class="inbox-trigger-label">{{ label }}</span>
      </a-button>
    </a-tooltip>
    <template #content><TaskInboxPanel :open="open" @visit="visit" @go="go" /></template>
  </a-popover>
  <a-drawer v-if="phone" :open="open" placement="bottom" height="auto" :closable="false" root-class-name="task-inbox-drawer" @close="open = false"><TaskInboxPanel :open="open" @visit="visit" @go="go" /></a-drawer>
</template>
<style scoped>
.task-inbox-trigger.ant-btn { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border-radius: 999px; color: var(--muted-strong); transition: background .2s, color .2s; }
.task-inbox-trigger.busy { padding-right: 12px; background: var(--accent-soft); color: var(--ink); }
.task-inbox-trigger.unread { padding-right: 12px; background: var(--info-bg); color: var(--ink); }
.inbox-glyph { position: relative; display: grid; place-items: center; width: 16px; height: 16px; font-size: 16px; }
.inbox-trigger-ring { width: 14px; height: 14px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--accent) 25%, transparent); border-top-color: var(--accent); animation: inbox-trigger-spin .9s linear infinite; }
.inbox-trigger-dot { position: absolute; top: -2px; right: -3px; width: 7px; height: 7px; border-radius: 50%; background: var(--info); box-shadow: 0 0 0 2px var(--canvas); }
.inbox-trigger-label { font-size: 13px; font-variant-numeric: tabular-nums; }
@keyframes inbox-trigger-spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .inbox-trigger-label { display: none; } .task-inbox-trigger.ant-btn, .task-inbox-trigger.busy, .task-inbox-trigger.unread { width: 36px; padding: 0; justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .inbox-trigger-ring { animation: none; } }
</style>
<style>
.task-inbox-popover .ant-popover-inner { padding: 0; border-radius: var(--radius-lg); overflow: hidden; }
.task-inbox-drawer .ant-drawer-content { border-radius: 18px 18px 0 0; }
.task-inbox-drawer .ant-drawer-body { position: relative; padding: 14px 0 0; }
.task-inbox-drawer .ant-drawer-body::before { content: ""; position: absolute; top: 6px; left: 50%; width: 36px; height: 4px; margin-left: -18px; border-radius: 2px; background: var(--line); }
</style>
