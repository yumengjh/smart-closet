<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { CloseOutlined, PlusOutlined, SendOutlined, MessageOutlined } from '@ant-design/icons-vue'
import { usingMocks } from '../services/api'
import { agentRequest, streamMessage, type AgentSession, type AgentMessage, type Models, type Memory, type Quota } from './api'
import { pageContext } from './bridge'
import AgentProposal from './AgentProposal.vue'
const route = useRoute(); const router = useRouter(); const { modal, message } = App.useApp()
const open = ref(false); const busy = ref(false); const loading = ref(false); const status = ref(''); const error = ref(''); const input = ref('')
const sessions = ref<AgentSession[]>([]); const selected = ref(''); const messages = ref<AgentMessage[]>([])
const models = ref<Models>({ defaultModel: '', models: [], configured: false }); const personalModel = ref(''); const quota = ref<Quota | null>(null)
const imageConsent = ref(false); const personalConsent = ref(false); const compact = ref(window.innerWidth < 1024)
const textarea = ref<HTMLTextAreaElement | null>(null); const transcript = ref<HTMLDivElement | null>(null); const panel = ref<HTMLElement | null>(null); const launcher = ref<HTMLButtonElement | null>(null)
let abort: AbortController | undefined
const session = computed(() => sessions.value.find(s => s.id === selected.value))
const context = computed(() => pageContext(route.path))
const contextName = computed(() => context.value.scene ? `${context.value.name || '组合台'} · ${context.value.selectedIds?.length || 0} 项选中` : context.value.garmentId ? '当前衣物详情' : ({ '/wardrobe': '我的衣柜', '/outfits': '组合台', '/settings': '我的设置', '/help': '平台帮助', '/tasks': '任务记录', '/pending': '未入柜', '/add': '添加衣物', '/trash': '回收站' } as Record<string, string>)[route.path] || '当前页面')
async function refreshSessions() { sessions.value = await agentRequest<AgentSession[]>('/sessions') }
async function load() {
  if (usingMocks) { error.value = '界面演示不调用模型，请连接真实后端使用助手。'; return }
  loading.value = true; error.value = ''
  try { const [modelList, preferences, usage] = await Promise.all([agentRequest<Models>('/models'), agentRequest<{ model: string }>('/preferences'), agentRequest<Quota>('/quota')]); models.value = modelList; personalModel.value = preferences.model; quota.value = usage; await refreshSessions(); if (!selected.value && sessions.value.length) { selected.value = sessions.value[0].id; await selectSession() } }
  catch (e) { error.value = e instanceof Error ? e.message : '助手无法加载。' }
  finally { loading.value = false }
}
async function createSession() { const created = await agentRequest<AgentSession>('/sessions', 'POST'); sessions.value.unshift(created); selected.value = created.id; messages.value = []; return created }
async function selectSession() { if (busy.value) return; error.value = ''; const id = selected.value; try { const history = id ? await agentRequest<AgentMessage[]>(`/sessions/${id}/messages`) : []; if (selected.value === id) messages.value = history } catch (e) { error.value = String(e) } }
async function newSession() { try { await createSession(); input.value = ''; await nextTick(); textarea.value?.focus() } catch (e) { error.value = String(e) } }
async function setModel(event: Event) { if (!session.value) return; const target = session.value; const model = (event.target as HTMLSelectElement).value || null; try { const updated = await agentRequest<AgentSession>(`/sessions/${selected.value}`, 'PUT', { title: target.title, model }); Object.assign(target, updated) } catch (e) { error.value = String(e) } }
function rename() {
  if (!session.value) return
  const target = session.value
  const title = window.prompt('对话名称（最多 100 字）', target.title)
  if (title?.trim()) void agentRequest<AgentSession>(`/sessions/${target.id}`, 'PUT', { title, model: target.model }).then(updated => Object.assign(target, updated)).catch(e => { error.value = String(e) })
}
function deleteChats(all = false) {
  modal.confirm({ title: all ? '清空所有聊天？' : '删除当前对话？', content: '聊天记录和长期记忆独立管理，这个操作会保留所有记忆。', okText: '确认删除', cancelText: '取消', async onOk() { await agentRequest(all ? '/sessions' : `/sessions/${selected.value}`, 'DELETE'); selected.value = ''; messages.value = []; await refreshSessions(); } })
}
async function undoMemory(memory: Memory) { try { await agentRequest(`/memories/${memory.id}`, 'DELETE'); Object.assign(memory, { revoked: true }); window.dispatchEvent(new Event('closet-agent-memory-changed')); message.success('已删除这条记忆。') } catch (e) { message.error(String(e)) } }
async function scrollBottom() { await nextTick(); if (transcript.value) transcript.value.scrollTop = transcript.value.scrollHeight }
async function send() {
  if (busy.value || !input.value.trim() || !models.value.configured) return
  error.value = ''; busy.value = true; status.value = '正在提交'; let reply: AgentMessage | undefined
  const body = { requestId: crypto.randomUUID(), content: input.value.trim(), context: context.value, imageConsent: imageConsent.value, personalMemoryConsent: personalConsent.value }
  try {
    if (!selected.value) await createSession()
    messages.value.push({ id: body.requestId, role: 'user', content: body.content, status: 'COMPLETE', events: [] })
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', content: '', status: 'RUNNING', events: [] }); reply = messages.value[messages.value.length - 1]
    input.value = ''; imageConsent.value = false; personalConsent.value = false; abort = new AbortController(); await scrollBottom()
    await streamMessage(selected.value, body, event => {
      if (event.event === 'token') reply!.content += event.data.text
      else if (event.event === 'status') status.value = event.data.text
      else if (event.event === 'done') { reply!.status = 'COMPLETE'; quota.value = event.data.quota }
      else if (event.event === 'error') { error.value = event.data.message; reply!.status = 'FAILED' }
      else {
        reply!.events.push(event)
        if (event.event === 'memory') window.dispatchEvent(new Event('closet-agent-memory-changed'))
        if (event.event === 'navigation') { void router.push(event.data.path); showPage() }
      }
      void scrollBottom()
    }, abort.signal)
  } catch (e) { error.value = e instanceof Error ? e.message : '回复未完成。'; if (reply) reply.status = 'FAILED' }
  finally { busy.value = false; status.value = ''; abort = undefined; try { await refreshSessions(); quota.value = await agentRequest<Quota>('/quota') } catch {} }
}
function showPage() { if (compact.value) open.value = false }
function enter(e: KeyboardEvent) { if (e.isComposing) return; e.preventDefault(); void send() }
async function toggle() { open.value = !open.value; if (open.value) { await load(); await nextTick(); textarea.value?.focus() } else launcher.value?.focus() }
function keyboard(e: KeyboardEvent) {
  if (!open.value || document.querySelector('.ant-modal-wrap')?.getClientRects().length) return
  if (e.key === 'Escape') { open.value = false; launcher.value?.focus(); return }
  if (compact.value && e.key === 'Tab' && panel.value) {
    const elements = [...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], input:not(:disabled)')].filter(el => el.offsetParent)
    if (e.shiftKey && document.activeElement === elements[0]) { e.preventDefault(); elements.at(-1)?.focus() }
    else if (!e.shiftKey && document.activeElement === elements.at(-1)) { e.preventDefault(); elements[0]?.focus() }
  }
}
function resize() { compact.value = window.innerWidth < 1024 }
watch(() => route.path, () => { imageConsent.value = false; personalConsent.value = false })
watch(open, value => document.documentElement.classList.toggle('assistant-open', value))
onMounted(() => { window.addEventListener('resize', resize); window.addEventListener('keydown', keyboard) })
onUnmounted(() => { abort?.abort(); window.removeEventListener('resize', resize); window.removeEventListener('keydown', keyboard); document.documentElement.classList.remove('assistant-open') })
</script>
<template>
  <button v-if="!open" ref="launcher" class="assistant-launcher" aria-label="打开个人助手" @click="toggle"><MessageOutlined /><span>助手</span></button>
  <Teleport to="body">
    <div v-if="open && compact" class="assistant-scrim" @click="open = false" />
    <aside v-if="open" ref="panel" class="assistant-panel" :role="compact ? 'dialog' : 'complementary'" :aria-modal="compact || undefined" aria-label="个人助手">
      <header class="assistant-header"><div><span class="assistant-mark"><MessageOutlined /></span><div><strong>衣序助手</strong><small>一起找到合适的搭配</small></div></div><button aria-label="关闭个人助手" @click="toggle"><CloseOutlined /></button></header>
      <div class="assistant-session-toolbar"><select v-model="selected" aria-label="当前对话" :disabled="busy || loading" @change="selectSession"><option value="">新对话</option><option v-for="item in sessions" :key="item.id" :value="item.id">{{ item.title }}</option></select><button aria-label="新建对话" :disabled="busy || usingMocks" @click="newSession"><PlusOutlined /></button></div>
      <div class="assistant-session-actions"><button :disabled="!selected || busy" @click="rename">重命名</button><button :disabled="!selected || busy" @click="deleteChats()">删除对话</button><button :disabled="!sessions.length || busy" @click="deleteChats(true)">清空聊天</button><RouterLink to="/settings" @click="showPage">管理记忆</RouterLink></div>
      <div class="assistant-context"><span class="assistant-context-dot" />{{ contextName }}<small>随当前页面更新</small></div>
      <div ref="transcript" class="assistant-transcript" aria-label="聊天记录" aria-live="polite" :aria-busy="busy">
        <div v-if="!messages.length" class="assistant-welcome"><p class="eyebrow">从你的衣柜开始</p><h2>今天想怎么穿？</h2><p>告诉我场景，或先选中一件衣物。也可以问我怎么使用这个平台。</p><button @click="input = '帮我组合三套通勤穿搭'">从衣柜组合三套通勤穿搭</button><button @click="input = '组合台怎么使用？'">了解组合台怎么使用</button></div>
        <article v-for="item in messages" :key="item.id" class="assistant-message" :class="item.role"><small>{{ item.role === 'user' ? '你' : '衣序助手' }}</small><p v-if="item.content" class="assistant-text">{{ item.content }}</p><span v-if="item.status === 'FAILED'" class="assistant-interrupted">回复未完成</span>
          <template v-for="(event, index) in item.events" :key="index">
            <AgentProposal v-if="event.event === 'proposal'" :proposal="event.data" @applied="showPage" />
            <div v-else-if="event.event === 'memory'" class="assistant-memory-notice"><span>{{ event.data.revoked ? '已撤销' : '已记住' }}：{{ event.data.content }}</span><button v-if="!event.data.revoked" @click="undoMemory(event.data)">撤销记忆</button></div>
            <div v-else-if="event.event === 'sources' && event.data.articles?.length" class="assistant-sources"><RouterLink v-for="article in event.data.articles" :key="article.id" :to="article.href" @click="showPage">{{ article.title }} ↗</RouterLink></div>
          </template>
        </article>
        <p v-if="busy" class="assistant-run-status" role="status"><span />{{ status || '正在回复' }}</p>
      </div>
      <footer class="assistant-composer">
        <a-alert v-if="error" type="error" :message="error" show-icon closable @close="error = ''" />
        <p v-if="!models.configured && !loading" class="assistant-not-configured">{{ usingMocks ? '演示模式不调用助手' : '助手尚未配置，请联系平台维护者。' }}</p>
        <label class="assistant-model">本会话模型<select :value="session?.model || ''" aria-label="本会话模型" :disabled="!selected || busy" @change="setModel"><option value="">个人默认 · {{ personalModel || models.defaultModel }}</option><option v-for="model in models.models" :key="model" :value="model">{{ model }}</option></select></label>
        <form @submit.prevent="send"><textarea ref="textarea" v-model="input" aria-label="发送给助手的消息" maxlength="4000" rows="3" placeholder="问平台用法，或描述你的搭配想法…" :disabled="busy || !models.configured" @keydown.enter.exact="enter" /><button type="submit" aria-label="发送消息" :disabled="busy || !input.trim() || !models.configured"><SendOutlined /></button></form>
        <div class="assistant-consent"><label v-if="context.garmentId"><input v-model="imageConsent" type="checkbox" :disabled="busy" /> 发送当前衣物图片到模型</label><label><input v-model="personalConsent" type="checkbox" :disabled="busy" /> 本条同意保存尺码/身材</label></div>
        <small class="assistant-quota">{{ quota ? `今日剩余 ${Math.max(0, quota.limit - quota.used)} / ${quota.limit} 条消息` : '正在读取额度' }}<RouterLink to="/help?article=03-assistant" @click="showPage">使用说明</RouterLink></small>
      </footer>
    </aside>
  </Teleport>
</template>
