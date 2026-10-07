<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { App, Empty } from 'ant-design-vue'
import { ReloadOutlined, UserOutlined } from '@ant-design/icons-vue'
import { closetApi } from '../services/api'
import { mediaUrl } from '../services/urls'
import { platformRequest, PlatformRequestError, type RenderSubmission, type Baseline, type Capability, type RenderJob, type Review } from '../services/platform'
import type { Outfit } from '../domain/outfit'
import { createUuid } from '../domain/id'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
const route=useRoute();const { message,modal }=App.useApp()
const outfits=ref<Outfit[]>([]);const baselines=ref<Baseline[]>([]);const capabilities=ref<Capability[]>([]);const jobs=ref<RenderJob[]>([])
const outfitId=ref(String(route.query.outfit||''));const baselineId=ref('');const model=ref('');const selected=ref<string[]>([])
const multiLayer=ref(false);const wearRoles=ref<Record<string,string>>({});const olderBaseline=ref(false)
const loading=ref(true);const error=ref('');const busy=ref(false);const review=ref<Review|null>(null)
const preparation=ref<{id:string;review:Review;expiresAt:number;quotaUnits:number}|null>(null);const confirmOpen=ref(false);const key=ref(createUuid())
const feedbackJob=ref<RenderJob|null>(null);const feedback=ref('');let timer:ReturnType<typeof setInterval>|undefined
const accessoryOptions=[{value:'ACCESSORY:EAR',label:'耳部'},{value:'ACCESSORY:NECK',label:'颈部'},{value:'ACCESSORY:WRIST',label:'手腕'},{value:'ACCESSORY:HAND_LEFT',label:'左手'},{value:'ACCESSORY:HAND_RIGHT',label:'右手'},{value:'ACCESSORY:TIE',label:'领带'}]
const current=computed(()=>outfits.value.find(o=>o.id===outfitId.value));const person=computed(()=>baselines.value.find(b=>b.id===baselineId.value))
const available=computed(()=>capabilities.value.filter(c=>c.verified&&c.purpose==='OOTD'))
const capability=computed(()=>available.value.find(c=>c.provider+':'+c.model===model.value))
const filledSlots=computed(()=>review.value?.slots.filter(slot=>slot.items.length||slot.state==='CONFLICT'||slot.state==='UNKNOWN')||[])
const emptySlots=computed(()=>review.value?.slots.filter(slot=>!filledSlots.value.includes(slot))||[])
const garments=computed(()=>[...new Map((current.value?.scene.elements||[]).filter(e=>e.kind!=='PERSON_PART').map(e=>[e.garmentId,e])).values()])
async function load(){try{const [o,b,c,j]=await Promise.all([closetApi.outfits(),platformRequest<Baseline[]>('/api/me/person-baselines'),platformRequest<Capability[]>('/api/render-capabilities'),platformRequest<RenderJob[]>('/api/ootd/jobs')]);outfits.value=o;baselines.value=b.filter(p=>p.status==='CONFIRMED');capabilities.value=c;if(!available.value.some(c=>c.provider+':'+c.model===model.value))model.value=available.value[0]?available.value[0].provider+':'+available.value[0].model:'';jobs.value=j;baselineId.value ||= b.find(p=>p.currentDefault)?.id||'';error.value=''}catch(e){error.value=String(e)}finally{loading.value=false}}
async function refresh(){if(document.hidden)return;try{jobs.value=await platformRequest('/api/ootd/jobs')}catch{}}
watch(current,()=>{selected.value=garments.value.map(g=>g.garmentId);review.value=null;wearRoles.value={}})
watch([selected,multiLayer,wearRoles,model,baselineId,olderBaseline],()=>{preparation.value=null;confirmOpen.value=false},{deep:true})
async function check(nested=false){if(!current.value)return;busy.value=true;review.value=null;try{review.value=await platformRequest<Review>('/api/outfit-reviews','POST',{outfitId:current.value.id,revision:current.value.revision,selectedGarmentIds:selected.value,multiLayer:multiLayer.value,wearRoles:wearRoles.value});error.value=''}catch(e){error.value=String(e)}finally{if(!nested)busy.value=false}}
async function prepare(){if(!current.value||!person.value||!capability.value)return;busy.value=true;try{await check(true);if(!review.value||review.value.blockers.length)return;preparation.value=await platformRequest('/api/ootd/preparations','POST',{outfitId:current.value.id,revision:current.value.revision,baselineId:person.value.id,baselineRevision:person.value.revision,selectedGarmentIds:selected.value,multiLayer:multiLayer.value,wearRoles:wearRoles.value,provider:capability.value.provider,model:capability.value.model,useOlderBaseline:olderBaseline.value});key.value=createUuid();confirmOpen.value=true}catch(e){error.value=String(e)}finally{busy.value=false}}
async function accepted(){confirmOpen.value=false;preparation.value=null;error.value='';message.success('已提交单张 OOTD，离开页面后任务继续。');await refresh()}
async function generate(){
  if(!preparation.value||busy.value)return
  busy.value=true;error.value=''
  try{await platformRequest('/api/ootd/jobs','POST',{preparationId:preparation.value.id},key.value);await accepted()}
  catch(e){
    if(e instanceof PlatformRequestError&&e.uncertain){
      try{
        const original=await platformRequest<RenderSubmission>(`/api/me/image-render-submissions/${encodeURIComponent(key.value)}`,'GET',undefined,undefined,{timeoutMs:10000})
        if(original.found&&original.job){await accepted();return}
        error.value='暂未查到本次任务。可先查看生成记录；在当前窗口再次确认会复用原提交编号，不创建重复任务。'
      }catch{error.value='连接仍未恢复，尚无法确认提交结果。请先查看生成记录；不要关闭窗口后重新准备生成。当前窗口保留原提交编号。'}
    }else error.value=e instanceof Error?e.message:String(e)
  }finally{busy.value=false}
}
async function cancel(job:RenderJob){try{await platformRequest(`/api/ootd/jobs/${job.id}/cancel`,'POST',{});await refresh();message.info('已请求停止发布，无法保证上游停止或退还额度。')}catch(e){message.error(String(e))}}
function remove(job:RenderJob){modal.confirm({title:'永久删除这条 OOTD？',content:'图片和内部副本将清理，不进入回收站。来源搭配、人物和原照保留。',okText:'永久删除',cancelText:'取消',async onOk(){await platformRequest(`/api/ootd/jobs/${job.id}`,'DELETE');await refresh()}})}
function openFeedback(job:RenderJob){feedbackJob.value=job;feedback.value=job.feedback||''}
async function saveFeedback(){if(!feedbackJob.value)return;try{await platformRequest(`/api/ootd/jobs/${feedbackJob.value.id}/feedback`,'PUT',{content:feedback.value});feedbackJob.value=null;await refresh();message.success('反馈已保存，不会自动重新生成。')}catch(e){message.error(String(e))}}
const states:Record<string,string>={QUEUED:'排队中',WAITING_RESOURCE:'等待生成资源',RUNNING:'生成中',SUCCEEDED:'已完成',FAILED:'未完成',UNKNOWN:'已发送，结果未知',CANCEL_REQUESTED:'正在停止发布',CANCELLED:'已取消',DELETED:'已删除',DELETE_PENDING:'正在清理图片'}
onMounted(()=>{void load();timer=setInterval(refresh,5000)})
onUnmounted(()=>clearInterval(timer))
</script>
<template>
  <div class="page-heading simple-heading ootd-heading">
    <div><p class="eyebrow">个人穿搭预览</p><h1>OOTD 穿搭图</h1><p class="page-subtitle">用已保存搭配和自己的基准人物生成单张全身图。结果随账号保存，直到你删除。</p></div>
    <RouterLink v-slot="{ href, navigate }" to="/settings?section=personal" custom><a-button class="ootd-manage" :href="href" @click="navigate"><UserOutlined /> 管理基准人物</a-button></RouterLink>
  </div>
  <a-alert v-if="error" type="error" :message="error" show-icon style="margin-bottom:16px" />
  <div v-if="loading" class="ootd-card"><a-skeleton active /></div>
  <div v-else class="ootd-workspace">
    <div class="ootd-steps">
      <section class="ootd-card">
        <header class="ootd-card-head"><span class="ootd-step">1</span><div><h2>选择本次穿搭</h2><p>使用组合台中已保存的搭配。</p></div></header>
        <a-form layout="vertical">
          <a-form-item label="已保存搭配" :extra="current ? `使用已保存版本 ${current.revision}，本机草稿不会自动替代它。` : undefined"><a-select :value="outfitId || undefined" @update:value="outfitId=$event" aria-label="已保存搭配" :options="outfits.map(o=>({value:o.id,label:o.name}))" placeholder="先在组合台保存搭配" /></a-form-item>
        </a-form>
        <template v-if="current">
          <h3 class="ootd-sub-title">本次一名人物实际穿的物品</h3>
          <a-checkbox-group v-model:value="selected" class="ootd-selections"><a-checkbox v-for="g in garments" :key="g.garmentId" :value="g.garmentId">{{ g.garmentLabel }}</a-checkbox></a-checkbox-group>
          <p class="ootd-note">多套或多人物的画板，请只勾选本次一套。重复贴纸只穿一次，基础人物衣服不会补齐缺少的物品。</p>
          <a-checkbox v-model:checked="multiLayer">明确启用打底＋主体＋外搭的多层穿法</a-checkbox>
          <div v-if="multiLayer" class="ootd-wear-roles"><div v-for="g in garments.filter(g=>selected.includes(g.garmentId))" :key="g.garmentId"><span>{{g.garmentLabel}}</span><a-select v-model:value="wearRoles[g.garmentId]" allow-clear :options="[{value:'INNER',label:'打底内层'}]" placeholder="默认由真实品类判断" /></div></div>
        </template>
      </section>

      <section class="ootd-card">
        <header class="ootd-card-head"><span class="ootd-step">2</span><div><h2>人物与模型</h2><p>选择已确认的基准人物和已验证的生成模型。</p></div></header>
        <div class="ootd-person-row">
          <div class="ootd-person"><img v-if="person?.mediaUrl" :src="mediaUrl(person.mediaUrl)" alt="本次使用的基准人物" /><UserOutlined v-else /></div>
          <a-form layout="vertical" class="ootd-person-form">
            <a-form-item label="已确认基准人物"><a-select :value="baselineId || undefined" @update:value="baselineId=$event" aria-label="已确认基准人物" :options="baselines.map(b=>({value:b.id,label:(b.currentDefault?'默认人物':'已确认人物')+' · '+new Date(b.createdAt).toLocaleDateString()}))" placeholder="先生成并确认自己的基准人物" /></a-form-item>
            <a-checkbox v-model:checked="olderBaseline">资料更新后，明确继续使用所选旧人物</a-checkbox>
          </a-form>
        </div>
        <a-form layout="vertical" style="margin-top:20px">
          <a-form-item label="已验证生成模型"><a-select :value="model || undefined" @update:value="model=$event" aria-label="已验证生成模型" :options="available.map(c=>({value:c.provider+':'+c.model,label:c.provider+' / '+c.model+'（最多 '+c.maxReferences+' 张参考）'}))" placeholder="选择模型" /></a-form-item>
        </a-form>
        <a-alert v-if="!available.length" type="info" message="尚无已验证 OOTD 模型。仍可免费检查搭配；不会自动识图、补图或换模型。" style="margin-top:12px" />
      </section>

      <div class="ootd-actions">
        <p class="ootd-note">{{ !current ? '先选择已保存搭配' : !person ? '先选择已确认基准人物' : !capability ? '先选择生成模型' : '先免费检查，再准备生成单张图片' }}</p>
        <a-space wrap><a-button :loading="busy" :disabled="!current" @click="check()">免费穿搭检查</a-button><a-button type="primary" :loading="busy" :disabled="!current||!person||!capability" @click="prepare">准备生成</a-button></a-space>
      </div>
    </div>

    <aside class="ootd-card ootd-preview">
      <header class="ootd-card-head"><div><h2>搭配预览与检查</h2><p>{{ current ? current.name : '尚未选择搭配' }}</p></div></header>
      <OutfitThumbnail v-if="current" :scene="current.scene" :title="current.name" :resolution="720" />
      <a-empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" description="选择已保存搭配，查看原搭配与检查结果" />
      <template v-if="review">
        <h3 class="ootd-sub-title">全身分布</h3>
        <a-alert v-for="issue in review.blockers" :key="issue.message" type="error" :message="issue.message" :description="issue.action" show-icon style="margin-bottom:8px" />
        <a-alert v-for="issue in review.warnings" :key="issue.code" type="warning" :message="issue.message" show-icon style="margin-bottom:8px" />
        <a-descriptions :column="1" size="small" bordered><a-descriptions-item v-for="slot in filledSlots" :key="slot.role" :label="slot.label">{{slot.items.map(i=>i.label).join('、')||'未选择'}} <div v-for="i in slot.items.filter(i=>i.role==='ACCESSORY')" :key="i.garmentId" class="ootd-accessory"><span>{{i.label}}</span> <a-select v-model:value="wearRoles[i.garmentId]" :options="accessoryOptions" placeholder="确认佩戴位置后重新检查" /></div> <a-tag v-if="slot.state==='CONFLICT'||slot.state==='UNKNOWN'" color="error">{{slot.state==='UNKNOWN'?'资料未确认':'冲突'}}</a-tag></a-descriptions-item></a-descriptions>
        <p v-if="emptySlots.length" class="ootd-note">未选择：{{ emptySlots.map(slot => slot.label).join('、') }}</p>
      </template>
    </aside>
  </div>

  <section class="ootd-records">
    <header class="ootd-records-head"><div><h2>我的生成记录</h2><p class="ootd-note">共 {{ jobs.length }} 张，刷新和换设备仍可查看。</p></div><a-button @click="refresh"><ReloadOutlined /> 刷新</a-button></header>
    <div v-if="!jobs.length" class="ootd-card"><a-empty description="已生成的图片会保存在这里，刷新和换设备仍可查看" /></div>
    <div v-else class="ootd-results">
      <article v-for="job in jobs" :key="job.id" class="ootd-result">
        <div class="ootd-result-media"><img v-if="job.mediaUrl" :src="mediaUrl(job.mediaUrl)" alt="个人 OOTD 生成结果" /><a-tag v-else>{{ states[job.status]||job.status }}</a-tag></div>
        <div class="ootd-result-body">
          <div class="ootd-result-meta"><a-tag :color="job.status==='SUCCEEDED'?'success':job.status==='FAILED'?'error':job.status==='UNKNOWN'?'warning':'processing'">{{ states[job.status]||job.status }}</a-tag><span>{{new Date(job.createdAt).toLocaleString()}}</span></div>
          <p v-if="job.error" class="ootd-result-error">{{job.error}}</p>
          <p v-if="job.status==='UNKNOWN'" class="ootd-note">不会自动重发请求。请核对上游后，再明确决定是否新建生成。</p>
          <div class="ootd-result-actions"><a-button v-if="['QUEUED','RUNNING','WAITING_RESOURCE','UNKNOWN'].includes(job.status)" size="small" @click="cancel(job)">取消任务</a-button><a-button v-if="job.status==='SUCCEEDED'" size="small" @click="openFeedback(job)">结果反馈</a-button><a-button size="small" danger @click="remove(job)">永久删除</a-button></div>
        </div>
      </article>
    </div>
  </section>
  <a-modal v-model:open="confirmOpen" title="生成一张 OOTD" ok-text="确认生成单张" cancel-text="取消" :confirm-loading="busy" @ok="generate"><template v-if="preparation"><a-alert v-if="error" type="error" :message="error" show-icon role="status" aria-live="polite" style="margin-bottom:16px" /><p>将使用所选已保存搭配、已确认人物和以下衣物。消耗 {{ preparation.quotaUnits }} 个图像额度，不自动重生。</p><ul><li v-for="i in preparation.review.items" :key="i.garmentId">{{i.label}}</li></ul><a-alert v-for="issue in preparation.review.warnings" :key="issue.code" type="warning" :message="issue.message" style="margin-bottom:8px" /><p>图像是穿搭视觉预览，需核对人物、衣服与花纹；不作为真实尺码或合身保证。</p></template></a-modal>
  <a-modal :open="!!feedbackJob" title="反馈生成结果" ok-text="保存反馈" cancel-text="取消" @ok="saveFeedback" @cancel="feedbackJob=null"><a-textarea v-model:value="feedback" :maxlength="1000" :auto-size="{minRows:3,maxRows:8}" placeholder="人物不像、衣服不对、多了一件、花纹变化、基础服饰残留……" /><p class="muted">反馈不会自动触发生图。再次生成请准备新的任务并确认。</p></a-modal>
</template>
<style scoped>
.ootd-manage { flex-shrink: 0; }
.ootd-workspace { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: var(--space-6); align-items: start; }
.ootd-steps { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.ootd-card { min-width: 0; padding: var(--space-6); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.ootd-card-head { display: flex; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-5); }
.ootd-card-head h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.5; }
.ootd-card-head p { margin-top: 2px; font-size: 13px; color: var(--muted-copy); }
.ootd-step { display: grid; flex-shrink: 0; place-items: center; width: 24px; height: 24px; margin-top: 1px; border-radius: 50%; background: var(--action-bg); color: var(--action-fg); font-size: 12px; font-weight: 600; }
.ootd-card :deep(.ant-form-item:last-child) { margin-bottom: 0; }
.ootd-sub-title { margin: var(--space-5) 0 var(--space-3); font-size: 14px; font-weight: 600; }
.ootd-note { margin: var(--space-3) 0; font-size: 13px; line-height: 1.7; color: var(--muted-copy); }
.ootd-selections { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-2); width: 100%; }
.ootd-selections :deep(.ant-checkbox-wrapper) { margin: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-alt); }
.ootd-wear-roles > div { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 10px 0; border-bottom: 1px solid var(--line); }
.ootd-wear-roles :deep(.ant-select) { min-width: 200px; }
.ootd-person-row { display: flex; align-items: flex-start; gap: var(--space-5); }
.ootd-person { display: grid; flex-shrink: 0; place-items: center; width: 104px; height: 156px; overflow: hidden; border-radius: var(--radius-md); background: var(--surface-alt); color: var(--muted-subtle); font-size: 28px; }
.ootd-person img { display: block; width: 100%; height: 100%; object-fit: contain; }
.ootd-person-form { flex: 1; min-width: 0; }
.ootd-person-form :deep(.ant-form-item) { margin-bottom: var(--space-3) !important; }
.ootd-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.ootd-actions .ootd-note { margin: 0; }
.ootd-preview { position: sticky; top: 20px; }
.ootd-preview :deep(.outfit-thumbnail) { max-width: 340px; margin: 0 auto; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); }
.ootd-preview :deep(.ant-empty) { margin: var(--space-8) 0; }
.ootd-accessory { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: 6px; }
.ootd-accessory :deep(.ant-select) { min-width: 180px; }
.ootd-records { margin-top: var(--space-8); }
.ootd-records-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); }
.ootd-records-head h2 { margin: 0; font-size: 20px; font-weight: 600; }
.ootd-records-head .ootd-note { margin: 4px 0 0; }
.ootd-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-5); }
.ootd-result { display: flex; flex-direction: column; min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.ootd-result-media { display: grid; place-items: center; aspect-ratio: 2 / 3; overflow: hidden; background: var(--surface-alt); }
.ootd-result-media img { display: block; width: 100%; height: 100%; object-fit: contain; }
.ootd-result-body { display: flex; flex: 1; flex-direction: column; gap: var(--space-2); padding: var(--space-3); }
.ootd-result-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--muted-copy); }
.ootd-result-meta .ant-tag { margin: 0; }
.ootd-result-error { margin: 0; font-size: 12px; color: var(--danger); overflow-wrap: anywhere; }
.ootd-result-body .ootd-note { margin: 0; font-size: 12px; }
.ootd-result-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: auto; padding-top: var(--space-1); }
@media (max-width: 1023px) {
  .ootd-workspace { grid-template-columns: 1fr; gap: var(--space-4); }
  .ootd-preview { position: static; order: 1; }
  .ootd-steps { display: contents; }
  .ootd-steps > :first-child { order: 0; }
  .ootd-steps > :nth-child(2) { order: 2; }
  .ootd-actions { order: 3; position: sticky; bottom: calc(80px + env(safe-area-inset-bottom)); z-index: 4; box-shadow: 0 6px 24px rgb(0 0 0 / 8%); }
}
@media (max-width: 767px) {
  .ootd-heading { flex-wrap: wrap; }
  .ootd-manage { width: 100%; }
  .ootd-card { padding: 18px; }
  .ootd-card-head { margin-bottom: var(--space-4); }
  .ootd-selections { grid-template-columns: 1fr; }
  .ootd-person-row { gap: var(--space-4); }
  .ootd-person { width: 84px; height: 126px; }
  .ootd-actions { padding: 12px 14px; }
  .ootd-actions .ootd-note { display: none; }
  .ootd-actions > .ant-space { width: 100%; }
  .ootd-actions > .ant-space :deep(.ant-space-item) { flex: 1; }
  .ootd-actions .ant-btn { width: 100%; }
  .ootd-records { margin-top: var(--space-7); }
  .ootd-records-head h2 { font-size: 18px; }
  .ootd-results { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
  .ootd-result-body { padding: 10px; }
  .ootd-result-actions { flex-wrap: nowrap; gap: 6px; }
  .ootd-result-actions .ant-btn { flex: 1; min-width: 0; padding-inline: 4px; }
  .ootd-wear-roles :deep(.ant-select), .ootd-accessory :deep(.ant-select) { width: 100%; min-width: 0; }
}
</style>
