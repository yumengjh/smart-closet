<script setup lang="ts">
import { mediaUrl } from '../services/urls'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useThemeStore } from '../stores/theme'
import { useRouter } from 'vue-router'
import { PictureOutlined, CameraOutlined, CloseOutlined, InfoCircleOutlined, ExperimentOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import CameraCapture from './CameraCapture.vue'
import WaitingActivities from './WaitingActivities.vue'
import { useProcessingStore } from '../stores/processing'
import { batchIsProcessing, elapsedLabel } from '../domain/waiting'
import SpriteTrial from './SpriteTrial.vue'
import BatchTargetPreview from './BatchTargetPreview.vue'
import { hasCamera } from '../services/camera'
import { closetApi, usingMocks } from '../services/api'
import { batchApi, type IntakeBatch, type IntakeStrategy, type Marker, type BatchTarget } from '../services/batches'
import { eligible, imagePoint, clearSubmittedSpriteSelection } from '../domain/intake'
const props = defineProps<{ batchId?: string; embedded?: boolean }>()
const router = useRouter()
const appearance = useThemeStore()
const batch = ref<IntakeBatch>()
const processingTasks = useProcessingStore()
const now = ref(Date.now())
const waitingTime = computed(() => batch.value ? elapsedLabel(Math.max(batch.value.createdAtMs, ...batch.value.calls.map(call => call.startedAtMs)), now.value) : '')
const completedCount = computed(() => batch.value?.targets.filter(target => target.outputUrl && ['SUCCEEDED','NEEDS_REVIEW'].includes(target.status)).length || 0)
watch(batch, value => { if (value) processingTasks.trackBatch(value, false, true) })
let waitingClock: ReturnType<typeof setInterval> | undefined
onMounted(() => { waitingClock = setInterval(() => { now.value = Date.now() }, 1000) })
const strategy = ref<IntakeStrategy>('SMART')
const selected = ref<{ file: File; url: string; key: string }[]>([])
const markers = ref<Marker[]>([])
const busy = ref(false), loading = ref(true), error = ref(''), uploadProgress = ref(0), uploadIndex = ref(0)
const camera = ref(false), cameraOpen = ref(false), mobile = ref(false)
const input = ref<HTMLInputElement>(), rear = ref<HTMLInputElement>(), selfie = ref<HTMLInputElement>()
const generationChoice = ref(''), recognitionChoice = ref('')
const quotaLimit = ref<number | null>(null)
const quotaLeft = ref<number | null>(null), history = ref<IntakeBatch[]>([])
const comparison = ref<BatchTarget>()
const trialEnabled=ref(false), trialReset=ref(0), sourceOpen=ref(false), resultTab=ref(false)
const baseline=ref<Record<string,string>>({})
let alive = true, timer: ReturnType<typeof setTimeout> | undefined
const active = computed(() => batch.value ? batchIsProcessing(batch.value) : false)
const locked = computed(() => busy.value || active.value)
const pending = computed(() => batch.value?.targets.filter(t => !t.confirmed && t.status==='DETECTED' && eligible(t.visibleFraction,t.keyDetailsVisible,batch.value!.strategy)) || [])
const skipped = computed(() => batch.value?.targets.filter(t=>!eligible(t.visibleFraction,t.keyDetailsVisible,batch.value!.strategy)) || [])
const results = computed(() => batch.value?.targets.filter(t=>eligible(t.visibleFraction,t.keyDetailsVisible,batch.value!.strategy)) || [])
const candidates=computed(()=>results.value.filter(t=>!t.confirmed))
const nextCount = computed(() => Math.min(pending.value.length,quotaLeft.value || 0))
const detectionUnits = computed(() => strategy.value==='MANUAL' ? new Set(markers.value.map(m=>m.sourceId)).size : batch.value?.sources.length || selected.value.length)
const incompleteUpload = computed(() => !!batch.value && selected.value.length > batch.value.sources.length)
const startReason = computed(() => {
  if(loading.value) return '正在准备整理服务…'
  if(usingMocks) return '当前为界面演示，无法提交真实照片。'
  if(!recognitionChoice.value || !generationChoice.value) return '整理服务尚未配置，请到设置中检查服务。'
  if(quotaLeft.value===null) return '暂时无法读取今日额度，请重试。'
  if(strategy.value==='MANUAL' && batch.value && !markers.value.length) return '点击照片中想收的衣物，再开始整理。'
  if(quotaLeft.value < detectionUnits.value) return `今日剩余 ${quotaLeft.value} 次，不够处理这些照片。可以减少照片或明天继续。`
  return ''
})
const label: Record<string,string> = { UPLOADED:'照片已保存', RECOGNIZING:'正在寻找照片里的衣物', DETECTED:'等待继续整理', GENERATING:'正在整理衣物', NEEDS_REVIEW:'核对后收进衣柜', QUEUED:'等待处理', RUNNING:'整理中', SUCCEEDED:'可以核对', SKIPPED:'需要补拍', FAILED:'这件没有完成', UNKNOWN:'需要核查结果', CANCELLED:'已取消' }
const choosing=computed(()=>trialEnabled.value && !active.value && !resultTab.value && candidates.value.length>0)
const stage = computed(()=>!batch.value||batch.value.status==='UPLOADED'?0:active.value||choosing.value||!trialEnabled.value&&pending.value.length?1:2)
watch(active,(value,previous)=>{if(previous&&!value)resultTab.value=true})
function key(action: string) {
  const storage=`closet-batch:${batch.value!.id}:${action}`
  let value=localStorage.getItem(storage)
  if(!value){value=crypto.randomUUID();localStorage.setItem(storage,value)}
  return value
}
function model(value: string) { return JSON.parse(value || '{}') as {provider?: string; model?: string} }
function source(target: BatchTarget) { return batch.value?.sources.find(s=>s.id===target.sourceId) }
watch(trialEnabled,value=>{if(batch.value)localStorage.setItem(`closet-batch:${batch.value.id}:trial`,String(value))})
watch(markers,value=>{if(batch.value?.status==='UPLOADED')localStorage.setItem(`closet-batch:${batch.value.id}:markers`,JSON.stringify(value))},{deep:true})
async function refreshQuota() {const q=await closetApi.quota();quotaLeft.value=Math.max(0,q.limit-q.used);quotaLimit.value=q.limit}
async function reloadQuota() {try{await refreshQuota();error.value=''}catch{error.value='额度读取失败，请稍后重试。'}}
function accept(files: File[]) {
  if(locked.value||batch.value)return
  error.value=''
  for(const file of files){
    if(!['image/jpeg','image/png'].includes(file.type)&&!/\.(jpe?g|png)$/i.test(file.name)){error.value='请选择 JPEG 或 PNG。HEIC 请先导出 JPEG，也可以直接拍照。';continue}
    if(file.size>50*1024*1024){error.value='每张照片最多 50 MB，请导出较小照片后再试。';continue}
    if(selected.value.length===10){error.value='一次最多选择 10 张照片。';break}
    selected.value.push({file,url:URL.createObjectURL(file),key:crypto.randomUUID()})
  }
}
function change(event: Event) {const el=event.target as HTMLInputElement;accept(Array.from(el.files||[]));el.value=''}
function remove(index: number){URL.revokeObjectURL(selected.value[index]!.url);selected.value.splice(index,1)}
function mark(event: MouseEvent, sourceId: string){
  const img=event.currentTarget as HTMLImageElement
  const point=imagePoint(event.clientX,event.clientY,img.getBoundingClientRect(),img.naturalWidth,img.naturalHeight)
  if(point)addMarker(sourceId,point)
}
function addMarker(sourceId: string,point: {x:number;y:number}){
  if(strategy.value!=='MANUAL'||locked.value||batch.value?.status!=='UPLOADED')return
  if(markers.value.length>=10){error.value='一次最多标记 10 件衣物。';return}
  markers.value.push({sourceId,...point})
}
async function poll(){
  if(!batch.value||!alive)return
  try{batch.value=await batchApi.get(batch.value.id);await refreshQuota()}catch(e){error.value=e instanceof Error?e.message:'暂时无法读取进度，请稍后重试。'}
  if(alive)timer=setTimeout(poll,active.value?2000:10000)
}
async function upload(){
  if(!selected.value.length||locked.value||usingMocks)return
  busy.value=true;error.value=''
  try{
    for(let i=batch.value?.sources.length||0;i<selected.value.length;i++){
      const item=selected.value[i]!;uploadIndex.value=i+1;uploadProgress.value=0
      batch.value=i===0?await batchApi.create(item.file,item.key,'MULTIPLE',strategy.value,p=>uploadProgress.value=p):await batchApi.append(item.file,batch.value!.id,item.key,p=>uploadProgress.value=p)
    }
    localStorage.setItem(`closet-batch:${batch.value!.id}:trial`,String(trialEnabled.value))
    if(strategy.value!=='MANUAL')await submitStart()
    await router.replace(`/batches/${batch.value!.id}`)
  }catch(e){error.value=e instanceof Error?e.message:'上传未完成，照片已保留，可继续上传。'}
  finally{busy.value=false;uploadIndex.value=0;if(alive&&!timer)void poll()}
}
async function submitStart(){
  if(!batch.value||usingMocks)return
  batch.value=await batchApi.start(batch.value.id,key('start'),markers.value,model(recognitionChoice.value),model(generationChoice.value),trialEnabled.value)
  processingTasks.trackBatch(batch.value, true)
  await refreshQuota()
}
async function startSaved(){
  if(locked.value||startReason.value)return
  busy.value=true;error.value=''
  try{await submitStart()}catch(e){error.value=e instanceof Error?e.message:'整理未提交，照片已保存，请重试。'}finally{busy.value=false}
}
async function generate(ids: string[],retry=false,groupSize=1){
  if(!batch.value||!ids.length||locked.value||usingMocks)return
  busy.value=true;error.value=''
  try{
    const action=retry?`retry-${crypto.randomUUID()}`:`continue-${ids.join(',')}-${groupSize}-${generationChoice.value}`
    batch.value=await batchApi.generate(batch.value.id,key(action),{targetIds:ids,groupSize,referenceSide:1024,sizePolicy:'FIXED',quality:'low',...model(generationChoice.value)})
    processingTasks.trackBatch(batch.value, true)
    // The selector unmounts as soon as this response makes the batch active.
    // Clear persisted submitted IDs here, rather than relying on its reset watcher.
    try { clearSubmittedSpriteSelection(localStorage,batch.value.id,ids) } catch { /* Storage may be unavailable; server results still reconcile selection on return. */ }
    trialReset.value++;resultTab.value=false
    await refreshQuota()
    return true
  }catch(e){error.value=e instanceof Error?e.message:'整理未提交，识别结果已保存。'}finally{busy.value=false}
}
async function trySprite(options:{targetIds:string[];groupSize:number}){
  if(!batch.value||locked.value)return
  for(const target of batch.value.targets)if(options.targetIds.includes(target.id)&&target.outputUrl)baseline.value[target.id]=target.outputUrl
  localStorage.setItem(`closet-batch:${batch.value.id}:baseline`,JSON.stringify(baseline.value))
  await generate(options.targetIds,true,options.groupSize)
}
async function resumeLocal(callId: string){
  if(!batch.value||locked.value)return
  busy.value=true;error.value=''
  try{batch.value=await batchApi.resumeLocal(batch.value.id,callId)}catch(e){error.value=e instanceof Error?e.message:'暂未完成，整理图已保留。'}finally{busy.value=false}
}
function review(target: BatchTarget){void router.push({path:`/garment/${target.garmentId}`,query:{task:target.jobId,batch:batch.value!.id}})}
function cameraMenu(info:{key:string|number}){(info.key==='selfie'?selfie.value:rear.value)?.click()}
onMounted(async()=>{
  mobile.value=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Macintosh/.test(navigator.userAgent)
  void hasCamera(navigator.mediaDevices).then(v=>{if(alive)camera.value=v})
  const loaded=await Promise.allSettled([closetApi.processingChoices(),batchApi.history(),refreshQuota(),props.batchId?batchApi.get(props.batchId):Promise.resolve(undefined)])
  if(!alive)return
  const choices=loaded[0];if(choices.status==='fulfilled'){generationChoice.value=choices.value.generation[0]?.value||'';recognitionChoice.value=choices.value.recognition[0]?.value||''}
  const recent=loaded[1];if(recent.status==='fulfilled')history.value=recent.value
  const current=loaded[3];if(current.status==='fulfilled'&&current.value){batch.value=current.value;strategy.value=batch.value.strategy;
    trialEnabled.value=localStorage.getItem(`closet-batch:${batch.value.id}:trial`)==='true'
    try{const savedBaseline=JSON.parse(localStorage.getItem(`closet-batch:${batch.value.id}:baseline`)||'{}');baseline.value=Object.fromEntries(Object.entries(savedBaseline).filter(([id,url])=>batch.value!.targets.some(t=>t.id===id)&&typeof url==='string'&&url.startsWith('/api/'))) as Record<string,string>}catch{baseline.value={}}
    try{const saved=JSON.parse(localStorage.getItem(`closet-batch:${batch.value.id}:markers`)||'[]') as Marker[];markers.value=saved.filter(m=>batch.value!.sources.some(s=>s.id===m.sourceId)&&Number.isFinite(m.x)&&Number.isFinite(m.y)&&m.x>=0&&m.x<=1&&m.y>=0&&m.y<=1).slice(0,10)}catch{markers.value=[]}}
  else if(current.status==='rejected')error.value=current.reason instanceof Error?current.reason.message:'无法读取这次录入。'
  loading.value=false;void poll()
})
onBeforeUnmount(()=>{clearInterval(waitingClock);alive=false;if(timer)clearTimeout(timer);selected.value.forEach(s=>URL.revokeObjectURL(s.url))})
</script>
<template>
  <a-config-provider :theme="{token:{colorPrimary:appearance.isDark?'#91aaff':'#3f6ff5'}}">
  <section class="batch-intake" :class="{ 'embedded-intake': embedded }">
    <input ref="input" type="file" class="hidden-file-input" accept="image/jpeg,image/png" multiple :disabled="locked || !!batch" @change="change" />
    <input ref="rear" type="file" class="hidden-file-input" accept="image/jpeg,image/png" capture="environment" @change="change" />
    <input ref="selfie" type="file" class="hidden-file-input" accept="image/jpeg,image/png" capture="user" @change="change" />
    <CameraCapture v-if="cameraOpen" @close="cameraOpen=false" @capture="(file: File)=>accept([file])" />
    <a-steps v-if="!embedded || batch && batch.status !== 'UPLOADED'" :current="stage" size="small" :responsive="false" class="workspace-steps" :items="[{title:'选照片'},{title:trialEnabled?'选衣物':'自动整理'},{title:'整理结果'}]" />
    <a-alert v-if="error || batch?.error" type="warning" show-icon :message="error || batch?.error" />
    <h1 v-if="!embedded && (!batch || batch.status==='UPLOADED') && !loading">选择照片</h1>
    <a-skeleton v-if="loading" active :paragraph="{rows:3}" />
    <div v-if="!batch || batch.status==='UPLOADED'" class="batch-upload-layout"><div :class="['upload-area', {'has-photos':selected.length}]" @dragover.prevent @drop.prevent="accept(Array.from($event.dataTransfer?.files || []))">
      <template v-if="!batch"><div class="upload-heading"><PictureOutlined v-if="!selected.length" /><h2>{{selected.length?`已选 ${selected.length} 张照片`:'把想收的衣物拍下来'}}</h2><p v-if="!selected.length">单件照、多件同框或自拍都可以，也能一次选多张。</p></div>
      <div class="batch-actions"><a-button :type="selected.length?'default':'primary'" size="large" :disabled="locked" @click="input?.click()"><PictureOutlined /> {{selected.length?'继续选照片':'选择照片'}}</a-button><a-dropdown v-if="camera && mobile" :trigger="['click']"><a-button size="large" :disabled="locked"><CameraOutlined /> 拍照 / 自拍</a-button><template #overlay><a-menu @click="cameraMenu"><a-menu-item key="rear">拍衣物</a-menu-item><a-menu-item key="selfie">自拍</a-menu-item></a-menu></template></a-dropdown><a-button v-else-if="camera" size="large" :disabled="locked" @click="cameraOpen=true"><CameraOutlined /> 拍一张</a-button></div></template>
      <p v-else-if="strategy==='MANUAL'">点击照片里想收的衣物，标记好后开始整理。补出的部分会标注为推测。</p>
      <div class="photo-grid"><figure v-for="(item,index) in !batch?selected:[]" :key="item.key"><img :src="mediaUrl(item.url)" :alt="item.file.name" /><a-button type="text" :disabled="locked" :aria-label="`移除${item.file.name}`" @click="remove(index)"><CloseOutlined /></a-button><figcaption>{{item.file.name}}</figcaption></figure>
      <figure v-for="source in batch?.status==='UPLOADED'?batch.sources:[]" :key="source.id"><div class="marker-image"><img :src="mediaUrl(source.previewUrl)" :alt="source.name" :class="{markable:strategy==='MANUAL'}" :tabindex="strategy==='MANUAL'?0:undefined" @click="mark($event,source.id)" @keydown.enter="addMarker(source.id,{x:.5,y:.5})" /><a-button v-for="(marker,index) in markers.filter(m=>m.sourceId===source.id)" :key="index" class="marker" :style="{left:marker.x*100+'%',top:marker.y*100+'%'}" :aria-label="`移除第${index+1}个标记`" @click="markers=markers.filter(m=>m!==marker)">{{index+1}}</a-button></div><figcaption>{{source.name}}</figcaption></figure></div>
      <a-progress v-if="busy && uploadIndex" :percent="uploadProgress" :format="(p?: number)=>`第 ${uploadIndex} 张 · ${p || 0}%`" />
      <p class="muted" v-if="!batch">{{strategy==='SMART'?'遮挡较多的衣物会跳过，优先保留真实细节。':strategy==='FULL'?'也会整理遮挡衣物，补全内容会标注推测。':'保存照片后，点击你想收的衣物。'}}<br />最多 10 张 · 每张 50 MB · JPEG / PNG</p>
    </div>
    <aside class="batch-preferences-panel">
      <div class="preference-title"><h2>整理方式</h2><a-popover trigger="click" title="用量与处理方式"><template #content><p class="help-copy">读取照片每张 1 次额度。逐件整理每件 1 次；合图试用识别后由你选择衣物和分组，按实际组数计费。拆分、去背景及贴纸制作不占 AI 额度。</p></template><a-button type="text" aria-label="查看整理用量"><InfoCircleOutlined /></a-button></a-popover></div>
      <a-radio-group v-model:value="trialEnabled" :disabled="locked" class="processing-modes"><a-radio :value="false"><strong>逐件整理</strong><small>识别后自动分别整理衣物</small></a-radio><a-radio :value="true"><strong><ExperimentOutlined /> 合图试用</strong><small>先识别，再选择衣物与每组件数</small></a-radio></a-radio-group>
      <a-collapse v-if="!batch" :bordered="false" class="preferences"><a-collapse-panel key="preferences" header="有遮挡，或只想收其中几件？"><a-radio-group v-model:value="strategy" :disabled="locked" class="strategy-options"><a-radio value="SMART">只整理细节清楚的衣物（推荐）</a-radio><a-radio value="FULL">遮挡的衣物也整理，缺失部分由模型推测</a-radio><a-radio value="MANUAL">由我点击指定要收的衣物</a-radio></a-radio-group></a-collapse-panel></a-collapse>
    </aside>
      <div  class="submit-area"><p class="muted" v-if="!batch">{{selected.length ? `先读取 ${selected.length} 张照片，再${trialEnabled?'选择衣物合图':'按实际衣物逐件'}整理。` : trialEnabled ? '选择照片后先识别，再选择衣物与分组。' : '选择照片后先识别，再按实际衣物数量整理。'}}{{trialEnabled?'读取每张照片占 1 次，整理按所选组数计算。':'每次读取、每件整理各占 1 次额度。'}}</p><p v-if="startReason" class="action-reason" role="status">{{startReason}} <a-button v-if="quotaLeft===null && !loading" type="link" @click="reloadQuota">重试读取额度</a-button><a-button v-if="!recognitionChoice || !generationChoice" type="link" @click="router.push('/settings')">检查设置</a-button></p>
      <a-button v-if="!batch || incompleteUpload" type="primary" size="large" :loading="busy" :disabled="locked || !selected.length || !!startReason" @click="upload">{{incompleteUpload?'继续上传':strategy==='MANUAL'?'保存照片，选择衣物':trialEnabled?'先识别衣物，再选择合图数量':selected.length ? `开始整理 ${selected.length} 张照片` : '选择照片后开始整理'}}</a-button><a-button v-else type="primary" size="large" :loading="busy" :disabled="locked || !!startReason" @click="startSaved">{{trialEnabled?'识别目标，再选择合图数量':strategy==='MANUAL'?`整理标记的 ${markers.length} 件衣物`:'开始整理这些照片'}}</a-button></div>
    </div>
    <template v-if="batch && batch.status!=='UPLOADED'">
      <div class="status-heading"><div><h1>{{choosing?'选择衣物':active?(batch.status==='RECOGNIZING'?'正在寻找照片里的衣物':'正在整理衣物'):resultTab?'整理结果':pending.length?'已找到衣物，继续整理即可':label[batch.status] || '查看整理结果'}}</h1><p class="muted">{{active?'可以离开页面，处理会继续。回来后在最近录入中查看结果。':`来自 ${batch.sources.length} 张照片 · ${batch.metrics?.confirmed || 0} 件已入柜`}}</p></div><a-button @click="router.push('/add')">添加新照片</a-button></div>
      <div v-if="!trialEnabled && !active && pending.length" class="continue-area"><p>还有 {{pending.length}} 件等待整理{{quotaLeft!==null && quotaLeft<pending.length?`，今日剩余 ${quotaLeft} 次额度`:''}}。</p><a-button v-if="nextCount && generationChoice" type="primary" size="large" :loading="busy" :disabled="locked" @click="generate(pending.slice(0,nextCount).map(t=>t.id))">{{nextCount<pending.length?`先整理 ${nextCount} 件`:`继续整理 ${nextCount} 件`}} · {{nextCount}} 次额度</a-button><p v-else class="action-reason">{{quotaLeft===null?'额度暂未读取成功。':!generationChoice?'整理服务尚未配置，请检查设置。':'今日额度已用完，结果已保存，明天可以继续。'}}<a-button v-if="quotaLeft===null" type="link" @click="reloadQuota">重试读取额度</a-button><a-button v-if="!generationChoice" type="link" @click="router.push('/settings')">检查设置</a-button></p></div>
      <div v-if="!active && results.length" class="workspace-toolbar"><a-radio-group v-model:value="trialEnabled" :disabled="locked" button-style="solid" aria-label="整理方式"><a-radio-button :value="false">逐件整理</a-radio-button><a-radio-button :value="true">合图试用</a-radio-button></a-radio-group><div><a-button v-if="trialEnabled && candidates.length" @click="resultTab=!resultTab">{{resultTab?'选择衣物':results.some(t=>t.outputUrl)?'查看已有结果':'查看衣物状态'}}</a-button><a-tooltip v-if="!choosing" title="查看来源照片"><a-button type="text" aria-label="查看来源照片" @click="sourceOpen=true"><PictureOutlined /></a-button></a-tooltip></div></div>
      <SpriteTrial v-if="choosing" :targets="candidates" :sources="batch.sources" :all-targets="batch.targets" :batch-id="batch.id" :reset-key="trialReset" :disabled="locked" :quota="quotaLeft" :configured="!!generationChoice" @submit="trySprite" @source="sourceOpen=true" @back="resultTab=true" />
      <section v-if="active" class="processing-state"><a-spin size="large" /><h2>{{batch.status==='RECOGNIZING'?'正在识别衣物':'正在整理衣物'}}</h2><p>已等待 {{ waitingTime }}<span v-if="batch.status!=='RECOGNIZING'"> · {{ completedCount }} / {{ batch.targets.length }} 件已有结果</span></p><p>处理会在后台继续，完成后会在站内提醒。</p><div v-if="batch.status!=='RECOGNIZING'" class="processing-phases"><span>{{trialEnabled?'合图整理':'逐件整理'}}</span><span>拆分衣物</span><span>去背景与制作贴纸</span></div><WaitingActivities /></section>
      <div v-if="!choosing && !active" class="result-summary"><strong>{{results.filter(t=>t.outputUrl).length}} 件已有结果 · {{pending.length}} 件等待整理</strong><span>处理完成后仍需确认入柜</span></div>
      <div v-if="!choosing && !active" class="target-grid compact-results"><article v-for="target in results" :key="target.id" class="target"><div class="target-body"><div class="target-identity"><img v-if="target.outputUrl" class="result-thumb" :src="mediaUrl(target.outputUrl)" alt="衣物整理结果" /><BatchTargetPreview v-else :target="target" :source="source(target)" /><div><h3 :title="target.recognition.target.description">#{{batch.targets.findIndex(t=>t.id===target.id)+1}} {{target.recognition.target.description}}</h3><p class="muted">{{target.confirmed?'已入柜':['FAILED','UNKNOWN'].includes(target.status)?label[target.status]:target.outputUrl?'已有结果 · 尚未入柜':label[target.status] || '等待整理'}}</p></div></div><a-tag v-if="target.completion" color="warning">含推测补全 · 请对照原图</a-tag><div class="result-actions"><a-button v-if="target.jobId && !['QUEUED','RUNNING'].includes(target.status)" @click="review(target)">查看结果</a-button><a-button v-else-if="!target.confirmed && target.status==='DETECTED'" :disabled="locked || !quotaLeft || !generationChoice" @click="generate([target.id])">整理这件 · 1 次</a-button><a-tooltip title="对照原图"><a-button type="text" :aria-label="`对照第 ${batch.targets.findIndex(t=>t.id===target.id)+1} 件原图`" @click="comparison=target"><PictureOutlined /></a-button></a-tooltip><a-tooltip v-if="!target.confirmed && ['FAILED','UNKNOWN','SUCCEEDED','NEEDS_REVIEW'].includes(target.status)" title="重做这件 · 1 次额度"><a-button type="text" :disabled="locked || !quotaLeft || !generationChoice" :aria-label="`重做第 ${batch.targets.findIndex(t=>t.id===target.id)+1} 件 · 1 次额度`" @click="generate([target.id],true)"><ReloadOutlined /></a-button></a-tooltip></div></div></article></div>
      <a-empty v-if="!batch.targets.length && !active" description="没有找到适合整理的衣物。补拍清楚后再添加照片。" />
      <a-collapse v-if="skipped.length" :bordered="false"><a-collapse-panel key="skipped" :header="`${skipped.length} 件暂未整理 · 建议补拍`"><div v-for="target in skipped" :key="target.id" class="skipped-row"><strong>{{target.recognition.target.description}}</strong><p>{{target.reason || '可见细节不足，补拍完整衣物效果更好。'}}</p><a-button type="link" @click="comparison=target">查看原图</a-button></div></a-collapse-panel></a-collapse>
      <div v-for="call in batch.calls.filter(c=>c.atlasUrl && ['FAILED','UNKNOWN'].includes(c.status))" :key="call.id" class="continue-area"><p>整理图已经保存，后续图片处理未完成。</p><a-button :disabled="locked" @click="resumeLocal(call.id)">继续图片处理 · 不占额度</a-button></div>
      <a-collapse v-if="batch.calls.length" :bordered="false"><a-collapse-panel key="costs" header="查看本次用量"><p class="muted">识别 {{batch.calls.filter(c=>c.type==='RECOGNIZE' && c.status!=='SKIPPED').length}} 次 · 整理 {{batch.calls.filter(c=>c.type==='GENERATE').length}} 次 · 重做 {{batch.calls.filter(c=>c.type==='REWORK').length}} 次</p><p class="muted">已知费用 ${{batch.calls.reduce((sum,c)=>sum+(c.costUsd || 0),0).toFixed(5)}}{{batch.calls.some(c=>c.costUsd===null)?'；部分调用金额未知，等待计费明细。':''}}</p></a-collapse-panel></a-collapse>
    </template>
    <p class="quota-line">今日剩余 {{quotaLeft===null?'暂未读取':quotaLeft}} / {{quotaLimit ?? '—'}} 次额度 <a-button v-if="quotaLeft===null && !loading" type="link" @click="reloadQuota">重试</a-button></p>
    <div v-if="history.length && !props.batchId" class="recent"><h2>最近录入</h2><a-button v-for="item in history.slice(0,5)" :key="item.id" @click="router.push(`/batches/${item.id}`)"><span>{{item.sources.length}} 张照片 · {{label[item.status] || '查看结果'}}</span><span class="muted">{{new Date(item.createdAtMs).toLocaleDateString()}} →</span></a-button></div>
    <a-modal v-model:open="sourceOpen" title="来源照片" :footer="null" width="800px"><div class="comparison"><figure v-for="item in batch?.sources || []" :key="item.id"><img :src="mediaUrl(item.previewUrl)" :alt="item.name" /><figcaption>{{item.name}} <a :href="mediaUrl(item.originalUrl)" target="_blank" rel="noopener">查看原始大图</a></figcaption></figure></div></a-modal>
    <a-modal :open="!!comparison" :title="comparison && baseline[comparison.id]?'原图与试用前后对比':'对照原图'" :footer="null" width="800px" @cancel="comparison=undefined"><div v-if="comparison" class="comparison"><figure><img :src="mediaUrl(source(comparison)?.previewUrl)" alt="原照片" /><figcaption>原照片 <a :href="mediaUrl(source(comparison)?.originalUrl)" target="_blank" rel="noopener">查看原始大图</a></figcaption></figure><figure v-if="comparison.outputUrl"><img :src="mediaUrl(comparison.outputUrl)" alt="整理后的衣物" /><figcaption>整理结果{{comparison.completion?' · 包含推测补全':''}}</figcaption></figure><figure v-if="baseline[comparison.id]"><img :src="mediaUrl(baseline[comparison.id])" alt="试用前的整理结果" /><figcaption>试用前的整理结果</figcaption></figure></div><p v-if="comparison?.reason" class="muted">{{comparison.reason}}</p><a-button v-if="!comparison?.confirmed && comparison?.jobId && !['QUEUED','RUNNING'].includes(comparison.status)" type="primary" @click="review(comparison!)">核对并入柜</a-button></a-modal>
  </section>
  </a-config-provider>
</template>
<style scoped>
.sprite-toggle{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.target-identity{display:flex;align-items:center;gap:12px;margin-bottom:12px}.target-identity h3{margin:0}.sprite-panel{display:grid;gap:18px;padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:12px}.batch-intake{display:grid;gap:24px;max-width:1000px}.intake-steps{display:flex;gap:24px;list-style:none;padding:0;margin:0;color:var(--muted);font-size:14px}.intake-steps li{display:flex;align-items:center;gap:8px}.intake-steps b{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--surface-alt);font-size:12px}.intake-steps .current{color:var(--text);font-weight:600}.intake-steps .current b{color:var(--action-fg);background:var(--action-bg)}.upload-area{padding:28px;border:1px solid var(--line);border-radius:14px;background:var(--surface);display:grid;gap:20px}.upload-area.has-photos{gap:14px}.upload-heading{display:grid;gap:8px}.upload-heading> :deep(.anticon){font-size:28px;color:var(--muted);margin-bottom:8px}.upload-heading p,.muted{color:var(--muted);font-size:13px;line-height:1.7}.batch-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.batch-intake :deep(.ant-btn){min-height:44px}.photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px}.photo-grid:empty{display:none}.photo-grid figure{position:relative;margin:0;min-width:0}.photo-grid img{width:100%;height:220px;object-fit:contain;background:var(--surface-alt);border-radius:8px}.photo-grid figcaption{font-size:12px;color:var(--muted);overflow-wrap:anywhere;margin-top:8px}.photo-grid figure> :deep(.ant-btn){position:absolute;top:6px;right:6px;background:var(--surface)}.marker-image{position:relative;line-height:0}.marker-image img{display:block;height:auto}.markable{cursor:crosshair}.marker{position:absolute;transform:translate(-50%,-50%);min-width:44px;height:44px;border-radius:50%;color:var(--action-fg);background:var(--action-bg)}.strategy-options{display:grid;gap:14px}.strategy-options :deep(.ant-radio-wrapper){line-height:1.6;min-height:44px;align-items:center}.submit-area{display:grid;gap:12px;border-top:1px solid var(--line);padding-top:20px}.submit-area> :deep(.ant-btn){justify-self:start}.action-reason{font-size:13px;color:var(--muted);line-height:1.7}.status-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.status-heading h1{font-size:20px;margin-bottom:8px}.continue-area{padding:18px;background:var(--surface-alt);border-radius:10px;display:grid;gap:12px}.continue-area> :deep(.ant-btn){justify-self:start}.target-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}.target{min-width:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface)}.result-image{height:240px;position:relative;background:var(--surface-alt);padding:16px}.result-image img{width:100%;height:100%;object-fit:contain}.image-status{position:absolute;bottom:12px;left:12px;border-radius:6px;background:var(--surface);padding:6px 10px;font-size:12px}.target-body{display:grid;gap:12px;padding:18px}.target-body h3{font-size:15px;line-height:1.5;overflow-wrap:anywhere}.target-body :deep(.ant-tag){justify-self:start;white-space:normal}.skipped-row{padding:12px 0;border-bottom:1px solid var(--line);font-size:13px;line-height:1.7}.quota-line{font-size:13px;color:var(--muted)}.recent{display:grid;gap:10px;border-top:1px solid var(--line);padding-top:24px}.recent h2{font-size:16px;margin-bottom:4px}.recent :deep(.ant-btn){display:flex;justify-content:space-between;text-align:left;height:auto;white-space:normal;gap:12px;padding:12px}.comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.comparison figure{margin:0;min-width:0}.comparison img{width:100%;height:340px;object-fit:contain;background:var(--surface-alt);border-radius:8px}.comparison figcaption{font-size:13px;margin:10px 0;color:var(--muted)}@media(max-width:640px){.upload-area{padding:18px}.intake-steps{gap:14px;font-size:13px;justify-content:space-between}.intake-steps li{gap:5px}.status-heading{flex-wrap:wrap}.target-grid{grid-template-columns:1fr}.submit-area> :deep(.ant-btn){justify-self:stretch}.comparison img{height:260px}.recent :deep(.ant-btn){font-size:13px}.photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.photo-grid img{height:150px}}
</style>

<style scoped>
.embedded-intake{max-width:none}.batch-upload-layout{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,1fr);gap:24px}.batch-preferences-panel{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px;display:grid;align-content:start;gap:20px}.batch-preferences-panel h2{font-size:18px}.batch-units{font-size:16px;line-height:1.9}.batch-preference-divider{height:1px;background:var(--line)}.batch-upload-layout>.submit-area{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;border:0;padding:0}.batch-upload-layout>.submit-area .action-reason{grid-column:1/-1}.batch-upload-layout>.submit-area>.ant-btn{grid-column:2;grid-row:1;min-width:240px}.batch-cost-alert{padding:16px 20px;border-radius:12px}.batch-cost-alert :deep(.ant-alert-message){font-weight:600}.upload-area:not(.has-photos) .upload-heading{text-align:center}.upload-area:not(.has-photos) .upload-heading>:deep(.anticon){justify-self:center;font-size:40px;margin:24px 0 12px}.upload-area:not(.has-photos) .batch-actions{justify-content:center}.batch-actions :deep(.ant-btn){display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:148px}.upload-area{align-content:start;min-height:420px}.upload-area:not(.has-photos)>p.muted{margin-top:auto;text-align:center}.submit-area>p{line-height:1.8}.preferences :deep(.ant-collapse-header){padding-left:0!important}.embedded-intake .quota-line{margin-top:0}
@media(max-width:767px){.batch-upload-layout{grid-template-columns:1fr;gap:20px}.batch-preferences-panel{padding:20px}.batch-upload-layout>.submit-area{grid-template-columns:1fr}.batch-upload-layout>.submit-area>.ant-btn{grid-column:1;grid-row:auto;width:100%}.upload-area{min-height:300px}.batch-actions{display:grid;grid-template-columns:1fr 1fr;width:100%}.batch-actions :deep(.ant-btn){min-width:0;padding:0 10px}.batch-cost-alert{padding:16px}.batch-upload-layout>.submit-area .action-reason{grid-column:auto}}
</style>

<style scoped>
.batch-intake{max-width:1100px;gap:24px}.workspace-steps{max-width:600px;margin-bottom:8px}.workspace-toolbar,.workspace-toolbar>div,.preference-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.workspace-toolbar{flex-wrap:wrap}.workspace-toolbar>div{justify-content:flex-end}.preference-title h2{margin:0}.processing-modes{display:grid;gap:16px}.processing-modes :deep(.ant-radio-wrapper){align-items:center;margin:0;padding:16px;border:1px solid var(--line);border-radius:8px;min-height:88px}.processing-modes :deep(.ant-radio-wrapper-checked){background:var(--selection-bg);border-color:var(--blue)}.processing-modes strong,.processing-modes small{display:block}.processing-modes small{color:var(--muted);font-size:13px;line-height:1.7;margin-top:4px}.help-copy{max-width:340px;font-size:14px;line-height:1.8}.processing-state{display:grid;justify-items:center;gap:24px;text-align:center;padding:64px 24px;background:var(--surface);border:1px solid var(--line);border-radius:12px}.processing-state h2{font-size:20px;margin:0}.processing-state p{color:var(--muted);font-size:14px;line-height:1.8}.processing-phases{display:flex;gap:24px;flex-wrap:wrap;justify-content:center;color:var(--muted);font-size:13px}.result-image{display:flex;align-items:center;justify-content:center}.result-image :deep(.target-preview){width:144px;height:144px}.status-heading h1{margin-top:0}.batch-intake :deep(.ant-steps){min-width:0}.batch-intake :deep(.ant-radio-button-wrapper){min-height:44px;display:inline-flex;align-items:center;justify-content:center}.quota-line{margin:0}.target-identity h3{margin:0}
@media(max-width:640px){.workspace-steps :deep(.ant-steps-item-title){font-size:12px}.workspace-toolbar{gap:8px}.processing-state{padding:48px 16px}.processing-phases{gap:12px}.status-heading h1{font-size:20px}.target-grid{gap:16px}}
</style>

<style scoped>
.result-summary{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:14px}.result-summary span{color:var(--muted);font-size:13px}.compact-results{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.compact-results .target-body{padding:20px;gap:12px;min-height:140px;display:flex;flex-direction:column;height:100%}.compact-results .target-identity{margin:0;min-width:0}.target-identity>div{min-width:0}.compact-results h3{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.compact-results .muted{margin:6px 0 0}.result-thumb{width:64px;height:64px;object-fit:contain;background:var(--surface-alt);border-radius:8px;flex:none}.result-actions{margin-top:auto;display:flex;gap:8px;justify-content:flex-end;align-items:center}.result-actions :deep(.ant-btn){min-width:44px}.result-actions :deep(.ant-btn-text){min-width:44px;padding:0}.compact-results .target{border-radius:10px}@media(max-width:640px){.compact-results{grid-template-columns:1fr;gap:12px}.compact-results .target-body{padding:16px}.result-summary{gap:6px}.compact-results .target-identity{gap:12px}.compact-results h3{font-size:14px}}
</style>
