<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { InfoCircleOutlined, SettingOutlined, PictureOutlined } from '@ant-design/icons-vue'
import BatchTargetPreview from './BatchTargetPreview.vue'
import type { BatchSource, BatchTarget } from '../services/batches'
import { generationUnits } from '../domain/intake'
const props=defineProps<{targets:BatchTarget[]; disabled:boolean; quota:number|null; configured:boolean; sources:BatchSource[]; allTargets:BatchTarget[]; batchId:string; resetKey:number}>()
const emit=defineEmits<{submit:[options:{targetIds:string[];groupSize:number}]; back:[]; source:[]}>()
const groupSize=ref(2),selected=ref<string[]>([]), customOpen=ref(false)
try {
  const saved=JSON.parse(localStorage.getItem(`closet-batch:${props.batchId}:sprite-selection`) || '{}')
  if(Number.isInteger(saved.groupSize))groupSize.value=Math.max(2,Math.min(10,saved.groupSize))
  if(Array.isArray(saved.ids))selected.value=saved.ids.filter((id:unknown)=>typeof id==='string' && props.targets.some(t=>t.id===id))
}catch{ /* Invalid local state starts with an empty selection. */ }
watch([groupSize,selected],()=>localStorage.setItem(`closet-batch:${props.batchId}:sprite-selection`,JSON.stringify({groupSize:groupSize.value,ids:selected.value})),{deep:true})
watch(()=>props.resetKey,()=>{selected.value=[]})
const maxGroup=computed(()=>Math.min(10,props.targets.length))
const orderedSelected=computed(()=>props.targets.filter(t=>selected.value.includes(t.id)))
const requests=computed(()=>generationUnits(selected.value.length,groupSize.value))
const blocked=computed(()=>maxGroup.value<2?'合图至少需要两件可整理衣物，请返回逐件整理。':!selected.value.length?'选择想整理的衣物。':!props.configured?'整理服务尚未配置。':props.quota===null?'正在读取额度。':requests.value>props.quota?`需要 ${requests.value} 次额度，今日剩余 ${props.quota} 次。可以减少选择，或增加每次件数。`:'')
watch(()=>props.targets.map(t=>t.id).join(','),()=>{
  groupSize.value=Math.max(2,Math.min(groupSize.value,Math.max(2,maxGroup.value)))
  selected.value=selected.value.filter(id=>props.targets.some(t=>t.id===id))
},{immediate:true})
function choose(id:string,checked:boolean){selected.value=checked?[...selected.value,id]:selected.value.filter(value=>value!==id)}
function selectAll(){selected.value=props.targets.map(t=>t.id)}
function firstGroup(){selected.value=props.targets.slice(0,groupSize.value).map(t=>t.id)}
function submit(){if(props.disabled||blocked.value)return;emit('submit',{targetIds:props.targets.filter(t=>selected.value.includes(t.id)).map(t=>t.id),groupSize:groupSize.value})}
</script>
<template>
  <section class="sprite-trial" aria-label="合图衣物选择">
    <div class="group-settings">
      <div class="mode-title"><strong>合图试用 · 已开启</strong><a-popover trigger="click" title="合图试用"><template #content><p class="help-copy">将选中的衣物按组整理，生成后自动拆分、去背景并制作贴纸。更多件数可能影响细节，请对照原图核对；已有结果重新整理会占用额度。</p></template><a-button type="text" aria-label="了解合图试用"><InfoCircleOutlined /></a-button></a-popover></div>
      <div class="group-presets"><span>每组</span><a-button v-for="count in [2,3,4,6]" :key="count" :type="groupSize===count?'primary':'default'" :disabled="disabled || count>maxGroup" @click="groupSize=count">{{count}} 件</a-button><a-button v-if="![2,3,4,6].includes(groupSize)" type="primary" disabled>{{groupSize}} 件</a-button></div>
      <a-tooltip title="自定义每组件数"><a-button type="text" :disabled="disabled" aria-label="自定义每组件数" @click="customOpen=true"><SettingOutlined /></a-button></a-tooltip>
    </div>
    <div class="selection-heading"><strong>已选 {{selected.length}} / {{targets.length}} 件</strong><div class="selection-actions"><a-button :disabled="disabled || !targets.length" @click="firstGroup">只选一组</a-button><a-button :disabled="disabled || !targets.length" @click="selected.length===targets.length?selected=[]:selectAll()">{{selected.length===targets.length?'清空选择':`全选 ${targets.length} 件`}}</a-button><a-tooltip title="查看来源照片"><a-button type="text" aria-label="查看来源照片" @click="emit('source')"><PictureOutlined /></a-button></a-tooltip></div></div>
    <div class="choices"><a-checkbox v-for="target in targets" :key="target.id" :checked="selected.includes(target.id)" :disabled="disabled" :class="{selected:selected.includes(target.id)}" @change="choose(target.id,$event.target.checked)"><span class="choice-content"><BatchTargetPreview :target="target" :source="sources.find(s=>s.id===target.sourceId)" /><span class="choice-text"><strong :title="target.recognition.target.description">#{{allTargets.findIndex(t=>t.id===target.id)+1}} {{target.recognition.target.description}}</strong><small v-if="selected.includes(target.id)">第 {{Math.floor(orderedSelected.findIndex(t=>t.id===target.id)/groupSize)+1}} 组 · 第 {{orderedSelected.findIndex(t=>t.id===target.id)%groupSize+1}} 格</small><small v-else>{{target.outputUrl?'已有结果 · 可重做':'未选择'}}</small></span></span></a-checkbox></div>
    <a-empty v-if="!targets.length" description="没有可继续整理的衣物" />
    <div class="trial-summary"><div><strong>{{selected.length}} 件 → {{requests}} 组 → {{requests}} 次额度</strong><p>提交后自动合图、拆分、去背景并制作贴纸</p></div><a-popover trigger="click" title="额度怎么算"><template #content><p class="help-copy">整理额度按选中件数除以每组件数向上取整，最后一组可以少于设定件数。读取照片另计额度；拆分、去背景和贴纸制作不占 AI 额度。</p></template><a-button type="text" aria-label="查看额度说明"><InfoCircleOutlined /></a-button></a-popover></div>
    <p v-if="blocked" class="action-reason" role="status">{{blocked}}</p>
    <footer class="trial-footer"><span>已选 {{selected.length}} 件 · 每组 {{groupSize}} 件 · 本次 {{requests}} 次额度</span><div><a-button :disabled="disabled" @click="emit('back')">返回</a-button><a-button type="primary" size="large" :loading="disabled" :disabled="disabled || !!blocked" @click="submit">合图整理 {{selected.length}} 件 · {{requests}} 次</a-button></div></footer>
    <a-modal v-model:open="customOpen" title="自定义每组件数" :footer="null"><p class="help-copy">当前可整理 {{targets.length}} 件，最多每组 10 件。</p><div class="custom-counts"><a-button v-for="count in 9" :key="count" :disabled="disabled || count+1>maxGroup" :type="groupSize===count+1?'primary':'default'" @click="groupSize=count+1;customOpen=false">{{count+1}} 件</a-button></div></a-modal>
  </section>
</template>
<style scoped>
.sprite-trial{display:grid;gap:24px;min-width:0}.group-settings{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 20px;background:var(--surface);border:1px solid var(--line);border-radius:10px}.mode-title,.group-presets,.selection-heading,.selection-actions{display:flex;align-items:center;gap:12px}.mode-title{color:var(--blue);font-size:14px;white-space:nowrap}.group-presets{flex-wrap:wrap}.group-presets>span{font-size:13px;color:var(--muted);margin-right:12px}.group-presets :deep(.ant-btn){min-width:72px}.selection-heading{justify-content:space-between;flex-wrap:wrap;font-size:14px}.choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.choices :deep(.ant-checkbox-wrapper){min-width:0;min-height:128px;align-items:center;margin:0;padding:16px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);transition:border-color .15s,background .15s}.choices :deep(.ant-checkbox-wrapper:hover){border-color:var(--blue)}.choices :deep(.ant-checkbox-wrapper.selected){border-color:var(--blue);background:var(--selection-bg)}.choices :deep(.ant-checkbox){top:0}.choices :deep(.ant-checkbox+span){flex:1;min-width:0;padding-inline:12px 0}.choice-content{display:flex;gap:16px;align-items:center;min-width:0}.choice-text{display:grid;gap:12px;min-width:0}.choice-text strong{font-size:14px;font-weight:600;line-height:1.6;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.choice-text small{color:var(--muted);font-size:12px}.trial-summary{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:16px;padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:10px}.trial-summary strong{font-size:18px}.trial-summary p{font-size:13px;color:var(--muted);margin:12px 0 0}.trial-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:12px 20px;background:var(--surface);border:1px solid var(--line);border-radius:10px;margin-top:32px}.trial-footer>span{font-size:13px;color:var(--muted)}.trial-footer>div{display:flex;gap:12px}.sprite-trial :deep(.ant-btn){min-height:44px;display:inline-flex;justify-content:center;align-items:center}.help-copy{max-width:340px;font-size:14px;line-height:1.8;white-space:normal}.custom-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px}.custom-counts :deep(.ant-btn){min-height:44px}.action-reason{color:var(--muted);font-size:13px;line-height:1.7;margin:0}
@media(max-width:1100px){.choices{grid-template-columns:repeat(2,minmax(0,1fr))}.group-settings{flex-wrap:wrap}.group-presets{order:3;width:100%}}
@media(max-width:640px){.sprite-trial{gap:16px}.group-settings{padding:12px;gap:8px}.group-presets{gap:8px;flex-wrap:nowrap}.group-presets>span{display:none}.group-presets :deep(.ant-btn){flex:1;min-width:0;padding-inline:10px}.selection-heading{gap:8px}.selection-actions{gap:4px}.selection-actions :deep(.ant-btn){padding-inline:8px;font-size:13px}.choices{grid-template-columns:1fr;gap:8px}.choices :deep(.ant-checkbox-wrapper){min-height:76px;padding:10px 12px}.choice-content{gap:12px}.choice-content :deep(.target-preview){width:48px;height:48px}.choice-text{gap:4px}.trial-summary{margin:0;padding:16px}.trial-summary strong{font-size:16px}.trial-summary p{line-height:1.7}.trial-footer{margin-top:8px;padding:12px;flex-direction:column;align-items:stretch;gap:12px}.trial-footer>div{display:grid;grid-template-columns:auto minmax(0,1fr)}.trial-footer>span{font-size:12px}.trial-footer :deep(.ant-btn){font-size:13px;padding-inline:10px}}
@media(prefers-reduced-motion:reduce){.choices :deep(.ant-checkbox-wrapper){transition:none}}
</style>
