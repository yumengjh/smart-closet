<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { agentRequest, type Memory, type Models, type Quota } from './api'
import AvatarPreview from './AvatarPreview.vue'
import { avatarPreferences, applyAvatarMode, type AvatarMode } from './avatar'
import { usingMocks } from '../services/api'
const { modal, message } = App.useApp()
const models = ref<Models>({ defaultModel: '', models: [], configured: false }); const model = ref(''); const quota = ref<Quota | null>(null)
const memories = ref<Memory[]>([]); const error = ref(''); const content = ref(''); const category = ref('STYLE'); const busy = ref(false)
const editing = ref<Memory | null>(null); const editedContent = ref(''); const editingBusy = ref(false)
const categories: Record<string, string> = { STYLE: '风格', COLOR: '颜色', OCCASION: '场景', PERSONAL: '个人属性' }
async function load() {
  if (usingMocks) { error.value = '演示模式不提供真实助手设置。'; return }
  try {
    const result = await Promise.all([agentRequest<Models>('/models'), agentRequest<{ model: string; avatarMode: string }>('/preferences'), agentRequest<Quota>('/quota'), agentRequest<Memory[]>('/memories')])
    applyAvatarMode(result[1].avatarMode); models.value = result[0]; model.value = result[1].model; quota.value = result[2]; memories.value = result[3]
  } catch (e) { error.value = e instanceof Error ? e.message : '助手设置无法加载。' }
}
async function refreshMemories() { try { memories.value = await agentRequest<Memory[]>('/memories') } catch {} }
onMounted(() => { void load(); window.addEventListener('closet-agent-memory-changed', refreshMemories) })
onUnmounted(() => window.removeEventListener('closet-agent-memory-changed', refreshMemories))
async function saveModel() { try { await agentRequest('/preferences', 'PUT', { model: model.value }); message.success('个人默认模型已保存。') } catch (e) { message.error(String(e)) } }
const savingMode=ref(false)
async function saveMode(value: AvatarMode) {savingMode.value=true;try{const p=await agentRequest<{avatarMode:string}>('/preferences','PUT',{avatarMode:value});applyAvatarMode(p.avatarMode);message.success('助手动效已保存。')}catch(e){message.error(String(e))}finally{savingMode.value=false}}
async function add() {
  if (!content.value.trim()) return
  busy.value = true
  try { await agentRequest('/memories', 'POST', { content: content.value, category: category.value }); content.value = ''; memories.value = await agentRequest<Memory[]>('/memories'); message.success('偏好已保存。') }
  catch (e) { message.error(String(e)) } finally { busy.value = false }
}
function edit(memory: Memory) { editing.value = memory; editedContent.value = memory.content }
async function saveEdit() {
  if (!editing.value || !editedContent.value.trim()) return
  editingBusy.value = true
  try { await agentRequest(`/memories/${editing.value.id}`, 'PUT', { content: editedContent.value.trim(), category: editing.value.category }); editing.value = null; await refreshMemories(); message.success('记忆已更新。') }
  catch (e) { message.error(String(e)) } finally { editingBusy.value = false }
}
function remove(memory: Memory) { modal.confirm({ title: '删除这条长期记忆？', content: memory.content, okText: '删除记忆', cancelText: '取消', async onOk() { await agentRequest(`/memories/${memory.id}`, 'DELETE'); memories.value = memories.value.filter(m => m.id !== memory.id) } }) }
</script>
<template>
  <section class="settings-card agent-settings-card"><p class="eyebrow">个人助手</p><h2>默认模型与对话额度</h2><p class="settings-hint">从平台开放的模型中选择。当前对话还可以单独切换模型。</p><a-alert v-if="error" type="error" :message="error" show-icon /><div class="agent-setting-model"><a-select v-model:value="model" aria-label="个人助手默认模型" :options="models.models.map(value => ({ value, label: value }))" /><a-button :disabled="!model" @click="saveModel">保存模型</a-button></div><p v-if="quota" class="agent-setting-quota">今天已提交 <strong>{{ quota.used }}</strong> / {{ quota.limit }} 条助手消息</p><p class="settings-hint">助手消息与图像任务分开统计，每天按北京时间重置。内部工具调用不另计消息次数。</p><RouterLink to="/help?article=03-assistant">查看助手说明 ↗</RouterLink></section>
  <section class="settings-card avatar-settings-card"><p class="eyebrow">蓝色小伙伴</p><h2>角色动效</h2><p class="settings-hint">基础动画和空闲玩法不消耗模型 token。个性动效让助手每轮最多选择一次表达，只增加少量提示与控制信息，不另发模型请求。</p><a-segmented :value="avatarPreferences.mode" aria-label="助手动效模式" :disabled="savingMode||!!error" :options="[{value:'static',label:'静态'},{value:'basic',label:'基础动效'},{value:'personal',label:'Agent 个性动效'}]" @change="saveMode" /><p class="settings-hint">{{avatarPreferences.mode==='static'?'安静圆球，任务状态仍有文字提示。':avatarPreferences.mode==='basic'?'任务和拖拽跟随真实状态；收起后每隔 10–20 秒随机玩一个动作。':'真实任务优先，聊天温和表达；收起后每隔 10–20 秒随机玩一个动作。'}} 设置随账号保存，系统减少动态效果优先。</p><h3>动作预览</h3><AvatarPreview /></section>
  <section class="settings-card agent-memory-card"><p class="eyebrow">独立管理</p><h2>长期偏好记忆 <small>{{ memories.length }} / 100</small></h2><p class="settings-hint">删除聊天不会删除记忆。自动记住的偏好会提示并可撤销；尺码和身材需要明确同意。</p><form class="agent-memory-add" @submit.prevent="add"><a-select v-model:value="category" aria-label="记忆分类" :options="Object.entries(categories).map(([value, label]) => ({ value, label }))" /><a-input v-model:value="content" :maxlength="500" placeholder="例如：喜欢简约通勤风格" aria-label="新的长期记忆" /><a-button html-type="submit" :loading="busy" :disabled="!content.trim()">添加记忆</a-button></form><p v-if="!memories.length" class="settings-hint">还没有保存偏好，你可以自己添加，也可以在聊天中告诉助手。</p><ul class="agent-memory-list"><li v-for="memory in memories" :key="memory.id"><div><span>{{ categories[memory.category] }}</span><p>{{ memory.content }}</p></div><a-button type="text" @click="edit(memory)">编辑</a-button><a-button type="text" danger @click="remove(memory)">删除</a-button></li></ul></section>
<a-modal :open="Boolean(editing)" title="编辑长期记忆" ok-text="保存记忆" cancel-text="取消" :confirm-loading="editingBusy" :ok-button-props="{ disabled: !editedContent.trim() }" @cancel="editing = null" @ok="saveEdit"><a-textarea v-model:value="editedContent" aria-label="记忆内容" :maxlength="500" :auto-size="{ minRows: 3, maxRows: 8 }" show-count /></a-modal>
</template>
