<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { CloseOutlined, PlusOutlined, SendOutlined, PushpinOutlined, PushpinFilled, MoreOutlined, HistoryOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { usingMocks } from '../services/api'
import { agentRequest, streamMessage, type AgentSession, type AgentMessage, type Models, type Memory, type Quota } from './api'
import { pageContext } from './bridge'
import AgentProposal from './AgentProposal.vue'
import AssistantOrb from './AssistantOrb.vue'
import AssistantFace from './AssistantFace.vue'
import SoundToggle from '../components/SoundToggle.vue'
import { playSound } from '../services/sound'
import { useClosetStore } from '../stores/closet'
import { useFloatingPosition } from './useFloatingPosition'
const route = useRoute(); const router = useRouter(); const { modal, message } = App.useApp()
const open = ref(false); const busy = ref(false); const loading = ref(false); const status = ref(''); const error = ref(''); const input = ref('')
const sessions = ref<AgentSession[]>([]); const selected = ref(''); const messages = ref<AgentMessage[]>([])
const models = ref<Models>({ defaultModel: '', models: [], configured: false }); const personalModel = ref(''); const quota = ref<Quota | null>(null)
const imageConsent = ref(false); const personalConsent = ref(false); const compact = ref(window.innerWidth < 1024)
const textarea = ref<{ focus: () => void } | null>(null); const transcript = ref<HTMLDivElement | null>(null); const panel = ref<HTMLElement | null>(null); const launcher = ref<{ focus: () => void } | null>(null)
let abort: AbortController | undefined
const closet = useClosetStore()
const historyOpen = ref(false); const renameOpen = ref(false); const renameTitle = ref(''); const renaming = ref(false)
const optionsOpen = ref(false); const expression = ref('auto'); const delighted = ref(false)
const pinned = ref(true); const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const pinKey = computed(() => `yixu.assistant-pin.v1:${closet.user?.username || 'local'}`)
const panelKey = computed(() => `yixu.assistant-panel.v1:${closet.user?.username || 'local'}`)
const dimensions = computed(() => ({ width: Math.min(420, viewport.value.width - 16), height: Math.min(720, viewport.value.height - 112) }))
const floating = useFloatingPosition(panelKey, dimensions, () => 100)
const panelStyle = computed(() => compact.value || pinned.value ? undefined : { ...floating.style.value, width: `${dimensions.value.width}px`, height: `${dimensions.value.height}px` })
const mood = computed(() => busy.value ? 'thinking' : error.value ? 'concern' : delighted.value ? 'happy' : expression.value === 'auto' ? 'idle' : expression.value)
const modelOptions = computed(() => [{ value: '', label: `个人默认 · ${personalModel.value || models.value.defaultModel}` }, ...models.value.models.map(value => ({ value, label: value }))])
let delightTimer: ReturnType<typeof setTimeout> | undefined
function celebrate() { delighted.value = true; clearTimeout(delightTimer); delightTimer = setTimeout(() => { delighted.value = false }, 2400) }
function togglePin() { pinned.value = !pinned.value; try { localStorage.setItem(pinKey.value, String(pinned.value)) } catch {} playSound('latch') }
function startPanelDrag(event: PointerEvent) { if (!pinned.value && !compact.value) floating.start(event) }
function close() { open.value = false; optionsOpen.value = false; playSound('off'); void nextTick(() => launcher.value?.focus()) }
function nearBottom() { return !transcript.value || transcript.value.scrollHeight - transcript.value.scrollTop - transcript.value.clientHeight < 72 }

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
async function setModel(value: string) { if (!session.value) return; const target = session.value; const model = value || null; try { const updated = await agentRequest<AgentSession>(`/sessions/${selected.value}`, 'PUT', { title: target.title, model }); Object.assign(target, updated) } catch (e) { error.value = String(e) } }
function rename() { if (session.value) { renameTitle.value = session.value.title; renameOpen.value = true } }
async function saveTitle() {
  if (!session.value || !renameTitle.value.trim()) return
  renaming.value = true
  try { const target = session.value; const updated = await agentRequest<AgentSession>(`/sessions/${target.id}`, 'PUT', { title: renameTitle.value.trim(), model: target.model }); Object.assign(target, updated); renameOpen.value = false; playSound('success') }
  catch (e) { message.error(String(e)) } finally { renaming.value = false }
}
async function chooseSession(id: string) { selected.value = id; historyOpen.value = false; await selectSession(); await scrollBottom() }
function menuAction({ key }: { key: string | number }) {
  if (key === 'rename') rename()
  else if (key === 'delete') deleteChats()
  else if (key === 'clear') deleteChats(true)
  else if (key === 'memory') { void router.push('/settings'); showPage() }
  else if (key === 'help') { void router.push('/help?article=03-assistant'); showPage() }
}
function deleteChats(all = false) {
  modal.confirm({ title: all ? '清空所有聊天？' : '删除当前对话？', content: '聊天记录和长期记忆独立管理，这个操作会保留所有记忆。', okText: '确认删除', cancelText: '取消', async onOk() { await agentRequest(all ? '/sessions' : `/sessions/${selected.value}`, 'DELETE'); selected.value = ''; messages.value = []; await refreshSessions(); playSound('success'); } })
}
async function undoMemory(memory: Memory) { try { await agentRequest(`/memories/${memory.id}`, 'DELETE'); Object.assign(memory, { revoked: true }); window.dispatchEvent(new Event('closet-agent-memory-changed')); message.success('已删除这条记忆。') } catch (e) { message.error(String(e)) } }
async function scrollBottom() { await nextTick(); if (transcript.value) transcript.value.scrollTop = transcript.value.scrollHeight }
async function send() {
  if (busy.value || !input.value.trim() || !models.value.configured) return
  error.value = ''; busy.value = true; status.value = '正在提交'; playSound('bubble'); let reply: AgentMessage | undefined
  const body = { requestId: crypto.randomUUID(), content: input.value.trim(), context: context.value, imageConsent: imageConsent.value, personalMemoryConsent: personalConsent.value }
  try {
    if (!selected.value) await createSession()
    messages.value.push({ id: body.requestId, role: 'user', content: body.content, status: 'COMPLETE', events: [] })
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', content: '', status: 'RUNNING', events: [] }); reply = messages.value[messages.value.length - 1]
    input.value = ''; imageConsent.value = false; personalConsent.value = false; abort = new AbortController(); await scrollBottom()
    await streamMessage(selected.value, body, event => {
      const follow = nearBottom()
      if (event.event === 'token') reply!.content += event.data.text
      else if (event.event === 'status') status.value = event.data.text
      else if (event.event === 'done') { reply!.status = 'COMPLETE'; quota.value = event.data.quota; celebrate(); playSound('complete') }
      else if (event.event === 'error') { error.value = event.data.message; reply!.status = 'FAILED'; playSound('error') }
      else {
        reply!.events.push(event)
        if (event.event === 'memory') window.dispatchEvent(new Event('closet-agent-memory-changed'))
        if (event.event === 'navigation') { void router.push(event.data.path); showPage() }
      }
      if (follow) void scrollBottom()
    }, abort.signal)
  } catch (e) { error.value = e instanceof Error ? e.message : '回复未完成。'; if (reply) reply.status = 'FAILED' }
  finally { busy.value = false; status.value = ''; abort = undefined; try { await refreshSessions(); quota.value = await agentRequest<Quota>('/quota') } catch {} }
}
function showPage() { if (compact.value) open.value = false }
function enter(e: KeyboardEvent) { if (e.isComposing) return; e.preventDefault(); void send() }
async function toggle() { if (open.value) { close(); return } open.value = true; playSound('pop'); await load(); await nextTick(); await scrollBottom(); textarea.value?.focus() }
function keyboard(e: KeyboardEvent) {
  if (!open.value || [...document.querySelectorAll('.ant-modal-wrap')].some(el => el.getClientRects().length)) return
  if (e.key === 'Escape' && [...document.querySelectorAll('.ant-dropdown, .ant-select-dropdown')].some(el => el.getClientRects().length && getComputedStyle(el).display !== 'none')) return
  if (e.key === 'Escape') { if (optionsOpen.value) { optionsOpen.value = false; return }; close(); return }
  if (compact.value && e.key === 'Tab' && panel.value) {
    const roots = [panel.value, ...document.querySelectorAll<HTMLElement>('.assistant-options-popover')]
    const elements = roots.flatMap(root => [...root.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), a[href], input:not(:disabled)')]).filter(el => el.offsetParent && el.tabIndex >= 0)
    if (e.shiftKey && document.activeElement === elements[0]) { e.preventDefault(); elements.at(-1)?.focus() }
    else if (!e.shiftKey && document.activeElement === elements.at(-1)) { e.preventDefault(); elements[0]?.focus() }
  }
}
function resize() { compact.value = window.innerWidth < 1024; viewport.value = { width: window.innerWidth, height: window.innerHeight } }
watch(() => route.path, () => { imageConsent.value = false; personalConsent.value = false })
watch([open, compact], ([visible, mobile]) => document.documentElement.classList.toggle('assistant-mobile-open', visible && mobile))
onMounted(() => { try { pinned.value = localStorage.getItem(pinKey.value) !== 'false' } catch {}; window.addEventListener('resize', resize); window.addEventListener('keydown', keyboard) })
onUnmounted(() => { abort?.abort(); clearTimeout(delightTimer); window.removeEventListener('resize', resize); window.removeEventListener('keydown', keyboard); document.documentElement.classList.remove('assistant-mobile-open') })
</script>
<template>
  <AssistantOrb ref="launcher" :open="open" :mood="mood" :busy="busy" @toggle="toggle" />
  <Teleport to="body">
    <Transition name="assistant-scrim"><div v-if="open && compact" class="assistant-scrim" @click="close" /></Transition>
    <Transition name="assistant-window">
      <aside v-if="open" id="closet-assistant" ref="panel" class="assistant-panel" :class="{ pinned, floating: !pinned, dragging: floating.dragging.value }" :style="panelStyle" :role="compact ? 'dialog' : 'complementary'" :aria-modal="compact || undefined" aria-label="个人助手">
        <header class="assistant-header" @pointerdown="startPanelDrag" @pointermove="floating.move" @pointerup="floating.end" @pointercancel="floating.end" @lostpointercapture="floating.end">
          <div class="assistant-identity"><AssistantFace :mood="mood" /><div><strong>衣序助手</strong><small :title="session?.title">{{ session?.title || '今天也一起好好穿衣' }}</small></div></div>
          <div class="assistant-header-actions" data-no-drag>
            <a-tooltip title="新建对话"><a-button type="text" aria-label="新建对话" :disabled="busy || usingMocks" @click="newSession"><PlusOutlined /></a-button></a-tooltip>
            <a-tooltip title="聊天记录"><a-button type="text" aria-label="聊天记录" :disabled="busy || loading" @click="historyOpen = true"><HistoryOutlined /></a-button></a-tooltip>
            <a-tooltip v-if="!compact" :title="pinned ? '取消固定 · 拖动顶部移动面板' : '固定到右侧'"><a-button type="text" :aria-label="pinned ? '取消固定助手' : '固定助手到右侧'" :aria-pressed="pinned" @click="togglePin"><component :is="pinned ? PushpinFilled : PushpinOutlined" /></a-button></a-tooltip>
            <a-dropdown :trigger="['click']"><a-button type="text" aria-label="更多助手操作"><MoreOutlined /></a-button><template #overlay><a-menu @click="menuAction"><a-menu-item key="rename" :disabled="!selected || busy">重命名当前对话</a-menu-item><a-menu-item key="memory">管理长期记忆</a-menu-item><a-menu-item key="help">助手使用说明</a-menu-item><a-menu-divider /><a-menu-item key="delete" :disabled="!selected || busy" danger>删除当前对话</a-menu-item><a-menu-item key="clear" :disabled="!sessions.length || busy" danger>清空聊天记录</a-menu-item></a-menu></template></a-dropdown>
            <a-button type="text" aria-label="关闭个人助手" @click="close"><CloseOutlined /></a-button>
          </div>
        </header>
        <div class="assistant-context"><span class="assistant-context-dot" /><span :title="contextName">{{ contextName }}</span><small>随页面更新</small></div>
        <div ref="transcript" class="assistant-transcript" aria-label="聊天记录" aria-live="polite" :aria-busy="busy">
          <div v-if="!messages.length" class="assistant-welcome"><AssistantFace mood="happy" /><p class="eyebrow">从你的衣柜开始</p><h2>今天想怎么穿？</h2><p>告诉我场景，或选中一件衣物。<br />平台怎么用，也可以问我。</p><a-button block @click="input = '帮我组合三套通勤穿搭'; textarea?.focus()">帮我搭三套通勤穿搭</a-button><a-button block @click="input = '组合台怎么使用？'; textarea?.focus()">了解组合台怎么使用</a-button></div>
          <article v-for="item in messages" :key="item.id" class="assistant-message" :class="item.role"><small>{{ item.role === 'user' ? '你' : '衣序助手' }}</small><p v-if="item.content" class="assistant-text">{{ item.content }}</p><span v-if="item.status === 'FAILED'" class="assistant-interrupted">回复未完成</span>
            <template v-for="(event, index) in item.events" :key="index">
              <AgentProposal v-if="event.event === 'proposal'" :proposal="event.data" @applied="showPage" />
              <div v-else-if="event.event === 'memory'" class="assistant-memory-notice"><span>{{ event.data.revoked ? '已撤销' : '已记住' }}：{{ event.data.content }}</span><a-button v-if="!event.data.revoked" type="link" size="small" @click="undoMemory(event.data)">撤销记忆</a-button></div>
              <div v-else-if="event.event === 'sources' && event.data.articles?.length" class="assistant-sources"><RouterLink v-for="article in event.data.articles" :key="article.id" :to="article.href" @click="showPage">{{ article.title }} ↗</RouterLink></div>
            </template>
          </article>
          <p v-if="busy" class="assistant-run-status" role="status"><span />{{ status || '正在回复' }}</p>
        </div>
        <footer class="assistant-composer">
          <a-alert v-if="error" type="error" :message="error" show-icon closable @close="error = ''" />
          <p v-if="!models.configured && !loading" class="assistant-not-configured">{{ usingMocks ? '演示模式不调用助手' : '助手尚未配置，请联系平台维护者。' }}</p>
          <form class="assistant-input-box" @submit.prevent="send">
            <a-textarea ref="textarea" v-model:value="input" aria-label="发送给助手的消息" :maxlength="4000" :auto-size="{ minRows: 1, maxRows: 4 }" placeholder="想怎么搭？或者问问平台用法…" :bordered="false" :disabled="busy || !models.configured" @keydown.enter.exact="enter" />
            <a-button type="primary" html-type="submit" shape="circle" aria-label="发送消息" data-sound="off" :loading="busy" :disabled="busy || !input.trim() || !models.configured"><SendOutlined /></a-button>
          </form>
          <div class="assistant-composer-tools">
            <div><SoundToggle /><a-popover v-model:open="optionsOpen" title="本次对话选项" trigger="click" placement="topLeft" overlay-class-name="assistant-options-popover"><a-button type="text" aria-label="助手对话选项" :aria-expanded="optionsOpen"><SettingOutlined /></a-button><template #content><div class="assistant-options"><label>本会话模型</label><a-select :value="session?.model || ''" aria-label="本会话模型" :options="modelOptions" :disabled="!selected || busy" @change="setModel" /><small v-if="!selected">发送消息或新建对话后可设置会话模型。</small><a-checkbox v-if="context.garmentId" v-model:checked="imageConsent" :disabled="busy">发送当前衣物图片到模型（仅本条）</a-checkbox><a-checkbox v-model:checked="personalConsent" :disabled="busy">同意保存本条的尺码 / 身材信息</a-checkbox><label>小助手的表情</label><a-segmented v-model:value="expression" :options="[{ value: 'auto', label: '随心' }, { value: 'idle', label: '乖巧' }, { value: 'happy', label: '开心' }, { value: 'sleep', label: '困困' }]" /><small>处理消息时会自动切换工作表情。</small></div></template></a-popover><span v-if="imageConsent || personalConsent" class="assistant-consent-badge">本条已授权</span></div>
            <small>{{ quota ? `今日剩余 ${Math.max(0, quota.limit - quota.used)} 条` : '正在读取额度' }}</small>
          </div>
        </footer>
      </aside>
    </Transition>
    <a-modal v-model:open="historyOpen" title="聊天记录" :footer="null" :width="520"><div class="assistant-history"><a-empty v-if="!sessions.length" description="还没有聊天记录" /><a-button v-for="item in sessions" :key="item.id" block :type="item.id === selected ? 'primary' : 'default'" @click="chooseSession(item.id)">{{ item.title }}</a-button></div><p class="assistant-dialog-note">聊天与长期记忆独立保存。</p></a-modal>
    <a-modal v-model:open="renameOpen" title="重命名对话" ok-text="保存名称" cancel-text="取消" :confirm-loading="renaming" :ok-button-props="{ disabled: !renameTitle.trim() }" @ok="saveTitle"><a-input v-model:value="renameTitle" aria-label="对话名称" :maxlength="100" @press-enter="saveTitle" /></a-modal>
  </Teleport>
</template>
