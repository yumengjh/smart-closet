<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { CheckOutlined, ExclamationOutlined, MinusOutlined, RightOutlined, InboxOutlined, PictureOutlined, CopyOutlined, BellOutlined } from '@ant-design/icons-vue'
import { closetApi, type ClosetTask } from '../services/api'
import { mediaUrl } from '../services/urls'
import { taskLabels, isProcessing } from '../domain/workflow'
import { useProcessingStore } from '../stores/processing'
import { useClosetStore } from '../stores/closet'
import type { WaitingEntry } from '../domain/waiting'
import { useNotificationStore } from '../stores/notifications'
import type { ClosetNotification } from '../notifications/api'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ visit: [entry: WaitingEntry]; go: [path: string]; notice: [item: ClosetNotification] }>()
// Notifications (likely duplicates, scan results): unread first, a few recent read ones after.
const notices = useNotificationStore()
const shownNotices = computed(() => [...notices.unreadItems, ...notices.items.filter(item => item.read).slice(0, Math.max(0, 3 - notices.unreadItems.length))].slice(0, 8))
const noticeIcon = (item: ClosetNotification) => item.kind.startsWith('DUPLICATE') ? CopyOutlined : BellOutlined
// Server-side history, so the panel also replaces the old standalone task-record link.
const history = ref<ClosetTask[] | null>(null), historyError = ref(false)
const needsCheck = (task: ClosetTask) => ['FAILED', 'UNKNOWN', 'NEEDS_REVIEW'].includes(task.status)
const stats = computed(() => history.value && [
  { key: 'running', label: '处理中', value: history.value.filter(task => isProcessing(task.status)).length },
  { key: 'review', label: '需检查', value: history.value.filter(needsCheck).length },
  { key: 'done', label: '已完成', value: history.value.filter(task => task.status === 'SUCCEEDED').length },
])
// Tasks already listed above from this session are not repeated in the history.
const recent = computed(() => (history.value || []).filter(task => !processing.entries.some(entry => entry.key === `task:${task.id}` || entry.childIds.includes(task.id))).slice(0, 4))
const statusTone = (task: ClosetTask) => isProcessing(task.status) ? 'running' : task.status === 'FAILED' ? 'failed' : needsCheck(task) ? 'review' : task.status === 'CANCELLED' ? 'muted' : 'done'
async function loadHistory() {
  try { history.value = await closetApi.tasks(); historyError.value = false } catch { historyError.value = true }
}
watch(() => props.open, visible => { if (visible) void loadHistory() }, { immediate: true })
function openTask(task: ClosetTask) { emit('go', task.garmentId ? `/garment/${task.garmentId}?task=${task.id}` : '/tasks') }
const processing = useProcessingStore(), closet = useClosetStore(), now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
const active = computed(() => processing.ordered.filter(entry => entry.state === 'processing'))
const finished = computed(() => processing.ordered.filter(entry => entry.state !== 'processing'))
const summary = computed(() => [processing.activeCount && `${processing.activeCount} 个处理中`, processing.unreadCount && `${processing.unreadCount} 个新结果`, notices.unread && `${notices.unread} 条提醒`].filter(Boolean).join(' · ') || '离开页面也会继续处理')
const stateIcon = { ready: CheckOutlined, attention: ExclamationOutlined, cancelled: MinusOutlined } as const
const actionLabel = (entry: WaitingEntry) => entry.state === 'processing' ? '进度' : entry.state === 'ready' ? '去核对' : '查看'
function waited(start: number) {
  const seconds = Math.max(0, Math.floor((now.value - start) / 1000)), minutes = Math.floor(seconds / 60)
  if (minutes < 1) return `${seconds} 秒`
  if (minutes < 60) return `${minutes} 分钟`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
  return `超过 ${Math.floor(minutes / 1440)} 天`
}
function started(start: number) {
  const date = new Date(start), time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return date.toDateString() === new Date(now.value).toDateString() ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(clock))
</script>
<template>
  <div class="inbox-panel">
    <header class="inbox-head"><div><strong>处理中心</strong><small>{{ summary }}</small></div><a-button v-if="notices.unread" type="link" size="small" @click="notices.readAll()">提醒全部已读</a-button></header>
    <div v-if="stats" class="inbox-stats" aria-label="最近 50 项任务统计"><a-button v-for="item in stats" :key="item.key" type="text" class="inbox-stat" :class="[item.key, { zero: !item.value }]" @click="emit('go', '/tasks')"><strong>{{ item.value }}</strong><small>{{ item.label }}</small></a-button></div>
    <a-alert v-if="processing.connectionError" type="warning" message="暂时无法更新进度，稍后继续查询" show-icon banner class="inbox-error" />
    <div class="inbox-scroll">
      <section v-if="shownNotices.length"><h3>提醒</h3>
        <a-button v-for="item in shownNotices" :key="item.id" type="text" block class="inbox-row notice" :class="{ unread: !item.read }" @click="emit('notice', item)">
          <span class="inbox-state"><component :is="noticeIcon(item)" /></span>
          <span class="inbox-copy"><strong>{{ item.title }}<i v-if="!item.read" class="inbox-unread" aria-label="未读" /></strong><span class="notice-body">{{ item.body }}</span><small>{{ started(item.createdAt) }}</small></span>
          <span class="inbox-action">查看<RightOutlined /></span>
        </a-button>
      </section>
      <div v-if="!processing.entries.length && history && !recent.length && !shownNotices.length" class="inbox-empty"><span class="inbox-empty-icon"><InboxOutlined /></span><strong>一切都处理好了</strong><small>上传衣物后，整理进度会出现在这里</small></div>
      <section v-if="active.length"><h3>进行中</h3>
        <a-button v-for="entry in active" :key="entry.key" type="text" block class="inbox-row processing" @click="emit('visit', entry)">
          <span class="inbox-state"><span class="inbox-ring" /></span>
          <span class="inbox-copy"><strong>{{ entry.title }}</strong><span>{{ entry.stage }}</span><span class="inbox-bar"><i /></span><small>已等待 {{ waited(entry.startedAt) }}</small></span>
          <span class="inbox-action">{{ actionLabel(entry) }}<RightOutlined /></span>
        </a-button>
      </section>
      <section v-if="finished.length"><h3>最近结果</h3>
        <a-button v-for="entry in finished" :key="entry.key" type="text" block class="inbox-row" :class="[entry.state, { unread: !entry.read }]" @click="emit('visit', entry)">
          <span class="inbox-state"><component :is="stateIcon[entry.state as keyof typeof stateIcon]" /></span>
          <span class="inbox-copy"><strong>{{ entry.title }}<i v-if="!entry.read" class="inbox-unread" aria-label="未读" /></strong><span>{{ entry.stage }}</span><small>{{ entry.note || started(entry.startedAt) }}</small></span>
          <span class="inbox-action">{{ actionLabel(entry) }}<RightOutlined /></span>
        </a-button>
      </section>
      <section v-if="recent.length"><h3>任务记录</h3>
        <a-button v-for="task in recent" :key="task.id" type="text" block class="inbox-row history" @click="openTask(task)">
          <span class="inbox-thumb"><img v-if="task.outputUrl || task.inputUrl" :src="mediaUrl(task.outputUrl || task.inputUrl)" alt="" loading="lazy" /><PictureOutlined v-else /></span>
          <span class="inbox-copy"><strong>{{ task.title || '新上传衣物' }}</strong><span>{{ task.mode }} · {{ started(Date.parse(task.createdAt)) }}</span></span>
          <span class="inbox-tag" :class="statusTone(task)">{{ taskLabels[task.status] }}</span>
        </a-button>
      </section>
      <p v-if="historyError" class="inbox-history-error">任务记录暂时无法读取</p>
    </div>
    <footer class="inbox-foot"><a-button size="small" @click="emit('go', '/pending')">未入柜<span v-if="closet.pendingCount" class="inbox-count">{{ closet.pendingCount }}</span></a-button><a-button type="link" size="small" class="inbox-all" @click="emit('go', '/tasks')">全部任务记录<RightOutlined /></a-button></footer>
    <small class="inbox-footnote">站内提醒仅在网站打开时生效，处理不受页面关闭影响</small>
  </div>
</template>
<style scoped>
.inbox-panel { display: flex; flex-direction: column; width: 360px; max-width: 100%; max-height: min(620px, calc(100dvh - 100px)); }
.inbox-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 10px; }
.inbox-head strong { display: block; font-size: 15px; font-weight: 600; color: var(--ink); }
.inbox-head small { display: block; margin-top: 2px; font-size: 12px; color: var(--muted); }
.inbox-error { margin: 0 12px 8px; border-radius: var(--radius-sm); font-size: 12px; }
.inbox-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 8px 8px; }
.inbox-scroll section + section { margin-top: 6px; }
.inbox-scroll h3 { margin: 6px 8px 4px; font-size: 11px; font-weight: 500; letter-spacing: .08em; color: var(--muted-subtle); }
.inbox-row.ant-btn { display: flex; align-items: center; gap: 12px; height: auto; padding: 10px 8px; border-radius: var(--radius-md); text-align: left; white-space: normal; }
.inbox-row.ant-btn:hover { background: var(--surface-alt); }
.inbox-row.unread { background: var(--info-bg); }
.inbox-state { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 50%; font-size: 14px; background: var(--surface-alt); color: var(--muted); }
.processing .inbox-state { background: var(--accent-soft); }
.ready .inbox-state { background: var(--success-bg); color: var(--success); }
.attention .inbox-state { background: var(--warning-bg); color: var(--warning); }
.notice .inbox-state { background: var(--warning-bg); color: var(--warning); }
.notice-body { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.inbox-ring { width: 16px; height: 16px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--accent) 25%, transparent); border-top-color: var(--accent); animation: inbox-spin .9s linear infinite; }
.inbox-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.inbox-copy strong { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inbox-copy > span { font-size: 12px; color: var(--muted-strong); overflow-wrap: anywhere; }
.inbox-copy small { font-size: 11px; color: var(--muted-subtle); font-variant-numeric: tabular-nums; }
.inbox-unread { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--info); }
.inbox-bar { position: relative; display: block; height: 3px; margin: 5px 0 3px; border-radius: 2px; background: var(--line); overflow: hidden; }
.inbox-bar i { position: absolute; inset: 0 auto 0 0; width: 35%; border-radius: 2px; background: var(--accent); animation: inbox-slide 1.6s cubic-bezier(.4,0,.2,1) infinite; }
.inbox-action { display: inline-flex; align-items: center; gap: 2px; flex: none; font-size: 12px; color: var(--muted); }
.inbox-action .anticon { font-size: 10px; }
.inbox-row:hover .inbox-action { color: var(--ink); }
.inbox-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 28px 16px 24px; text-align: center; }
.inbox-empty-icon { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 6px; border-radius: 50%; background: var(--surface-alt); color: var(--muted); font-size: 20px; }
.inbox-empty strong { font-size: 13px; font-weight: 500; color: var(--ink); }
.inbox-empty small { font-size: 12px; color: var(--muted); }
.inbox-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--line); }
.inbox-all.ant-btn { display: inline-flex; align-items: center; gap: 4px; padding-inline: 4px; }.inbox-all .anticon { font-size: 10px; }
.inbox-footnote { display: block; padding: 0 16px 10px; font-size: 11px; color: var(--muted-subtle); }
.inbox-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 12px 8px; }
.inbox-stat.ant-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 0; height: auto; padding: 8px 10px; border-radius: var(--radius-md); background: var(--surface-alt); }
.inbox-stat strong { font-size: 18px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--ink); }
.inbox-stat small { font-size: 11px; color: var(--muted); }
.inbox-stat.running:not(.zero) strong { color: var(--accent); }
.inbox-stat.review:not(.zero) { background: var(--warning-bg); }.inbox-stat.review:not(.zero) strong { color: var(--warning); }
.inbox-stat.zero strong { color: var(--muted-subtle); }
.inbox-thumb { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: var(--radius-sm); overflow: hidden; background: var(--paper); color: var(--muted-subtle); }
.inbox-thumb img { width: 100%; height: 100%; object-fit: contain; }
.inbox-tag { flex: none; padding: 1px 7px; border-radius: 999px; font-size: 11px; line-height: 18px; background: var(--surface-alt); color: var(--muted-strong); }
.inbox-tag.running { background: var(--info-bg); color: var(--info); }.inbox-tag.review { background: var(--warning-bg); color: var(--warning); }.inbox-tag.done { background: var(--success-bg); color: var(--success); }.inbox-tag.failed { background: var(--danger-bg); color: var(--danger); }
.inbox-history-error { margin: 8px; font-size: 12px; color: var(--muted); }
.inbox-count { margin-left: 6px; padding: 0 6px; border-radius: 999px; font-size: 11px; line-height: 16px; background: var(--surface-alt); color: var(--muted-strong); }
@keyframes inbox-spin { to { transform: rotate(360deg); } }
@keyframes inbox-slide { from { transform: translateX(-100%); } to { transform: translateX(290%); } }
@media (max-width: 767px) { .inbox-panel { width: 100%; max-height: 72dvh; } .inbox-row.ant-btn { padding: 12px 8px; } .inbox-footnote { padding-bottom: max(10px, env(safe-area-inset-bottom)); } }
@media (prefers-reduced-motion: reduce) { .inbox-ring, .inbox-bar i { animation: none; } .inbox-bar i { width: 100%; opacity: .4; } }
</style>
