<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { agentRequest } from './api'
import { fieldLabels } from '../services/api'
import { mediaUrl } from '../services/urls'
type Command = { id: string; kind: string; parameters: Record<string, any>; status: string; requiresConfirmation: boolean; expiresAt: number; result: any; canUndo: boolean }
const props = defineProps<{ command: Command }>(); const current = ref({ ...props.command }); const busy = ref(false)
const { message } = App.useApp(); watch(() => props.command, v => { current.value = { ...v } })
const labels: Record<string, string> = { GARMENT_BASIC: '修改衣物', GARMENT_METADATA: '修改衣物资料', GARMENT_TRASH: '回收衣物', GARMENT_RESTORE: '恢复衣物', MEMORY_PATCH: '维护长期记忆', BASELINE_GENERATION: '生成个人基准人物', OOTD_GENERATION: '生成 OOTD 穿搭图',GARMENT_BATCH:'批量修改衣物',GARMENT_WORKFLOW:'启动衣物处理',TASK_CANCEL:'取消任务',PROFILE_EDIT:'修改个人资料',BASELINE_DELETE:'删除基准人物',OOTD_DELETE:'永久删除 OOTD' }
const isGeneration = computed(() => current.value.kind.endsWith('_GENERATION'))
const sourceLabels: Record<string,string> = {USER_REPORTED:'已填写',TEMPLATE_DEFAULT:'模板默认',DERIVED_DEFAULT:'按 BMI 22 计算的示意值'}
const statusText = computed(() => ({PREPARED:'等待确认，尚未执行',SUCCEEDED:isGeneration.value?'已提交任务，离开聊天后继续处理':current.value.canUndo?'已执行，可撤销':'已执行',UNDONE:'已撤销',CANCELLED:'已取消'}[current.value.status] || current.value.status))
const changes = computed(() => {
  const p = current.value.parameters; const rows: {label:string;value:string}[] = []
  if(p.name !== undefined)rows.push({label:'名称',value:String(p.name)})
  if(p.favorite !== undefined)rows.push({label:'收藏',value:p.favorite?'加入收藏':'取消收藏'})
  if(p.fields)for(const [key,value] of Object.entries(p.fields))rows.push({label:(fieldLabels as Record<string,string>)[key]||({sex:'性别',heightCm:'身高（cm）',weightKg:'体重（kg）',bodyShape:'身材',preferences:'偏好',measurements:'围度'} as Record<string,string>)[key]||key,value:Array.isArray(value)?value.join('、'):value&&typeof value==='object'?JSON.stringify(value):value===null?'清空':String(value)})
  if(p.operation)rows.push({label:'文档操作',value:({APPEND:'添加内容',REPLACE:'替换片段',REMOVE:'删除片段',REPLACE_ALL:'替换整份文档'} as Record<string,string>)[p.operation]||p.operation})
  if(p.oldContent)rows.push({label:'原内容',value:p.oldContent})
  if(p.newContent !== undefined)rows.push({label:'新内容',value:p.newContent||'清空'})
  if(p.targetLabels)rows.push({label:'本次衣物',value:p.targetLabels.join('、')})
  if(p.request){rows.push({label:'处理模型',value:p.request.provider+' / '+p.request.model},{label:'图像额度',value:String(p.quotaUnits)+' 个，确认后才启动'});if(p.request.prompt)rows.push({label:'图片要求',value:p.request.prompt});if(p.request.targetDescription)rows.push({label:'衣物说明',value:p.request.targetDescription})}
  if (isGeneration.value) {
    rows.push({label:'生成模型',value:p.provider+' / '+p.model},{label:'图像额度',value:String(p.quotaUnits)+' 个，每次单张，不自动重生'})
    if(p.profile) {
      for(const [key,label] of Object.entries({sex:'性别',heightCm:'身高（cm）',weightKg:'体重（kg）',bodyShape:'身材'})) {
        const value=p.profile[key];if(value!==undefined)rows.push({label,value:(key==='sex'?({MALE:'男',FEMALE:'女'} as Record<string,string>)[value]:String(value))+' · '+(sourceLabels[p.profile.sources?.[key]]||'本次冻结资料')})
      }
    }
    if(p.review?.items)rows.push({label:'本次物品',value:p.review.items.map((i:any)=>i.label).join('、')})
  }
  return rows
})
async function act(action: string) { busy.value = true; try { current.value = await agentRequest(`/commands/${current.value.id}/${action}`, 'POST', {}); window.dispatchEvent(new Event(isGeneration.value?'closet-render-changed':current.value.kind==='MEMORY_PATCH'?'closet-agent-memory-changed':'closet-garment-changed')); } catch(e) { message.error(String(e)) } finally { busy.value = false } }
</script>
<template>
  <a-card class="agent-command-card" size="small">
    <template #title><span class="command-title">{{ labels[current.kind] || '平台操作' }}</span></template>
    <template #extra><a-tag>{{ statusText }}</a-tag></template>
    <p class="command-target">{{ current.parameters.targetLabel || '已选对象' }}</p>
    <a-descriptions :column="1" size="small" :colon="false"><a-descriptions-item v-for="row in changes" :key="row.label" :label="row.label"><span class="command-value">{{ row.value }}</span></a-descriptions-item></a-descriptions>
    <img v-if="current.parameters.photoUrl" :src="mediaUrl(current.parameters.photoUrl)" alt="本次参考全身照" class="command-photo" />
    <a-alert v-for="issue in current.parameters.review?.warnings || []" :key="issue.code" type="warning" :message="issue.message" />
    <RouterLink v-if="(isGeneration || current.kind==='GARMENT_WORKFLOW') && current.status==='SUCCEEDED'" to="/tasks">查看任务进度</RouterLink>
    <a-space wrap v-if="current.status === 'PREPARED'" class="command-actions"><a-button type="primary" size="small" :loading="busy" @click="act('confirm')">{{ isGeneration?'确认生成单张':'确认操作' }}</a-button><a-button size="small" :disabled="busy" @click="act('cancel')">取消</a-button></a-space>
    <a-button v-else-if="current.canUndo" class="command-actions" size="small" :loading="busy" @click="act('undo')">撤销</a-button>
  </a-card>
</template>
<style scoped>
.agent-command-card{min-width:0;background:var(--surface);border-color:var(--line)}.agent-command-card :deep(.ant-card-head-wrapper){flex-wrap:wrap;gap:8px}.agent-command-card :deep(.ant-card-head-title){white-space:normal}.agent-command-card :deep(.ant-card-extra){margin-inline-start:0}.agent-command-card :deep(.ant-tag){white-space:normal;margin:0}.command-title{font-size:14px;font-weight:600}.command-target{color:var(--muted-copy);margin:0 0 12px;font-size:13px}.command-value{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}.command-actions{margin-top:12px}.command-photo{max-width:120px;max-height:180px;object-fit:contain}
</style>
