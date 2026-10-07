<script setup lang="ts">
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
onMounted(async()=>{alive=true;await load();poll();window.addEventListener('closet-render-changed',load)})
onUnmounted(()=>{alive=false;clearTimeout(timer);window.removeEventListener('closet-render-changed',load)})
</script>
<template>
  <section class="render-task-overview" aria-label="个人图片任务">
    <a-space wrap><h2>个人图片任务</h2><RouterLink to="/settings?section=personal">基准人物</RouterLink><RouterLink to="/ootd">OOTD 与生成记录</RouterLink></a-space>
    <a-alert v-if="error" type="warning" :message="error" show-icon />
    <p v-if="!visible.length" class="muted">暂无进行中或需要检查的人物、OOTD 任务。已完成结果保存在各自页面。</p>
    <article v-for="job in visible" :key="job.id">
      <div><strong>{{job.purpose==='BASELINE'?'基准人物':'OOTD 穿搭图'}}</strong> <a-tag>{{states[job.status]||job.status}}</a-tag><p class="muted">{{new Date(job.createdAt).toLocaleString()}}</p><p v-if="job.error">{{job.error}}</p><p v-if="job.status==='UNKNOWN'">已派发，结果尚不确定；不会自动重发。</p></div>
      <a-button v-if="['QUEUED','WAITING_RESOURCE','RUNNING','UNKNOWN'].includes(job.status)" size="small" :loading="cancelling===job.id" @click="cancel(job)">取消任务</a-button>
    </article>
  </section>
</template>
<style scoped>.render-task-overview{margin:24px 0}.render-task-overview h2{margin:0}.render-task-overview article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid var(--border-color,#ddd)}.render-task-overview article p{margin:6px 0}</style>
