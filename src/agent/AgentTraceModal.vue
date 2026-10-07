<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Tabs as ATabs, Table as ATable } from 'ant-design-vue'
const ATabPane = ATabs.TabPane
import { agentRequest } from './api'
import { mergeTrace, type TracePage, type TraceSummary } from './trace-data'
import { flushBoardTrace, traceUpload } from './trace-client'
const props = defineProps<{ open: boolean; sessionId: string; requestId?: string | null; updates: number }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()
const loading = ref(false), error = ref(''), available = ref(true), runStatus = ref(''), items = ref<TraceSummary[]>([]), tab = ref('validation')
const selected = ref<TraceSummary>(), detail = ref<any>(), detailLoading = ref(false)
let revision = 0, detailRevision = 0
const phases = [{ key: 'input', label: '输入与上下文' }, { key: 'validation', label: '选衣与校验' }, { key: 'tool', label: '工具调用' }, { key: 'canvas', label: '画布变化' }]
const visible = computed(() => items.value.filter(e => tab.value === 'validation' ? ['validation','model_output'].includes(e.phase) : tab.value === 'input' ? ['input','end','runtime_error'].includes(e.phase) : e.phase === tab.value))
const statuses: Record<string, string> = { RUNNING: '进行中', INTERRUPTED: '服务重启中断', SKIPPED: '未执行', COMPLETE: '完成', FAILED: '失败', PASSED: '通过', REJECTED: '拒绝', CAPTURED: '已记录', STARTED: '开始', REPORTED: '客户端报告', RESTORED: '本机恢复' }
const phaseName = (phase: string) => phases.find(p => p.key === phase)?.label || (phase === 'model_output' ? '模型返回' : '运行结束')
const pretty = (value: unknown) => JSON.stringify(value, null, 2)
const garmentColumns = [{ title: '衣物 / 版本', key: 'id' }, { title: '品类 → 角色', key: 'role' }, { title: '资料缺失', key: 'unknown' }]
const sceneColumns = ['elementId','garmentId','role','x','y','width','height','zIndex','assetId'].map(key => ({ title: key, dataIndex: key, key }))
const garments = computed(() => detail.value?.garments || detail.value?.result?.garments || detail.value?.result?.items || (detail.value?.result?.wearing ? [detail.value.result] : []))
const fieldNames: Record<string,string> = { fit:'版型建议', thickness:'厚薄线索', wearingModes:'穿着用途', category:'品类', primaryColor:'主色', secondaryColors:'辅色', styles:'风格', seasons:'季节', patterns:'图案', neckline:'领型', sleeveLength:'袖长', garmentLength:'衣长', texture:'质感', closure:'门襟' }
const unknownFields = (garment: any) => Object.entries(garment.fields || {}).filter(([key, values]) => !(values as any)?.length || ['UNKNOWN','CONFLICT'].includes(garment.quality?.[key]?.status)).map(([key]) => fieldNames[key] || key).join('、')
const fields = (garment: any) => Object.entries(garment.fields || {}) as [string, unknown][]
async function load(reset = false) {
  if (!props.open) return
  const current = ++revision, request = props.requestId, session = props.sessionId
  if (reset) { items.value = []; selected.value = undefined; detail.value = undefined; detailRevision++ }
  if (!request) { available.value = false; return }
  loading.value = true; error.value = ''
  try {
    let after = reset ? 0 : items.value.at(-1)?.seq || 0, more = true
    while (more) {
      const page = await agentRequest<TracePage>(`/sessions/${session}/runs/${request}/trace?afterSeq=${after}&limit=100`)
      if (current !== revision) return
      available.value = page.available; runStatus.value = page.status || ''
      items.value = mergeTrace(items.value, page.items); more = page.hasMore
      if (more && !page.items.length) throw new Error('追踪分页未返回下一页。')
      after = items.value.at(-1)?.seq || 0
    }
  } catch (e) { if (current === revision) error.value = e instanceof Error ? e.message : '记录读取失败' }
  finally { if (current === revision) loading.value = false }
}
async function inspect(item: TraceSummary) {
  const current = ++detailRevision; selected.value = item; detail.value = undefined; detailLoading.value = true
  try {
    const result = await agentRequest(`/sessions/${props.sessionId}/runs/${props.requestId}/trace/${item.seq}`)
    if (current === detailRevision) detail.value = result
  } catch (e) { if (current === detailRevision) error.value = e instanceof Error ? e.message : '详情读取失败' }
  finally { if (current === detailRevision) detailLoading.value = false }
}
watch(() => [props.open, props.sessionId, props.requestId], () => { if (props.open) { void flushBoardTrace(); void load(true) } else { revision++; detailRevision++ } })
watch(() => props.updates, () => { if (props.open) void load() })
</script>
<template>
  <a-modal :open="open" title="决策与执行记录" :width="1100" :footer="null" :destroy-on-close="true" :style="{ top: '24px' }" class="agent-trace-modal" @cancel="emit('update:open', false)">
    <a-alert type="info" show-icon message="这里展示实际输入、模型返回与执行证据，不包含隐藏思维链。结构校验通过不代表具体叠穿或审美适配已验证。" />
    <div class="trace-toolbar"><a-tag>{{ statuses[runStatus] || runStatus || '历史记录' }}</a-tag><span>{{ items.length }} 条记录</span><a-button :loading="loading" @click="load()">刷新记录</a-button></div>
    <a-alert v-if="error" type="error" show-icon :message="error" />
    <a-alert v-if="traceUpload.pending || traceUpload.error" type="warning" show-icon :message="`本机还有 ${traceUpload.pending} 条记录待上传${traceUpload.error ? ' · ' + traceUpload.error : ''}`"><template #action><a-button size="small" @click="flushBoardTrace().then(() => load())">重试上传</a-button></template></a-alert>
    <a-empty v-if="!available" description="当时未记录详细调试信息，无法还原缺失的输入和指令。" />
    <template v-else>
      <a-tabs v-model:active-key="tab" @change="selected = undefined; detail = undefined; detailRevision++"><a-tab-pane v-for="phase in phases" :key="phase.key" :tab="phase.label" /></a-tabs>
      <div class="trace-content">
        <div class="trace-events"><a-empty v-if="!visible.length" description="这个阶段尚无记录" /><a-button v-for="item in visible" :key="item.seq" block :class="{ 'trace-selected': selected?.seq === item.seq }" class="trace-event" @click="inspect(item)"><span>#{{ item.seq }} · {{ statuses[item.status] || item.status }}</span><strong>{{ item.label }}</strong><small>{{ new Date(item.createdAt).toLocaleTimeString() }} · {{ phaseName(item.phase) }}</small></a-button></div>
        <div class="trace-detail"><a-spin :spinning="detailLoading"><a-empty v-if="!selected" description="选择一条记录查看详细证据" /><template v-else>
          <h3>{{ selected.label }}</h3><a-tag>{{ selected.phase === 'model_output' ? '模型声明与返回' : detail?.evidenceSource === 'CLIENT_REPORTED' ? '客户端报告' : selected.phase === 'validation' ? '服务器校验' : '实际执行记录' }}</a-tag>
          <a-alert v-if="detail?.message" :type="['FAILED','REJECTED'].includes(selected.status) ? 'error' : 'info'" :message="detail.message" show-icon />
          <a-descriptions v-if="detail" size="small" :column="1" bordered class="trace-overview">
            <a-descriptions-item v-if="detail.callId" label="工具调用 ID">{{ detail.callId }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.name" label="工具">{{ detail.name }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.model" label="模型">{{ detail.model }} · {{ detail.reasoningEffort || '' }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.ruleVersion" label="规则版本">{{ detail.ruleVersion }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.roleCounts" label="角色数量">{{ pretty(detail.roleCounts) }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.notValidated" label="未验证">{{ detail.notValidated.join('、') }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.candidate?.reason" label="模型给出的搭配理由">{{ detail.candidate.reason }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.source" label="变化来源">{{ detail.source }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.ackStatus" label="回执状态">{{ detail.ackStatus }}</a-descriptions-item>
          </a-descriptions>
          <a-table v-if="garments.length" :columns="garmentColumns" :data-source="garments" row-key="id" :pagination="false" size="small" :scroll="{ x: 550 }">
            <template #bodyCell="{ column, record }"><template v-if="column.key === 'id'">{{ [...(record.fields?.primaryColor || []), ...(record.fields?.category || [])].join(' ') || '未命名衣物' }}<br /><small>{{ record.id }} · 版本 {{ record.revision }}</small></template><template v-else-if="column.key === 'role'">{{ record.fields?.category?.join('、') || '未知品类' }} → {{ record.wearing?.role }}<br /><small>{{ record.wearing?.basis }}</small></template><template v-else>{{ unknownFields(record) || '现有字段均有值；不包含未建模的版型、厚度等' }}</template></template>
            <template #expandedRowRender="{ record }"><a-descriptions :column="1" size="small" bordered><a-descriptions-item v-for="[key, values] in fields(record)" :key="key" :label="fieldNames[key] || key">{{ pretty(values) }} · {{ record.quality?.[key]?.source }} / {{ record.quality?.[key]?.status }}<br />{{ record.quality?.[key]?.evidence }}</a-descriptions-item></a-descriptions></template>
          </a-table>
          <template v-for="key in ['before', 'after', 'scene']" :key="key"><template v-if="detail?.[key]?.elements"><h4>{{ key === 'before' ? '执行前' : key === 'after' ? '执行后（客户端报告）' : '服务器接受的画布回执' }}</h4><a-table :columns="sceneColumns" :data-source="detail[key].elements" :row-key="(row: any) => row.elementId || row.garmentId" :pagination="false" size="small" :scroll="{ x: 1200 }" /></template></template>
          <a-collapse v-if="detail" class="trace-raw"><a-collapse-panel key="raw" header="查看完整脱敏数据（输入 / 参数 / 结果）"><pre>{{ pretty(detail) }}</pre></a-collapse-panel></a-collapse>
        </template></a-spin></div>
      </div>
    </template>
  </a-modal>
</template>
<style scoped>
.trace-toolbar{display:flex;gap:12px;align-items:center;margin:16px 0}.trace-toolbar .ant-btn{margin-left:auto}.trace-content{display:grid;grid-template-columns:280px minmax(0,1fr);gap:20px;max-height:calc(100dvh - 260px);overflow:auto}.trace-events{display:flex;flex-direction:column;gap:8px}.trace-event{height:auto;white-space:normal;text-align:left;padding:12px}.trace-selected{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}.trace-event span,.trace-event strong,.trace-event small{display:block;overflow-wrap:anywhere}.trace-event small{opacity:.75;margin-top:4px}.trace-detail{min-width:0;overflow-wrap:anywhere}.trace-overview,.trace-raw{margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto;font-size:12px}h3{margin-top:0}@media(max-width:700px){.trace-content{grid-template-columns:1fr;max-height:calc(100dvh - 290px)}.trace-events{max-height:180px;overflow:auto}}
</style>
