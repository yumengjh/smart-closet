<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { platformRequest, type RenderJob } from '../services/platform'
const { modal } = App.useApp()
const jobs = ref<RenderJob[]>([])
const error = ref('')
const cancelling = ref('')
const active = new Set(['QUEUED','WAITING_RESOURCE','RUNNING','CANCEL_REQUESTED'])
const visible = computed(() => jobs.value.filter(j => active.has(j.status) || ['FAILED','UNKNOWN','DELETE_PENDING'].includes(j.status)).slice(0,20))
const states: Record<string,string> = {QUEUED:'排队中',WAITING_RESOURCE:'等待资源',RUNNING:'生成中',CANCEL_REQUESTED:'停止发布中',FAILED:'未完成',UNKNOWN:'结果未知',DELETE_PENDING:'正在清理图片'}
let timer: ReturnType<typeof setTimeout> | undefined
let alive = false
async function load() {
  if (!alive || document.hidden) return
  try { jobs.value = await platformRequest('/api/me/image-render-jobs'); error.value = '' }
  catch(e) { error.value = String(e) }
}
function poll() { if(alive) timer=setTimeout(async()=>{await load();poll()},error.value?15000:5000) }
function cancel(job: RenderJob) {
  modal.confirm({title:'取消这次生成？',content:'本平台将停止后续发布；已发出的请求无法保证上游停止或退还额度。',okText:'取消任务',cancelText:'继续等待',async onOk(){cancelling.value=job.id;try{await platformRequest(`/api/me/image-render-jobs/${job.id}/cancel`,'POST',{});await load()}finally{cancelling.value=''}}})
}
const title = (job: RenderJob) => job.purpose === 'BASELINE' ? '模特形象' : job.summary?.kind === 'ADJUST' ? '身材调整图' : ['OOTD 穿搭图', job.summary?.pose].filter(Boolean).join(' · ')
const tone = (job: RenderJob) => active.has(job.status) ? 'running' : job.status === 'FAILED' ? 'failed' : 'quota'
function when(ms: number) {
  const date = new Date(ms), time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return date.toDateString() === new Date().toDateString() ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}
onMounted(async()=>{alive=true;await load();poll();window.addEventListener('closet-render-changed',load)})
onUnmounted(()=>{alive=false;clearTimeout(timer);window.removeEventListener('closet-render-changed',load)})
</script>
<template>
  <section v-if="visible.length || error" class="render-card" aria-label="人物与穿搭图生成">
    <header class="render-head">
      <div><h2>人物与穿搭图生成</h2><p>只列出生成中或需要检查的图片，做好的结果保存在各自页面。</p></div>
      <span class="render-links"><RouterLink to="/settings?section=personal">我的模特</RouterLink><RouterLink to="/ootd">OOTD 记录</RouterLink></span>
    </header>
    <a-alert v-if="error" type="warning" :message="`生成状态暂时无法更新：${error}`" show-icon class="render-alert" />
    <ul class="render-list">
      <li v-for="job in visible" :key="job.id" class="render-row">
        <div class="render-copy">
          <div class="render-title"><strong>{{ title(job) }}</strong><span class="render-state" :class="tone(job)">{{ states[job.status] || job.status }}</span></div>
          <p v-if="job.status === 'UNKNOWN'">已经发出，结果尚不确定；为免重复扣额度，不会自动重发。</p>
          <p v-else-if="job.error">{{ job.error }}</p>
          <small>开始于 {{ when(job.createdAt) }}</small>
        </div>
        <span class="render-actions">
          <RouterLink v-if="job.purpose === 'OOTD' && ['UNKNOWN','FAILED'].includes(job.status)" :to="{ path: '/ootd', query: { job: job.id } }"><a-button size="small" type="primary">查看并重新生成</a-button></RouterLink>
          <a-button v-if="['QUEUED','WAITING_RESOURCE','RUNNING','UNKNOWN'].includes(job.status)" size="small" :loading="cancelling === job.id" @click="cancel(job)">取消生成</a-button>
        </span>
      </li>
    </ul>
  </section>
</template>
<style scoped>
.render-actions{display:inline-flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.render-card { margin: 0 0 20px; padding: 18px 20px 8px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.render-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; }
.render-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
.render-head p { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
.render-links { display: inline-flex; gap: 14px; flex: none; font-size: 13px; }
.render-alert { margin-bottom: 12px; }
.render-list { margin: 0; padding: 0; list-style: none; }
.render-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid var(--line); }
.render-copy { min-width: 0; }
.render-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.render-title strong { font-size: 14px; font-weight: 500; color: var(--ink); }
.render-state { padding: 0 8px; border-radius: 999px; font-size: 12px; line-height: 20px; background: var(--surface-alt); color: var(--muted-strong); }
.render-state.running { background: var(--info-bg); color: var(--info); }
.render-state.quota { background: var(--warning-bg); color: var(--warning); }
.render-state.failed { background: var(--danger-bg); color: var(--danger); }
.render-copy p { margin: 4px 0 0; font-size: 12px; line-height: 1.6; color: var(--muted-strong); }
.render-copy small { display: block; margin-top: 2px; font-size: 12px; color: var(--muted-subtle); font-variant-numeric: tabular-nums; }
@media (max-width: 767px) { .render-card { padding: 16px 16px 6px; } .render-head { flex-direction: column; gap: 8px; } }
</style>
