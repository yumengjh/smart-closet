<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LoadingOutlined, CheckCircleOutlined, BellOutlined } from '@ant-design/icons-vue'
import { useProcessingStore } from '../stores/processing'
import { useClosetStore } from '../stores/closet'
import { elapsedLabel, type WaitingEntry } from '../domain/waiting'
import TaskNotice from './TaskNotice.vue'
const processing = useProcessingStore(), closet = useClosetStore(), router = useRouter()
const open = ref(false), now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
function show() { open.value = true; void processing.refresh(true); void closet.refreshCounts() }
function visit(entry: WaitingEntry) { processing.viewed(entry); open.value = false; void router.push(entry.href) }
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(clock))
</script>
<template>
  <a-button class="task-inbox-trigger" :type="processing.unreadCount ? 'primary' : 'text'" @click="show"><BellOutlined /><span>{{ processing.activeCount ? `${processing.activeCount} 个处理中` : processing.unreadCount ? `${processing.unreadCount} 个新结果` : '站内任务' }}</span><a-badge v-if="processing.activeCount && processing.unreadCount" :count="processing.unreadCount" /></a-button>
  <a-modal v-model:open="open" title="衣物处理任务" :footer="null" :width="600">
    <p class="inbox-intro">离开处理页面也会继续。完成后会在站内提醒，核对后再收进衣柜。</p>
    <TaskNotice @opened="open=false" />
    <a-alert v-if="processing.connectionError" type="warning" message="暂时无法更新进度，保留最后已知状态；稍后会继续查询。" show-icon class="inbox-error" />
    <a-empty v-if="!processing.entries.length" description="没有正在处理的新任务" />
    <div class="inbox-list"><article v-for="entry in processing.ordered" :key="entry.key" class="inbox-item"><div class="inbox-status"><LoadingOutlined v-if="entry.state === 'processing'" spin /><CheckCircleOutlined v-else-if="entry.state === 'ready'" /><BellOutlined v-else /></div><div class="inbox-copy"><strong>{{ entry.title }}</strong><p>{{ entry.stage }}</p><small v-if="entry.state === 'processing'">已等待 {{ elapsedLabel(entry.startedAt, now) }}</small><small v-else-if="entry.note">{{ entry.note }}</small></div><a-button @click="visit(entry)">{{ entry.state === 'processing' ? '查看进度' : entry.state === 'ready' ? '去核对' : '查看任务' }}</a-button></article></div>
    <div class="inbox-links"><a-button @click="open=false;router.push('/pending')">未入柜{{ closet.pendingCount ? ` · ${closet.pendingCount}` : '' }}</a-button><a-button type="link" @click="open=false;router.push('/tasks')">全部任务记录</a-button></div>
    <small class="inbox-footnote">站内提醒仅在网站打开时生效，重新打开后可从“未入柜”找回结果。</small>
  </a-modal>
</template>
<style scoped>
.task-inbox-trigger{display:inline-flex;align-items:center;gap:6px}.inbox-intro{font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:20px}.inbox-error{margin-bottom:16px}.inbox-list{display:grid}.inbox-item{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:1px solid var(--line)}.inbox-status{font-size:20px;color:var(--accent)}.inbox-copy{flex:1;min-width:0}.inbox-copy strong{font-size:14px}.inbox-copy p{margin:5px 0;color:var(--muted);font-size:13px;overflow-wrap:anywhere}.inbox-copy small,.inbox-footnote{font-size:12px;color:var(--muted);line-height:1.7}.inbox-links{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:20px 0 12px}.inbox-footnote{display:block}@media(max-width:400px){.inbox-item{gap:8px}.inbox-status{font-size:16px}.inbox-copy strong{font-size:13px}}
</style>
