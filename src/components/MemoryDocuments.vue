<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { agentRequest } from '../agent/api'
type Document = { kind: string; content: string; revision: number; updatedAt: number }
type Permission = { purpose: string; revision: number; expiresAt: number }
const { message } = App.useApp()
const documents = ref<Document[]>([]); const drafts = ref<Record<string, string>>({}); const permissions = ref<Permission[]>([])
const busy = ref(''); const error = ref(''); const loading = ref(true)
const purposes = [{ value: 'OUTFIT', label: '个性化搭配' }, { value: 'BASELINE', label: '基准人物' }, { value: 'OOTD', label: 'OOTD 穿搭图' }]
async function load(preserve = false) {
  try {
    const [docs, grants] = await Promise.all([agentRequest<Document[]>('/memory-documents'), agentRequest<Permission[]>('/memory-permissions')])
    for (const doc of docs) if (!preserve || drafts.value[doc.kind] === documents.value.find(d => d.kind === doc.kind)?.content) drafts.value[doc.kind] = doc.content
    documents.value = docs; permissions.value = grants; error.value = ''
  } catch (e) { error.value = String(e) } finally { loading.value = false }
}
async function save(doc: Document) {
  busy.value = doc.kind
  try { const saved = await agentRequest<Document>(`/memory-documents/${doc.kind}`, 'PUT', { revision: doc.revision, content: drafts.value[doc.kind] }); Object.assign(doc, saved); if(doc.kind==='SENSITIVE')permissions.value = []; message.success('记忆文档已保存，旧上下文已隔离。') }
  catch (e) { error.value = String(e); message.error('保存未完成，输入已保留。请核对最新版本。') } finally { busy.value = '' }
}
async function permission(purpose: string, checked: boolean) {
  try {
    if (checked) await agentRequest('/memory-permissions', 'POST', { purpose, revision: documents.value.find(d => d.kind === 'SENSITIVE')?.revision })
    else await agentRequest(`/memory-permissions/${purpose}`, 'DELETE')
    permissions.value = await agentRequest<Permission[]>('/memory-permissions')
  } catch (e) { message.error(String(e)) }
}
function refresh() { void load(true) }
function exportDoc(doc: Document) { const url = URL.createObjectURL(new Blob([doc.content], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = doc.kind === 'GENERAL' ? '通用长期记忆.md' : '敏感长期记忆.md'; a.click(); URL.revokeObjectURL(url) }
onMounted(() => { void load(); window.addEventListener('closet-agent-memory-changed', refresh) })
onUnmounted(() => window.removeEventListener('closet-agent-memory-changed', refresh))
</script>
<template>
  <section aria-label="长期记忆文档">
    <h2>长期记忆</h2><p class="settings-hint">直接查看和编辑原始文档。删除聊天不会删除记忆；临时穿搭要求不会自动变为长期偏好。</p>
    <a-alert v-if="error" type="error" :message="error" show-icon><template #action><a-button @click="load(true)">核对最新版本</a-button></template></a-alert>
    <a-skeleton v-if="loading" active />
    <div v-for="doc in documents" :key="doc.kind" class="memory-document">
      <h3>{{ doc.kind === 'GENERAL' ? '通用长期记忆' : '敏感长期记忆' }}</h3>
      <p class="settings-hint">{{ doc.kind === 'GENERAL' ? '颜色、风格和长期穿搭偏好。身体、健康和联系方式请放入敏感文档。' : '保存与使用授权分开；数量查询和普通问答不会读取身体资料。' }}</p>
      <a-alert v-if="doc.kind==='GENERAL' && /身高|体重|体型|身材|围度|胸围|腰围|臀围|病史|手机号|身份证|地址/.test(drafts[doc.kind]||'')" type="warning" message="这里含有可能敏感的内容，请转入敏感文档并按用途授权。自由文本无法保证完整识别敏感信息。" style="margin-bottom:12px" />
      <a-textarea v-model:value="drafts[doc.kind]" :aria-label="doc.kind === 'GENERAL' ? '通用长期记忆原始文档' : '敏感长期记忆原始文档'" :maxlength="20000" :auto-size="{ minRows: 6, maxRows: 16 }" />
      <a-space wrap style="margin-top:12px"><a-button type="primary" :loading="busy === doc.kind" :disabled="drafts[doc.kind] === doc.content" @click="save(doc)">保存文档</a-button><a-button @click="exportDoc(doc)">导出 Markdown</a-button><span class="muted">版本 {{ doc.revision }}</span></a-space>
      <div v-if="doc.kind === 'SENSITIVE'" style="margin-top:16px"><p>允许按用途读取相关片段</p><a-space direction="vertical"><a-checkbox v-for="purpose in purposes" :key="purpose.value" :checked="permissions.some(p => p.purpose === purpose.value && p.revision === doc.revision)" :disabled="drafts[doc.kind] !== doc.content" @change="permission(purpose.value, $event.target.checked)">{{ purpose.label }}</a-checkbox></a-space><p class="settings-hint">文档变化后需重新授权。撤销后停止后续使用；已经发送给上游的内容无法撤回。</p></div>
    </div>
  </section>
</template>
<style scoped>.memory-document + .memory-document { margin-top: 28px; }</style>
