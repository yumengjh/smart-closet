<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { App, Button } from 'ant-design-vue'
import { BellOutlined } from '@ant-design/icons-vue'
import { useProcessingStore } from '../stores/processing'
import { useClosetStore } from '../stores/closet'
import { useNotificationStore } from '../stores/notifications'
import type { WaitingEntry } from '../domain/waiting'
import type { ClosetNotification } from '../notifications/api'
import TaskInboxPanel from './TaskInboxPanel.vue'
import { useSendOffStore } from '../stores/sendOff'
const processing = useProcessingStore(), closet = useClosetStore(), notices = useNotificationStore(), router = useRouter(), { notification } = App.useApp()
const open = ref(false)
// A generation bundle just flew in: bounce once so the eye follows it here.
const sendOff = useSendOffStore(), landing = ref(false)
let landingTimer: ReturnType<typeof setTimeout> | undefined
watch(() => sendOff.landed, () => { landing.value = false; clearTimeout(landingTimer); requestAnimationFrame(() => { landing.value = true; landingTimer = setTimeout(() => { landing.value = false }, 900) }) })
// Anchored popover on desktop; phones get a bottom drawer within thumb reach.
const phoneQuery = window.matchMedia('(max-width: 767px)'), phone = ref(phoneQuery.matches)
// The server count also covers tasks started in another tab or before a reload.
const running = computed(() => Math.max(processing.activeCount, closet.taskCount))
const unread = computed(() => processing.unreadCount + notices.unread)
const label = computed(() => running.value ? `${running.value} 个处理中` : processing.unreadCount ? `${processing.unreadCount} 个新结果` : notices.unread ? `${notices.unread} 条提醒` : '')
function show(visible: boolean) { open.value = visible; if (visible) { void processing.refresh(true); void closet.refreshCounts(); void notices.refresh() } }
function openNotice(item: ClosetNotification) { void notices.read(item); open.value = false; notification.destroy(`notice:${item.id}`); void router.push(item.href || '/settings?section=tidy') }
// A new notification (e.g. a likely duplicate found after adoption) pops up once, like a finished task.
watch(() => notices.latest, item => {
  if (!item) return
  notification.open({
    key: `notice:${item.id}`, class: 'task-toast attention', duration: 10, placement: window.innerWidth < 768 ? 'top' : 'topRight',
    message: item.title, description: item.body,
    btn: h(Button, { size: 'small', type: 'primary', onClick: () => openNotice(item) }, () => '去看看'),
    onClose: () => notices.dismissLatest(),
  })
})
function visit(entry: WaitingEntry) { processing.viewed(entry); open.value = false; void router.push(entry.href) }
function go(path: string) { open.value = false; void router.push(path) }
function media() { phone.value = phoneQuery.matches; open.value = false }
onMounted(() => { phoneQuery.addEventListener('change', media); notices.start() })
onUnmounted(() => { clearTimeout(landingTimer); phoneQuery.removeEventListener('change', media); notices.stop() })
</script>
<template>
  <a-popover :open="open && !phone" trigger="click" placement="bottomRight" :arrow="false" overlay-class-name="task-inbox-popover" @update:open="(value: boolean) => !phone && show(value)">
    <a-tooltip :title="label || open ? '' : '处理中心与提醒'">
      <a-button type="text" class="task-inbox-trigger" :class="{ busy: running, unread: !running && unread, landing }" :aria-label="label ? `衣物处理任务：${label}` : '衣物处理任务'" :aria-expanded="open" @click="phone && show(!open)">
        <span class="inbox-glyph"><span v-if="running" class="inbox-trigger-ring" aria-hidden="true" /><BellOutlined v-else /><i v-if="unread" class="inbox-trigger-dot" /></span>
        <span v-if="label" class="inbox-trigger-label">{{ label }}</span>
      </a-button>
    </a-tooltip>
    <template #content><TaskInboxPanel :open="open" @visit="visit" @go="go" @notice="openNotice" /></template>
  </a-popover>
  <a-drawer v-if="phone" :open="open" placement="bottom" height="auto" :closable="false" root-class-name="task-inbox-drawer" @close="open = false"><TaskInboxPanel :open="open" @visit="visit" @go="go" @notice="openNotice" /></a-drawer>
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
.task-inbox-trigger.landing { animation: inbox-landing .8s cubic-bezier(.2, .9, .3, 1.4); }
.task-inbox-trigger.landing::after { content: ""; position: absolute; inset: -2px; border-radius: inherit; box-shadow: 0 0 0 0 var(--accent); animation: inbox-ripple .8s ease-out; pointer-events: none; }
@keyframes inbox-landing { 0% { transform: scale(1); } 30% { transform: scale(1.18); } 55% { transform: scale(.94); } 100% { transform: scale(1); } }
@keyframes inbox-ripple { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); } to { box-shadow: 0 0 0 14px transparent; } }
@media (max-width: 640px) { .inbox-trigger-label { display: none; } .task-inbox-trigger.ant-btn, .task-inbox-trigger.busy, .task-inbox-trigger.unread { width: 36px; padding: 0; justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .inbox-trigger-ring, .task-inbox-trigger.landing, .task-inbox-trigger.landing::after { animation: none; } }
</style>
<style>
.task-inbox-popover .ant-popover-inner { padding: 0; border-radius: var(--radius-lg); overflow: hidden; }
.task-inbox-drawer .ant-drawer-content { border-radius: 18px 18px 0 0; }
.task-inbox-drawer .ant-drawer-body { position: relative; padding: 14px 0 0; }
.task-inbox-drawer .ant-drawer-body::before { content: ""; position: absolute; top: 6px; left: 50%; width: 36px; height: 4px; margin-left: -18px; border-radius: 2px; background: var(--line); }
</style>
