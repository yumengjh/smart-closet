<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { platformRequest, PlatformRequestError, type RenderJob, type RenderSubmission, type Profile, type ProfileSnapshot, type Baseline, type Capability } from '../../services/platform'
import { mediaUrl } from '../../services/urls'
import { createUuid } from '../../domain/id'
import { modelLabel } from '../../ootd/labels'
const { message, modal } = App.useApp()
const profile = ref<Profile>({ revision: 0, sex: null, heightCm: null, weightKg: null, bodyShape: null, measurements: {}, preferences: {}, defaultBaselineId: null })
const savedProfile=ref('');const dirty=computed(()=>JSON.stringify(profile.value)!==savedProfile.value)
const baselines = ref<Baseline[]>([]); const photos = ref<{id:string;url:string}[]>([]); const capabilities = ref<Capability[]>([])
const renderJobs = ref<RenderJob[]>([]); const pending = ref(false); const lookupUncertain = ref(false)
const submissionNotice = ref<{type:'info'|'warning'|'error';text:string}|null>(null)
const attempt = ref<{request:{profileRevision:number;provider:string;model:string;photoId?:string;name?:string};file:File|null}|null>(null)
const newName = ref(''); const renaming = ref<Baseline|null>(null); const renameValue = ref('')
const states:Record<string,string>={QUEUED:'排队中',WAITING_RESOURCE:'等待资源',RUNNING:'生成中',SUCCEEDED:'待确认',FAILED:'生成失败',UNKNOWN:'生成结果待核对',CANCEL_REQUESTED:'正在取消',CANCELLED:'已取消'}
function jobFor(b:Baseline){return renderJobs.value.find(j=>j.baselineId===b.id&&j.purpose==='BASELINE')}
const error = ref(''); const loading = ref(true); const saving = ref(false); const generating = ref(false); const generateOpen = ref(false)
const preview = ref<ProfileSnapshot | null>(null); const selectedModel = ref<string>(); const photo = ref<File | null>(null); const selectedPhoto = ref<string | undefined>(); const photoPreview = ref(''); const key = ref(createUuid())
const choices = computed(() => capabilities.value.filter(c => c.verified && c.purpose === 'BASELINE'))
const capability = computed(() => choices.value.find(c => c.provider + ':' + c.model === selectedModel.value))
let timer: ReturnType<typeof setInterval> | undefined
async function load() { try { const [p,b,c,ps,j] = await Promise.all([platformRequest<Profile>('/api/me/wearer-profile'),platformRequest<Baseline[]>('/api/me/person-baselines'),platformRequest<Capability[]>('/api/render-capabilities'),platformRequest<{id:string;url:string}[]>('/api/me/reference-photos'),platformRequest<RenderJob[]>('/api/me/image-render-jobs')]);profile.value=p;savedProfile.value=JSON.stringify(p);baselines.value=b;capabilities.value=c;photos.value=ps;renderJobs.value=j;if(!choices.value.some(c=>c.provider+':'+c.model===selectedModel.value))selectedModel.value=choices.value[0]?choices.value[0].provider+':'+choices.value[0].model:undefined;error.value='' } catch(e){error.value=String(e)} finally{loading.value=false} }
async function refreshResults(){if(document.hidden)return;try{const [b,j]=await Promise.all([platformRequest<Baseline[]>('/api/me/person-baselines'),platformRequest<RenderJob[]>('/api/me/image-render-jobs')]);baselines.value=b;renderJobs.value=j}catch{}}
async function save(){saving.value=true;try{const input={...profile.value,measurements:Object.fromEntries(Object.entries(profile.value.measurements).filter(([,v])=>v!=null))};profile.value=await platformRequest('/api/me/wearer-profile','PUT',input);savedProfile.value=JSON.stringify(profile.value);message.success('个人资料已保存，人物不会自动重新生成。')}catch(e){error.value=String(e)}finally{saving.value=false}}
async function prepare(){if(pending.value){generateOpen.value=true;return}submissionNotice.value=null;attempt.value=null;if(dirty.value){message.info('请先保存当前个人资料，再核对生成输入。');return}try{preview.value=await platformRequest('/api/me/wearer-profile/render-preview');generateOpen.value=true;key.value=createUuid()}catch(e){message.error(String(e))}}
function clearPhoto(){if(photoPreview.value)URL.revokeObjectURL(photoPreview.value);photo.value=null;photoPreview.value=''}
function choosePhoto(file:File){if(!['image/png','image/jpeg'].includes(file.type)||file.size>20*1024*1024){message.error('请选择20MB以内的JPG或PNG照片。');return false}if(photoPreview.value)URL.revokeObjectURL(photoPreview.value);photo.value=file;selectedPhoto.value=undefined;photoPreview.value=URL.createObjectURL(file);return false}
async function accepted(job:RenderJob){
  pending.value=false;lookupUncertain.value=false;attempt.value=null;submissionNotice.value=null;error.value='';generateOpen.value=false;clearPhoto();newName.value=''
  renderJobs.value=[job,...renderJobs.value.filter(j=>j.id!==job.id)]
  message.success('模特开始生成，完成后在下方确认。')
  await load()
}
async function reconcile(){
  submissionNotice.value={type:'info',text:'正在核对这次提交是否已创建任务，不会重复生图。'}
  try {
    const result=await platformRequest<RenderSubmission>(`/api/me/image-render-submissions/${encodeURIComponent(key.value)}`,'GET',undefined,undefined,{timeoutMs:10000})
    if(result.found&&result.job){await accepted(result.job);return}
    lookupUncertain.value=false
    submissionNotice.value={type:'warning',text:'暂未查到这次任务。可再次核对，或重新提交同一任务；会保留原提交编号，避免重复生成。'}
  }catch{
    lookupUncertain.value=true
    submissionNotice.value={type:'warning',text:'连接仍未恢复，尚无法确认任务是否创建。请点击“核对提交结果”，暂不重复上传或生图。'}
  }
}
async function checkSubmission(){if(generating.value)return;generating.value=true;try{await reconcile()}finally{generating.value=false}}
async function generate(){
  if(generating.value||!preview.value||!capability.value)return
  if(pending.value&&lookupUncertain.value){await checkSubmission();return}
  generating.value=true;error.value='';submissionNotice.value={type:'info',text:photo.value?'正在上传照片并提交人物任务，请勿重复点击。提交成功后会自动关闭此窗口。':'正在提交人物任务，请勿重复点击。提交成功后会自动关闭此窗口。'}
  attempt.value ||= {request:{profileRevision:preview.value.profileRevision,provider:capability.value.provider,model:capability.value.model,photoId:selectedPhoto.value,name:newName.value.trim()||undefined},file:photo.value}
  try {
    let job:RenderJob
    if(attempt.value.file){const data=new FormData();data.append('file',attempt.value.file);data.append('request',new Blob([JSON.stringify(attempt.value.request)],{type:'application/json'}));job=await platformRequest('/api/me/person-baselines/upload-and-generate','POST',data,key.value,{timeoutMs:60000})}
    else job=await platformRequest('/api/me/person-baselines','POST',attempt.value.request,key.value,{timeoutMs:60000})
    await accepted(job)
  }catch(e){
    if(e instanceof PlatformRequestError&&e.uncertain){pending.value=true;lookupUncertain.value=true;await reconcile()}
    else{pending.value=false;attempt.value=null;const text=e instanceof Error?e.message:String(e);error.value=text;submissionNotice.value={type:'error',text};message.error(text)}
  }finally{generating.value=false}
}
async function confirm(b:Baseline,makeDefault:boolean){try{await platformRequest(`/api/me/person-baselines/${b.id}/confirm`,'POST',{revision:b.revision,makeDefault});await refreshResults();if(makeDefault){const wasDirty=dirty.value;profile.value.defaultBaselineId=b.id;if(!wasDirty)savedProfile.value=JSON.stringify(profile.value)}message.success(makeDefault?'已设为默认模特。':'模特已确认，可在 OOTD 中使用。')}catch(e){message.error(e instanceof Error?e.message:String(e))}}
function startRename(b:Baseline){renaming.value=b;renameValue.value=b.name||''}
async function rename(){if(!renaming.value)return;try{await platformRequest(`/api/me/person-baselines/${renaming.value.id}`,'PATCH',{name:renameValue.value});renaming.value=null;await refreshResults()}catch(e){message.error(e instanceof Error?e.message:String(e))}}
function isStale(b:Baseline){const p=profile.value;const h=p.heightCm??(p.sex==='MALE'?170:160);const w=p.weightKg??Math.round(22*(h/100)**2*10)/10;return p.sex!==b.profile.sex||h!==b.profile.heightCm||w!==b.profile.weightKg||(p.bodyShape?.trim()||'标准身材')!==b.profile.bodyShape}
function remove(b:Baseline){modal.confirm({title:`删除模特「${modelLabel(b)}」？`,content:'已生成的 OOTD 和参考照片会保留；正在用这位模特生成的任务会停止。',okText:'删除',cancelText:'取消',async onOk(){await platformRequest(`/api/me/person-baselines/${b.id}`,'DELETE',{revision:b.revision});await load()}})}
function deletePhoto(id:string){modal.confirm({title:'仅删除这张原始参考照片？',content:'这张上传照片会永久清理，已经生成的基准人物和 OOTD 保留。正在直接使用此照片生成人物的任务会停止发布。',okText:'删除原照',cancelText:'取消',async onOk(){await platformRequest(`/api/me/reference-photos/${id}`,'DELETE');await load()}})}
onMounted(()=>{void load();timer=setInterval(refreshResults,5000)})
onUnmounted(()=>{clearInterval(timer);if(photoPreview.value)URL.revokeObjectURL(photoPreview.value)})
</script>
<template>
  <div class="settings-section-content">
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <section v-if="loading" class="settings-group"><a-skeleton active /></section>

    <!-- 个人资料 -->
    <section v-else class="settings-group">
      <header class="settings-group-head">
        <h3>个人资料</h3>
        <p>除性别外都可以不填，生成模特时会用示意默认值。</p>
      </header>
      <a-form :model="profile" layout="vertical" @finish="save">
        <a-form-item label="性别"><a-radio-group v-model:value="profile.sex" :options="[{value:'MALE',label:'男'},{value:'FEMALE',label:'女'}]" /></a-form-item>
        <div class="settings-form-grid">
          <a-form-item label="身高（cm）"><a-input-number v-model:value="profile.heightCm" aria-label="身高（cm）" :min="1" :max="300" placeholder="未填写" /></a-form-item>
          <a-form-item label="体重（kg）"><a-input-number v-model:value="profile.weightKg" aria-label="体重（kg）" :min="1" :max="600" placeholder="未填写" /></a-form-item>
        </div>
        <a-form-item label="身材特点"><a-input v-model:value="profile.bodyShape" aria-label="身材特点" :maxlength="500" placeholder="例如：肩较宽、梨形身材" /></a-form-item>
                <div class="settings-form-grid cols-3">
          <a-form-item v-for="item in [{key:'chest',label:'胸围'},{key:'waist',label:'腰围'},{key:'hips',label:'臀围'}]" :key="item.key" :label="item.label+'（cm）'"><a-input-number v-model:value="profile.measurements[item.key]" :aria-label="item.label+'（cm，可选）'" :min="1" placeholder="可选" /></a-form-item>
        </div>
        <div class="settings-group-sub">
          <h4>穿搭偏好</h4>
          <div class="settings-form-grid">
            <a-form-item v-for="item in [{key:'fit',label:'合身偏好'},{key:'style',label:'穿搭风格'},{key:'thermal',label:'冷暖偏好'},{key:'dislikes',label:'不喜欢的元素'}]" :key="item.key" :label="item.label"><a-input v-model:value="profile.preferences[item.key]" :aria-label="item.label+'（可选）'" :maxlength="500" /></a-form-item>
          </div>
        </div>
        <div class="settings-group-actions">
          <a-button type="primary" html-type="submit" :loading="saving">保存资料</a-button>
          <span v-if="dirty" class="muted">有未保存的修改</span>
        </div>
      </a-form>
    </section>

    <!-- 参考照片 -->
    <section class="settings-group">
      <header class="settings-group-head">
        <h3>参考照片（可选）</h3>
        <p>上传一张全身照或半身照，模特会更像你；不传也能生成。照片只用于生成模特，不会直接用于 OOTD。</p>
      </header>
      <div class="reference-pick">
        <a-upload :disabled="pending || generating" :before-upload="choosePhoto" :max-count="1" :show-upload-list="false" accept="image/png,image/jpeg"><a-button>选择全身照或半身照</a-button></a-upload>
        <a-select v-if="photos.length" v-model:value="selectedPhoto" allow-clear :disabled="!!photo || pending || generating" aria-label="复用参考照片" class="reference-select" :options="photos.map((p,i)=>({value:p.id,label:'参考照片 '+(i+1)}))" placeholder="可选：复用已上传照片" />
      </div>
      <div v-if="photo" class="reference-chosen">
        <img v-if="photoPreview" class="reference-preview" :src="photoPreview" alt="本次人物参考照片预览" />
        <div>
          <p>{{ photo.name }}</p>
          <p class="muted">尚未上传，确认生成人物时一起提交</p>
          <a-button size="small" :disabled="pending || generating" @click="clearPhoto">移除本次照片</a-button>
        </div>
      </div>
      <div v-if="photos.length" class="settings-group-sub">
        <h4>原始参考照片</h4>
                <div class="baseline-list">
          <article v-for="p in photos" :key="p.id" class="baseline-card">
            <div class="baseline-media"><img :src="mediaUrl(p.url)" alt="本人上传的参考照片" /></div>
            <div class="baseline-body"><a-button size="small" danger block @click="deletePhoto(p.id)">仅删除原照</a-button></div>
          </article>
        </div>
      </div>
    </section>

    <!-- 基准人物 -->
    <section class="settings-group">
      <header class="settings-group-head settings-group-head-row">
        <div>
          <h3>我的模特</h3>
          <p>可以保留多位模特（例如不同发型、不同照片），OOTD 时任选一位。未填的资料按示意默认值生成（男 170 cm、女 160 cm、BMI 22），不写回资料。</p>
        </div>
        <RouterLink class="settings-group-link" to="/ootd">去 OOTD 试穿 ↗</RouterLink>
      </header>
      <a-alert v-if="pending" type="warning" message="上一次提交结果尚未核对，请继续核对原任务，避免重复生成。" style="margin-bottom:12px" />
      <a-alert v-if="!choices.length" type="info" message="暂时没有可用的生成模型，资料可以先保存。" style="margin-bottom:12px" />
      <p v-if="!profile.sex" class="muted" style="margin-bottom:12px">先在上方选择性别并保存，才能生成模特。</p>
      <a-space wrap>
        <a-button type="primary" :disabled="!profile.sex" @click="prepare">{{ pending ? '核对上次提交' : photo ? '用照片生成新模特' : '生成新模特' }}</a-button>
        <a-button @click="refreshResults">刷新</a-button>
      </a-space>
      <a-empty v-if="!baselines.length" description="还没有模特，生成后在这里确认" />
      <div v-else class="baseline-list">
        <article v-for="b in baselines" :key="b.id" class="baseline-card" :class="{ 'is-default': b.currentDefault }">
          <div class="baseline-media"><img v-if="b.mediaUrl" :src="mediaUrl(b.mediaUrl)" :alt="modelLabel(b)" /></div>
          <div class="baseline-body">
            <strong class="baseline-name">{{ modelLabel(b) }}</strong>
            <div class="baseline-meta">
              <a-tag :color="b.currentDefault ? 'success' : b.status === 'CANDIDATE' ? 'warning' : 'default'">{{ b.currentDefault ? '默认' : b.status === 'CANDIDATE' ? '待确认' : b.status === 'CONFIRMED' ? '已确认' : states[jobFor(b)?.status || ''] || (b.status === 'GENERATING' ? '生成中' : b.status) }}</a-tag>
              <span class="muted">资料版本 {{ b.profile.profileRevision }}</span>
            </div>
            <a-alert v-if="jobFor(b)?.error" type="error" :message="jobFor(b)?.error || '生成未完成'" show-icon />
            <a-alert v-if="isStale(b)" type="warning" message="基于旧资料生成" />
            <div class="baseline-actions">
              <a-button v-if="b.status === 'CANDIDATE'" size="small" type="primary" @click="confirm(b, false)">确认可用</a-button>
              <a-button v-if="['CANDIDATE','CONFIRMED'].includes(b.status) && !b.currentDefault" size="small" @click="confirm(b, true)">设为默认</a-button>
              <a-button size="small" @click="startRename(b)">改名</a-button>
              <a-button size="small" danger @click="remove(b)">删除</a-button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
  <a-modal v-model:open="generateOpen" title="生成新模特" :footer="null" :closable="!generating" :mask-closable="!generating" :keyboard="!generating"><template v-if="preview"><a-input v-model:value="newName" :maxlength="20" :disabled="generating || pending" placeholder="给模特起个名字（可选），例如：长发的我" aria-label="模特名称" style="margin-bottom:16px" /><a-alert v-if="submissionNotice" :type="submissionNotice.type" :message="submissionNotice.text" show-icon role="status" aria-live="polite" style="margin-bottom:16px" /><a-descriptions :column="1"><a-descriptions-item label="性别">{{ preview.sex==='MALE'?'男':'女' }}</a-descriptions-item><a-descriptions-item label="身高">{{ preview.heightCm }} cm · {{ preview.sources.heightCm==='USER_REPORTED'?'已填写':'生成默认值' }}</a-descriptions-item><a-descriptions-item label="体重">{{ preview.weightKg }} kg · {{ preview.sources.weightKg==='USER_REPORTED'?'已填写':'示意计算值' }}</a-descriptions-item><a-descriptions-item label="身材">{{ preview.bodyShape }}</a-descriptions-item></a-descriptions>
    <p>全身自然站姿，素色短袖、及膝短裤与平底鞋。每次一张，使用 1 个图像额度。</p><a-select v-model:value="selectedModel" :disabled="generating || pending" aria-label="人物生成模型" style="width:100%" :options="choices.map(c=>({value:c.provider+':'+c.model,label:c.provider+' / '+c.model}))" placeholder="选择已验证模型" />
    <p v-if="photo || selectedPhoto">本次使用{{ photo ? photo.name : '已上传参考照片' }}。照片仅用于建立基准人物，不直接用于 OOTD。</p><p v-else>本次不使用照片，根据资料与模板生成人物。</p><img v-if="photoPreview" :src="photoPreview" alt="本次照片预览" style="max-height:200px;max-width:100%" />
    <a-button type="primary" block style="margin-top:20px" :loading="generating" :disabled="!capability || generating || (pending && lookupUncertain)" @click="generate">{{ generating ? '正在提交 / 核对，请稍候' : pending ? '重新提交同一任务' : photo ? '上传照片并生成' : '生成（1 个图像额度）' }}</a-button><a-button v-if="pending" block style="margin-top:12px" :disabled="generating" @click="checkSubmission">核对提交结果</a-button><RouterLink v-if="pending" to="/tasks" style="display:block;margin-top:12px" @click="generateOpen=false">查看任务记录</RouterLink></template></a-modal>
  <a-modal :open="!!renaming" title="模特改名" ok-text="保存" cancel-text="取消" width="360px" @ok="rename" @cancel="renaming=null"><a-input v-model:value="renameValue" :maxlength="20" aria-label="模特名称" /></a-modal>
</template>
<style scoped>
.settings-field-note { margin: 0 0 var(--space-2); font-size: 13px; color: var(--muted-copy); }
.reference-pick { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.reference-select { flex: 1; min-width: 200px; max-width: 360px; }
.reference-chosen { display: flex; align-items: flex-start; gap: var(--space-4); margin-top: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-alt); }
.reference-chosen p { margin: 0 0 6px; overflow-wrap: anywhere; }
.reference-preview { display: block; flex-shrink: 0; width: 96px; height: 128px; object-fit: cover; border-radius: var(--radius-sm); }
.baseline-name { display: block; overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.baseline-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-4); margin-top: var(--space-5); }
.baseline-card { display: flex; flex-direction: column; min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.baseline-card.is-default { border-color: var(--success-line); box-shadow: 0 0 0 1px var(--success-line); }
.baseline-media { height: 240px; overflow: hidden; background: var(--surface-alt); }
.baseline-media img { display: block; width: 100%; height: 100%; object-fit: contain; }
.baseline-body { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); }
.baseline-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
.baseline-meta .ant-tag { margin: 0; }
.baseline-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.settings-group :deep(.ant-empty) { margin: var(--space-6) 0 var(--space-2); }
@media (max-width: 767px) {
  .baseline-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
  .baseline-media { height: 200px; }
  .settings-form-grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 var(--space-2); }
  .reference-pick > *, .reference-select { flex: 1 1 100%; max-width: none; }
  .reference-pick :deep(.ant-upload), .reference-pick :deep(.ant-upload .ant-btn) { width: 100%; }
}
</style>
