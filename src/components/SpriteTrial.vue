<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BatchTargetPreview from './BatchTargetPreview.vue'
import type { BatchSource, BatchTarget } from '../services/batches'
import { generationUnits } from '../domain/intake'
const props=defineProps<{targets:BatchTarget[]; disabled:boolean; quota:number|null; configured:boolean; sources:BatchSource[]; allTargets:BatchTarget[]; batchId:string; resetKey:number}>()
const emit=defineEmits<{submit:[options:{targetIds:string[];groupSize:number}]}>()
const groupSize=ref(2),selected=ref<string[]>([])
try {
  const saved=JSON.parse(localStorage.getItem(`closet-batch:${props.batchId}:sprite-selection`) || '{}')
  if(Number.isInteger(saved.groupSize))groupSize.value=Math.max(1,Math.min(10,saved.groupSize))
  if(Array.isArray(saved.ids))selected.value=saved.ids.filter((id:unknown)=>typeof id==='string' && props.targets.some(t=>t.id===id))
}catch{ /* Invalid local state starts with an empty selection. */ }
watch([groupSize,selected],()=>localStorage.setItem(`closet-batch:${props.batchId}:sprite-selection`,JSON.stringify({groupSize:groupSize.value,ids:selected.value})),{deep:true})
watch(()=>props.resetKey,()=>{selected.value=[]})
const maxGroup=computed(()=>Math.min(10,props.targets.length))
const orderedSelected=computed(()=>props.targets.filter(t=>selected.value.includes(t.id)))
const requests=computed(()=>generationUnits(selected.value.length,groupSize.value))
const blocked=computed(()=>!selected.value.length?'选择想试用的衣物。':!props.configured?'整理服务尚未配置。':props.quota===null?'正在读取额度。':requests.value>props.quota?`需要 ${requests.value} 次额度，今日剩余 ${props.quota} 次。可以减少选择，或增加每次件数。`:'')
watch(()=>props.targets.map(t=>t.id).join(','),()=>{
  groupSize.value=Math.max(1,Math.min(groupSize.value,maxGroup.value))
  selected.value=selected.value.filter(id=>props.targets.some(t=>t.id===id))
},{immediate:true})
function choose(id:string,checked:boolean){selected.value=checked?[...selected.value,id]:selected.value.filter(value=>value!==id)}
function selectAll(){selected.value=props.targets.map(t=>t.id)}
function firstGroup(){selected.value=props.targets.slice(0,groupSize.value).map(t=>t.id)}
function submit(){if(props.disabled||blocked.value)return;emit('submit',{targetIds:props.targets.filter(t=>selected.value.includes(t.id)).map(t=>t.id),groupSize:groupSize.value})}
</script>
<template>
  <div class="sprite-trial">
    <div class="slider-heading"><label for="sprite-count">每次最多整理几件</label><strong>{{groupSize}} 件</strong></div>
    <a-slider id="sprite-count" v-model:value="groupSize" :min="1" :max="Math.max(1,maxGroup)" :step="1" :disabled="disabled || maxGroup<2" :marks="maxGroup>1?{1:'1 件',[maxGroup]:`${maxGroup} 件`}:{1:'1 件'}" :tip-formatter="(value:number)=>`${value} 件 / 次`" />
    <p class="muted">找到 {{targets.length}} 件可整理的衣物。调整每次件数后，勾选需要整理的衣物；件数较多时采用二维网格。</p>
    <div class="selection-heading"><strong>选 {{selected.length}} 件试用</strong><a-button type="link" :disabled="disabled" @click="firstGroup">只选一组</a-button><a-button type="link" :disabled="disabled" @click="selectAll">选全部 {{targets.length}} 件</a-button></div>
    <div class="choices"><a-checkbox v-for="target in targets" :key="target.id" :checked="selected.includes(target.id)" :disabled="disabled" @change="choose(target.id,$event.target.checked)"><span class="choice-content"><BatchTargetPreview :target="target" :source="sources.find(s=>s.id===target.sourceId)" /><span class="choice-text"><strong>#{{allTargets.findIndex(t=>t.id===target.id)+1}} {{target.recognition.target.description}}</strong><small v-if="selected.includes(target.id)">第 {{Math.floor(orderedSelected.findIndex(t=>t.id===target.id)/groupSize)+1}} 组 · 第 {{orderedSelected.findIndex(t=>t.id===target.id)%groupSize+1}} 格</small><small v-else>{{target.outputUrl?'已有结果 · 可重做':'尚未整理'}}</small></span></span></a-checkbox></div>
    <div class="trial-summary"><strong>{{selected.length}} 件 → {{requests}} 次整理请求</strong><span class="muted">逐件需要 {{selected.length}} 次；合图生成后会拆成独立衣物，再做透明处理和贴纸。件数越多，每件细节可能变小，需要核对颜色、图案和结构。</span><p v-if="blocked" class="muted" role="status">{{blocked}}</p><a-button type="primary" size="large"  :disabled="disabled || !!blocked" @click="submit">{{groupSize===1?'逐件试用':'合图试用'}} {{selected.length}} 件 · {{requests}} 次额度</a-button></div>
  </div>
</template>
<style scoped>
.sprite-trial{display:grid;gap:16px}.slider-heading,.selection-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.slider-heading{justify-content:space-between}.slider-heading label{font-weight:600}.sprite-trial :deep(.ant-slider){margin:8px 12px 26px}.sprite-trial :deep(.ant-slider-mark-text){white-space:nowrap}.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 20px}.choices :deep(.ant-checkbox-wrapper){min-height:44px;line-height:1.6;align-items:center;margin:0;padding:8px 0;overflow-wrap:anywhere}.choices :deep(.ant-checkbox){top:0}.choices :deep(.ant-checkbox+span){flex:1;min-width:0;padding-inline-start:12px}.choice-content{display:flex;gap:12px;align-items:center}.choice-text{display:grid;gap:4px;min-width:0}.choice-text strong{font-size:14px;font-weight:500}.choice-text small{color:var(--muted);font-size:12px}.muted{color:var(--muted);font-size:13px;line-height:1.7}.trial-summary{display:grid;gap:12px;border-top:1px solid var(--line);padding-top:16px}.trial-summary :deep(.ant-btn){justify-self:start}.sprite-trial :deep(.ant-btn){min-height:44px}@media(max-width:640px){.choices{grid-template-columns:1fr}.trial-summary :deep(.ant-btn){justify-self:stretch}.selection-heading{gap:4px}}
</style>
