<script setup lang="ts">
import { createUuid } from '../domain/id'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { CloseOutlined, PlusOutlined, SendOutlined, StopOutlined, PushpinOutlined, PushpinFilled, MoreOutlined, HistoryOutlined, SettingOutlined, CheckOutlined, SkinOutlined, AppstoreOutlined, BlockOutlined, BulbOutlined } from '@ant-design/icons-vue'
import { usingMocks } from '../services/api'
import { agentRequest, streamMessage, type AgentSession, type AgentMessage, type Models, type Memory, type Quota } from './api'
import { pageContext } from './bridge'
import { AgentStreamError, failureAdvice, isStopped } from './failure'
import { userMessageText } from './question'
import { ASSISTANT_PREFILL_EVENT, ASSISTANT_SEND_EVENT, type AssistantTextDetail } from './assistantEvents'
import AgentCommandCard from './AgentCommandCard.vue'
import AgentProposal from './AgentProposal.vue'
import QuickRecommend from '../recommend/QuickRecommend.vue'
import RecommendationGroup from '../recommend/RecommendationGroup.vue'
import type { RecommendationView } from '../recommend/types'
import AgentTraceModal from './AgentTraceModal.vue'
import { discardSessionTrace, flushBoardTrace } from './trace-client'
import { handleCanvasCommand, failCanvasExecution, canvasExecution } from './canvas-runtime'
import LatticeLoader from './effects/LatticeLoader.vue'
import ThoughtLine from './effects/ThoughtLine.vue'
import AgentWorkspaceResult from './AgentWorkspaceResult.vue'
import AssistantOrb from './AssistantOrb.vue'
import BloubAvatar from './BloubAvatar.vue'
import { applyAvatarMode, validCue, type AvatarCue } from './avatar'
import SoundToggle from '../components/SoundToggle.vue'
import TaskNotice from '../components/TaskNotice.vue'
import { playSound } from '../services/sound'
import { useClosetStore } from '../stores/closet'
import { useFloatingPosition } from './useFloatingPosition'
import { clampHeight, clampSize, clampWidth, DEFAULT_FLOATING_HEIGHT, DEFAULT_WIDTH, heightBounds, keyboardSize, restoreLayout, widthBounds, type AssistantMode } from './assistantLayout'
const route = useRoute(); const router = useRouter(); const { modal, message } = App.useApp()
const open = ref(false); const busy = ref(false); const loading = ref(false); const status = ref(''); const error = ref(''); const input = ref('')
const avatarCue=ref<AvatarCue|null>(null); const activityTool=ref('')
const taskFailed=ref(false)
const activityPhase = ref<'thinking' | 'operating' | 'responding'>('thinking')
const isOperating = computed(() => busy.value && (activityPhase.value === 'operating' || !!canvasExecution.runId))
const operationSteps = computed(() => messages.value.at(-1)?.events.filter(e => e.event === 'operation_result').slice(-6).map(e => ({ text: e.data.label + (e.data.message ? ` · ${e.data.message}` : ''), success: e.data.success })) || [])
const sessions = ref<AgentSession[]>([]); const selected = ref(''); const messages = ref<AgentMessage[]>([])
const models = ref<Models>({ defaultModel: '', models: [], configured: false }); const personalModel = ref(''); const quota = ref<Quota | null>(null)
const imageConsent = ref(false); const compact = ref(window.innerWidth < 1024)
const textarea = ref<{ focus: () => void } | null>(null); const transcript = ref<HTMLDivElement | null>(null); const panel = ref<HTMLElement | null>(null); const launcher = ref<InstanceType<typeof AssistantOrb> | null>(null)
let abort: AbortController | undefined
const errorHint = ref(''); const errorNewSession = ref(false)
/** Stop button (issue #122): the browser drops its request; the server marks the turn stopped and gives the count back. */
function stop() { abort?.abort() }
function showFailure(e: unknown, fallback: string) {
  error.value = e instanceof Error ? e.message : fallback
  const advice = failureAdvice(e instanceof AgentStreamError ? e.retry : undefined)
  errorHint.value = advice.hint; errorNewSession.value = advice.newSession
}
const closet = useClosetStore()
const debugOpen = ref(false), debugRequest = ref<string | null>(null), debugUpdates = ref(0)
const historyOpen = ref(false); const renameOpen = ref(false); const renameTitle = ref(''); const renaming = ref(false)
const optionsOpen = ref(false); const layoutMenuOpen = ref(false); const delighted = ref(false)
const waitingTopics = ref(false)
const topics = [
  { label: '聊聊穿搭', prompt: '给我一些日常通勤的穿搭灵感吧。' },
  { label: '衣物养护', prompt: '有哪些简单实用的衣物收纳和养护建议？' },
  { label: '随便聊聊', prompt: '衣物正在整理，陪我轻松聊一会儿吧。' },
]
function pickTopic(prompt: string) {
  if (busy.value || input.value.trim()) { message.info('输入框里有正在编辑的消息，先保留你的草稿。'); return }
  input.value = prompt; void nextTick(() => textarea.value?.focus())
}
// Empty-chat suggestions show what the assistant can do; tapping one only fills the input.
const suggestions = [
  { icon: SkinOutlined, text: '帮我搭三套可爱的，想穿裙子' },
  { icon: AppstoreOutlined, text: '看看我保存的搭配' },
  { icon: BlockOutlined, text: '有哪些可能重复的衣服' },
  { icon: BulbOutlined, text: '记住：约会时我更喜欢裙装' },
]
function suggest(text: string) { input.value = text; textarea.value?.focus() }
// Chat cards (question answers, outfit actions) send or prefill through window events.
const pendingCard = ref<AssistantTextDetail | null>(null)
function sendFromCard(event: Event) {
  const text = (event as CustomEvent<AssistantTextDetail>).detail?.text?.trim()
  if (!text) return
  input.value = text
  pendingCard.value = (event as CustomEvent<AssistantTextDetail>).detail
  if (!models.value.configured) { message.info('助手尚未配置，已把内容放进输入框'); return }
  if (busy.value) { message.info('助手正在回复，稍后再发送'); return }
  void send()
}
function prefillFromCard(event: Event) {
  const text = (event as CustomEvent<AssistantTextDetail>).detail?.text
  if (typeof text !== 'string') return
  input.value = text; void nextTick(() => textarea.value?.focus())
}
async function openFromWaiting(event: Event) {
  waitingTopics.value = Boolean((event as CustomEvent<{ waiting?: boolean }>).detail?.waiting)
  if (!open.value) await toggle()
  else { await nextTick(); textarea.value?.focus() }
}
const mode = ref<AssistantMode>('overlay'); const preferredWidth = ref(DEFAULT_WIDTH); const floatingHeight = ref(DEFAULT_FLOATING_HEIGHT); const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const pinKey = computed(() => `yixu.assistant-pin.v1:${closet.user?.username || 'local'}`)
const layoutKey = computed(() => `yixu.assistant-layout.v1:${closet.user?.username || 'local'}`)
const panelKey = computed(() => `yixu.assistant-panel.v1:${closet.user?.username || 'local'}`)
const dimensions = computed(() => ({ width: clampWidth(preferredWidth.value, viewport.value.width, mode.value), height: clampHeight(floatingHeight.value, viewport.value.height) }))
const floating = useFloatingPosition(panelKey, dimensions, () => 16)
const mobileViewport = ref({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 })
const sheetDrag = ref(0)
const panelStyle = computed(() => compact.value ? { '--vvt': `${mobileViewport.value.top}px`, '--vvh': `${mobileViewport.value.height}px`, transform: sheetDrag.value ? `translateY(${sheetDrag.value}px)` : undefined } : { width: `${dimensions.value.width}px`, ...(mode.value === 'floating' ? { ...floating.style.value, height: `${dimensions.value.height}px` } : {}) })
const modes: { key: AssistantMode; label: string }[] = [{ key: 'overlay', label: '浮在页面上' }, { key: 'docked', label: '停靠在右侧，挤开页面' }, { key: 'floating', label: '自由窗口' }]
const modeLabel = computed(() => modes.find(item => item.key === mode.value)!.label)
function persistLayout() { try { localStorage.setItem(layoutKey.value, JSON.stringify({ mode: mode.value, width: preferredWidth.value, floatingHeight: floatingHeight.value })) } catch {} }
function restorePreferences() {
  let raw: string | null = null, pin: string | null = null
  try { raw = localStorage.getItem(layoutKey.value) } catch {}
  try { pin = localStorage.getItem(pinKey.value) } catch {}
  const saved = restoreLayout(raw, pin); mode.value = saved.mode; preferredWidth.value = saved.width; floatingHeight.value = saved.floatingHeight
  persistLayout()
}
function syncDock() {
  const active = open.value && !compact.value && mode.value === 'docked', root = document.documentElement
  root.classList.toggle('assistant-docked', active)
  if (active) root.style.setProperty('--assistant-dock-width', `${dimensions.value.width}px`)
  else root.style.removeProperty('--assistant-dock-width')
}
type ResizeEdge = 'left' | 'right' | 'bottom' | 'corner'
const resizing = ref(false)
let resizeOrigin: { pointer: number; edge: ResizeEdge; x: number; y: number; left: number; top: number; width: number; height: number; target: HTMLElement } | undefined
let resizeFrame = 0, resizePoint = { x: 0, y: 0 }
function handleBounds(edge: ResizeEdge) {
  if (edge === 'bottom') { const bounds = heightBounds(viewport.value.height); return { ...bounds, max: Math.min(bounds.max, viewport.value.height - floating.coordinates.value.y - 8) } }
  const bounds = widthBounds(viewport.value.width, mode.value)
  if (mode.value !== 'floating') return bounds
  return { ...bounds, max: Math.min(bounds.max, edge === 'left' ? floating.coordinates.value.x + dimensions.value.width - 8 : viewport.value.width - floating.coordinates.value.x - 8) }
}
const resizeHandles = computed(() => (mode.value === 'floating' ? ['left', 'right', 'bottom', 'corner'] as const : ['left'] as const).map(edge => ({ edge, label: edge === 'bottom' ? '调整助手高度' : edge === 'corner' ? '调整助手宽度和高度' : '调整助手宽度', bounds: handleBounds(edge), value: edge === 'bottom' ? dimensions.value.height : dimensions.value.width })))
function applyResize() {
  resizeFrame = 0
  const origin = resizeOrigin
  if (!origin) return
  const dx = resizePoint.x - origin.x, dy = resizePoint.y - origin.y
  if (origin.edge !== 'bottom') {
    const bounds = widthBounds(viewport.value.width, mode.value), leftEdge = origin.edge === 'left'
    if (mode.value === 'floating') bounds.max = Math.min(bounds.max, leftEdge ? origin.left + origin.width - 8 : viewport.value.width - origin.left - 8)
    preferredWidth.value = clampSize(origin.width + (leftEdge ? -dx : dx), bounds, DEFAULT_WIDTH)
    if (mode.value === 'floating' && leftEdge) floating.place(origin.left + origin.width - dimensions.value.width, origin.top)
  }
  if (mode.value === 'floating' && (origin.edge === 'bottom' || origin.edge === 'corner')) floatingHeight.value = clampSize(origin.height + dy, { ...heightBounds(viewport.value.height), max: Math.min(heightBounds(viewport.value.height).max, viewport.value.height - origin.top - 8) }, DEFAULT_FLOATING_HEIGHT)
  syncDock()
}
function startResize(event: PointerEvent, edge: ResizeEdge) {
  if (compact.value || event.button !== 0 || resizeOrigin) return
  event.preventDefault(); const target = event.currentTarget as HTMLElement, rect = panel.value!.getBoundingClientRect()
  resizeOrigin = { pointer: event.pointerId, edge, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, target }; resizePoint = { x: event.clientX, y: event.clientY }
  resizing.value = true; document.documentElement.classList.add('assistant-resizing'); target.focus({ preventScroll: true }); target.setPointerCapture(event.pointerId)
}
function moveResize(event: PointerEvent) { if (!resizeOrigin || event.pointerId !== resizeOrigin.pointer) return; event.preventDefault(); resizePoint = { x: event.clientX, y: event.clientY }; if (!resizeFrame) resizeFrame = requestAnimationFrame(applyResize) }
function endResize() {
  if (!resizeOrigin) return
  if (resizeFrame) { cancelAnimationFrame(resizeFrame); applyResize() }
  const origin = resizeOrigin; resizeOrigin = undefined; resizing.value = false; document.documentElement.classList.remove('assistant-resizing')
  if (origin.target.hasPointerCapture(origin.pointer)) origin.target.releasePointerCapture(origin.pointer)
  persistLayout(); if (mode.value === 'floating') floating.persist()
}
function resizeKey(event: KeyboardEvent, edge: ResizeEdge) {
  const height = edge === 'bottom' || edge === 'corner' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  if (!height && (event.key === 'ArrowUp' || event.key === 'ArrowDown') || height && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return
  const value = keyboardSize(event.key, height ? dimensions.value.height : dimensions.value.width, handleBounds(height ? 'bottom' : edge), edge === 'left' ? -1 : 1)
  if (value === null) return
  event.preventDefault()
  if (height) floatingHeight.value = value
  else { const right = floating.coordinates.value.x + dimensions.value.width; preferredWidth.value = value; if (mode.value === 'floating' && edge === 'left') floating.place(right - dimensions.value.width, floating.coordinates.value.y) }
  persistLayout(); if (mode.value === 'floating') floating.persist()
}
function resetSize(edge: ResizeEdge) {
  endResize()
  if (edge === 'bottom') floatingHeight.value = clampHeight(DEFAULT_FLOATING_HEIGHT, viewport.value.height)
  else { const right = floating.coordinates.value.x + dimensions.value.width; preferredWidth.value = clampWidth(DEFAULT_WIDTH, viewport.value.width, mode.value); if (mode.value === 'floating' && edge === 'left') floating.place(right - dimensions.value.width, floating.coordinates.value.y) }
  persistLayout(); if (mode.value === 'floating') floating.persist()
}
function changeMode({ key }: { key: string | number }) { const next = modes.find(item => item.key === key); if (!next || next.key === mode.value) return; endResize(); floating.end(); mode.value = next.key; persistLayout(); playSound('latch') }
watch(layoutKey, restorePreferences, { immediate: true })
watch([open, compact, mode, () => dimensions.value.width], syncDock, { flush: 'sync' })
// Phones get a bottom sheet: pull the handle or header down far or fast enough to dismiss it.
let sheetOrigin: { pointer: number; y: number; last: number; time: number; speed: number } | undefined
function startSheetDrag(event: PointerEvent) {
  if (event.button !== 0 || (event.target as Element).closest('button, a, input, [data-no-drag]')) return
  sheetOrigin = { pointer: event.pointerId, y: event.clientY, last: event.clientY, time: performance.now(), speed: 0 }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveSheet(event: PointerEvent) {
  if (!sheetOrigin || event.pointerId !== sheetOrigin.pointer) return
  const now = performance.now(), dy = event.clientY - sheetOrigin.y
  sheetOrigin.speed = (event.clientY - sheetOrigin.last) / Math.max(8, now - sheetOrigin.time); sheetOrigin.last = event.clientY; sheetOrigin.time = now
  sheetDrag.value = dy > 0 ? dy : dy / 6
}
function endSheetDrag() {
  if (!sheetOrigin) return
  const dismiss = sheetDrag.value > 140 || (sheetDrag.value > 40 && sheetOrigin.speed > .6)
  sheetOrigin = undefined
  if (dismiss) close()
  else sheetDrag.value = 0
}
function startHeaderDrag(event: PointerEvent) { if (compact.value) startSheetDrag(event); else startPanelDrag(event) }
function moveHeader(event: PointerEvent) { if (compact.value) moveSheet(event); else floating.move(event) }
function endHeaderDrag() { if (compact.value) endSheetDrag(); else floating.end() }

// On desktop the companion itself flies into the panel header while the panel unfolds from it.
const morph = ref<{ size: number } | null>(null); const morphGhost = ref<HTMLElement | null>(null)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const morphEasing = 'cubic-bezier(.2,.8,.2,1)'
function morphGeometry(el: Element) {
  const from = launcher.value?.rect(); const avatar = el.querySelector('.assistant-header-avatar')?.getBoundingClientRect(); const box = el.getBoundingClientRect()
  if (!from?.width || !avatar) return null
  const cx = from.left + from.width / 2 - box.left, cy = from.top + from.height / 2 - box.top
  const radius = Math.hypot(Math.max(cx, box.width - cx), Math.max(cy, box.height - cy))
  return { from, avatar, small: `circle(${from.width / 2}px at ${cx}px ${cy}px)`, large: `circle(${radius}px at ${cx}px ${cy}px)` }
}
async function flyGhost(from: DOMRect, to: DOMRect, duration: number) {
  morph.value = { size: from.width }; await nextTick()
  const ghost = morphGhost.value
  if (!ghost) { morph.value = null; return }
  const at = (rect: DOMRect) => `translate(${rect.left}px, ${rect.top}px) scale(${rect.width / from.width})`
  await ghost.animate([{ transform: at(from) }, { transform: at(to) }], { duration, easing: morphEasing, fill: 'forwards' }).finished.catch(() => {})
  morph.value = null
}
function enterPanel(el: Element, done: () => void) {
  const panelEl = el as HTMLElement
  if (reducedMotion.matches) { done(); return }
  if (compact.value) { panelEl.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 340, easing: morphEasing }).finished.then(done, done); return }
  const geometry = morphGeometry(el)
  if (mode.value === 'docked' || !geometry) { panelEl.animate([{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: morphEasing }).finished.then(done, done); return }
  panelEl.classList.add('morphing')
  void flyGhost(geometry.from, geometry.avatar, 420).then(() => panelEl.classList.remove('morphing'))
  panelEl.animate([{ clipPath: geometry.small, opacity: .4 }, { clipPath: geometry.large, opacity: 1 }], { duration: 420, easing: morphEasing }).finished.then(done, done)
}
function leavePanel(el: Element, done: () => void) {
  const panelEl = el as HTMLElement
  if (reducedMotion.matches) { done(); return }
  if (compact.value) { panelEl.animate([{ transform: panelEl.style.transform || 'none' }, { transform: 'translateY(100%)' }], { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then(() => { sheetDrag.value = 0; done() }, done); return }
  const geometry = morphGeometry(el)
  if (mode.value === 'docked' || !geometry) { panelEl.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(12px) scale(.98)' }], { duration: 180, fill: 'forwards' }).finished.then(done, done); return }
  landing.value = true; panelEl.classList.add('morphing')
  void flyGhost(geometry.avatar, geometry.from, 340).then(() => { landing.value = false })
  panelEl.animate([{ clipPath: geometry.large, opacity: 1 }, { clipPath: geometry.small, opacity: 0 }], { duration: 340, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' }).finished.then(done, done)
}
// Keeps the companion hidden until its ghost lands back in place.
const landing = ref(false)
const editorRoute = computed(() => route.path.startsWith('/outfits/'))
const mood = computed(() => busy.value ? 'thinking' : (error.value||taskFailed.value) ? 'concern' : delighted.value ? 'happy' : 'idle')
const modelOptions = computed(() => [{ value: '', label: `个人默认 · ${personalModel.value || models.value.defaultModel}` }, ...models.value.models.map(value => ({ value, label: value }))])
let delightTimer: ReturnType<typeof setTimeout> | undefined
function celebrate() { delighted.value = true; clearTimeout(delightTimer); delightTimer = setTimeout(() => { delighted.value = false }, 2400) }
function startPanelDrag(event: PointerEvent) { if (mode.value === 'floating' && !compact.value && !resizing.value) floating.start(event) }
function close() { endResize(); floating.end(); waitingTopics.value = false; open.value = false; optionsOpen.value = false; playSound('off'); void nextTick(() => launcher.value?.focus()) }
function nearBottom() { return !transcript.value || transcript.value.scrollHeight - transcript.value.scrollTop - transcript.value.clientHeight < 72 }

const session = computed(() => sessions.value.find(s => s.id === selected.value))
const context = computed(() => pageContext(route.path))
const contextName = computed(() => context.value.scene ? `${context.value.name || '组合台'} · ${context.value.selectedIds?.length || 0} 项选中` : context.value.garmentId ? '当前衣物详情' : ({ '/wardrobe': '我的衣柜', '/outfits': '组合台', '/settings': '我的设置', '/help': '平台帮助', '/tasks': '任务记录', '/pending': '未入柜', '/add': '添加衣物', '/trash': '回收站' } as Record<string, string>)[route.path] || '当前页面')
async function refreshSessions() { sessions.value = await agentRequest<AgentSession[]>('/sessions') }
async function load() {
  void flushBoardTrace()
  if (usingMocks) { error.value = '界面演示不调用模型，请连接真实后端使用助手。'; return }
  loading.value = true; error.value = ''
  try { const [modelList, preferences, usage] = await Promise.all([agentRequest<Models>('/models'), agentRequest<{ model: string; avatarMode: string }>('/preferences'), agentRequest<Quota>('/quota')]); models.value = modelList; personalModel.value = preferences.model; applyAvatarMode(preferences.avatarMode); quota.value = usage; await refreshSessions(); if (!selected.value && sessions.value.length) { selected.value = sessions.value[0].id; await selectSession() } }
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
  else if (key === 'memory') { void router.push('/settings?section=assistant'); showPage() }
  else if (key === 'help') { void router.push('/help?article=03-assistant'); showPage() }
}
function deleteChats(all = false) {
  modal.confirm({ title: all ? '清空所有聊天？' : '删除当前对话？', content: '聊天记录和长期记忆独立管理，这个操作会保留所有记忆。', okText: '确认删除', cancelText: '取消', async onOk() { await agentRequest(all ? '/sessions' : `/sessions/${selected.value}`, 'DELETE'); if (closet.user) discardSessionTrace(closet.user.username, all ? undefined : selected.value); selected.value = ''; messages.value = []; await refreshSessions(); playSound('success'); } })
}
async function undoMemory(memory: Memory) { try { await agentRequest(`/memories/${memory.id}`, 'DELETE'); Object.assign(memory, { revoked: true }); window.dispatchEvent(new Event('closet-agent-memory-changed')); message.success('已删除这条记忆。') } catch (e) { message.error(String(e)) } }
async function scrollBottom() { await nextTick(); if (transcript.value) transcript.value.scrollTop = transcript.value.scrollHeight }
// "今天穿什么" quick entry: shown when the chat is empty or the last reply is not already a recommendation (design 8.4).
const showQuick = computed(() => { const last = messages.value.at(-1); return !last || !last.events.some(e => e.event === 'local_recommendation' || (e.event === 'proposal' && e.data?.kind === 'RECOMMENDATION')) })
function quickResult(view: RecommendationView) {
  // Shown in this chat only (not sent to the model and not saved to the conversation).
  messages.value.push({ id: createUuid(), role: 'assistant', content: `按“${view.intent.description}”为你推荐（规则计算，未调用大模型，不占对话次数）`, status: 'COMPLETE', events: [{ event: 'local_recommendation', data: view }] })
}
async function send() {
  if (busy.value || !input.value.trim() || !models.value.configured) return
  avatarCue.value=null;taskFailed.value=false;activityTool.value=''; error.value = ''; errorHint.value = ''; errorNewSession.value = false; busy.value = true; activityPhase.value = 'thinking'; status.value = '正在理解你的请求'; playSound('bubble'); let reply: AgentMessage | undefined
  const body = { requestId: createUuid(), content: input.value.trim(), modelContent: pendingCard.value?.text === input.value.trim() ? pendingCard.value.modelContent : undefined, context: context.value, imageConsent: imageConsent.value }
  try {
    if (!selected.value) await createSession()
    messages.value.push({ id: body.requestId, role: 'user', content: body.content, status: 'COMPLETE', events: [] })
    messages.value.push({ id: createUuid(), role: 'assistant', content: '', status: 'RUNNING', events: [], requestId: body.requestId }); reply = messages.value[messages.value.length - 1]
    input.value = ''; pendingCard.value = null; imageConsent.value = false; abort = new AbortController(); await scrollBottom()
    await streamMessage(selected.value, body, event => {
      const follow = nearBottom()
      if (event.event === 'token') { reply!.content += event.data.text; activityPhase.value = 'responding' }
      else if(event.event==='avatar'){ if(validCue(event.data)&&event.data.requestId===body.requestId)avatarCue.value=event.data }
      else if (event.event === 'debug_trace') { debugUpdates.value++; reply!.requestId = event.data.requestId }
      else if (event.event === 'status') { activityTool.value=event.data.tool||'';status.value = event.data.text; activityPhase.value = event.data.phase === 'operating' ? 'operating' : 'thinking' }
      else if (event.event === 'canvas_operation') { activityPhase.value = 'operating'; status.value = event.data.label; handleCanvasCommand(event.data) }
      else if (event.event === 'done') { reply!.status = 'COMPLETE'; quota.value = event.data.quota; if (event.data.charged === false) message.info('本次点选没有调用模型，不占用对话次数。'); if(!taskFailed.value)celebrate(); playSound('complete') }
      else if (event.event === 'error') { failCanvasExecution(); const advice = failureAdvice(event.data.retry); error.value = event.data.message; errorHint.value = advice.hint; errorNewSession.value = advice.newSession; reply!.status = 'FAILED'; playSound('error') }
      else {
        reply!.events.push(event)
        if(event.event==='workspace_result'&&event.data.status==='FAILED')taskFailed.value=true
        if (event.event === 'memory') window.dispatchEvent(new Event('closet-agent-memory-changed'))
        if (event.event === 'navigation') { void router.push(event.data.path); showPage() }
      }
      if (follow) void scrollBottom()
    }, abort.signal)
  } catch (e) {
    failCanvasExecution()
    if (isStopped(e)) { error.value = ''; if (reply) reply.status = 'CANCELLED'; message.info('已停止生成，本次不计次。') }
    else if (e instanceof AgentStreamError) { error.value = e.message; const advice = failureAdvice(e.retry); errorHint.value = advice.hint; errorNewSession.value = advice.newSession; if (reply) reply.status = 'FAILED' }
    else { showFailure(e, '回复未完成。'); if (reply) reply.status = 'FAILED' }
  }
  finally { busy.value = false; status.value = ''; abort = undefined; try { await refreshSessions(); quota.value = await agentRequest<Quota>('/quota') } catch {} }
}
function showPage() { if (compact.value) open.value = false }
function enter(e: KeyboardEvent) { if (e.isComposing) return; e.preventDefault(); void send() }
async function toggle() { if (open.value) { close(); return } open.value = true; playSound('pop'); await load(); await nextTick(); await scrollBottom(); if (compact.value) panel.value?.focus({ preventScroll: true }); else textarea.value?.focus() }
function keyboard(e: KeyboardEvent) {
  if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && !compact.value) {
    if ([...document.querySelectorAll('.ant-modal-wrap')].some(el => el.getClientRects().length)) return
    e.preventDefault()
    if (!open.value) void toggle()
    else if (panel.value?.contains(document.activeElement)) close()
    else textarea.value?.focus()
    return
  }
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
function resize() { endResize(); floating.end(); compact.value = window.innerWidth < 1024; viewport.value = { width: window.innerWidth, height: window.innerHeight }; resizeMobileViewport() }
function resizeMobileViewport() { mobileViewport.value = { height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 } }
watch(() => closet.user?.username, async username=>{avatarCue.value=null;applyAvatarMode('personal');if(username&&!usingMocks){try{const p=await agentRequest<{avatarMode:string}>('/preferences');if(closet.user?.username===username)applyAvatarMode(p.avatarMode)}catch{}}},{immediate:true})
watch(() => route.path, () => { imageConsent.value = false; })
// Fix the body as well as hiding overflow, so iOS cannot scroll the page beneath the dialog.
let scrollLock: { x: number; y: number; styles: [string, string, string][]; app: HTMLElement | null; inert: boolean } | undefined
function lockBackground(lock: boolean) {
  if (lock === !!scrollLock) return
  const body = document.body
  if (lock) {
    const app = document.getElementById('app')
    scrollLock = { x: window.scrollX, y: window.scrollY, styles: ['position', 'top', 'left', 'width', 'overflow'].map(name => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)]), app, inert: app?.inert ?? false }
    body.style.position = 'fixed'; body.style.top = `${-scrollLock.y}px`; body.style.left = `${-scrollLock.x}px`; body.style.width = '100%'; body.style.overflow = 'hidden'
    if (app) app.inert = true
    document.documentElement.classList.add('assistant-mobile-open')
    resizeMobileViewport()
  } else if (scrollLock) {
    const saved = scrollLock; scrollLock = undefined
    for (const [name, value, priority] of saved.styles) { if (value) body.style.setProperty(name, value, priority); else body.style.removeProperty(name) }
    if (saved.app) saved.app.inert = saved.inert
    document.documentElement.classList.remove('assistant-mobile-open')
    // Instant restoration avoids a page-wide smooth-scroll animation when closing.
    window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' })
  }
}
watch([open, compact], ([visible, mobile]) => lockBackground(visible && mobile), { flush: 'post' })
onMounted(() => { window.addEventListener('closet-assistant-open', openFromWaiting); window.addEventListener(ASSISTANT_SEND_EVENT, sendFromCard); window.addEventListener(ASSISTANT_PREFILL_EVENT, prefillFromCard); window.addEventListener('resize', resize); window.addEventListener('keydown', keyboard); window.addEventListener('blur', cancelResize); window.visualViewport?.addEventListener('resize', resizeMobileViewport); window.visualViewport?.addEventListener('scroll', resizeMobileViewport) })
function cancelResize() { endResize() }
onUnmounted(() => { abort?.abort(); endResize(); floating.end(); document.documentElement.classList.remove('assistant-docked'); document.documentElement.style.removeProperty('--assistant-dock-width'); window.removeEventListener('closet-assistant-open', openFromWaiting); window.removeEventListener(ASSISTANT_SEND_EVENT, sendFromCard); window.removeEventListener(ASSISTANT_PREFILL_EVENT, prefillFromCard); abort?.abort(); clearTimeout(delightTimer); window.removeEventListener('resize', resize); window.removeEventListener('keydown', keyboard); window.removeEventListener('blur', cancelResize); window.visualViewport?.removeEventListener('resize', resizeMobileViewport); window.visualViewport?.removeEventListener('scroll', resizeMobileViewport); lockBackground(false) })
</script>
<template>
  <AgentTraceModal v-model:open="debugOpen" :session-id="selected" :request-id="debugRequest" :updates="debugUpdates" />
  <AssistantOrb ref="launcher" :open="open || landing" :suppressed="editorRoute" :mood="mood" :busy="busy" :phase="isOperating?'operating':activityPhase" :tool="activityTool" :cue="avatarCue" @toggle="toggle" />
  <Teleport to="body">
    <Transition name="assistant-scrim"><div v-if="open && compact" class="assistant-scrim" @click="close" /></Transition>
    <span v-if="morph" ref="morphGhost" class="bloub-orb-shape assistant-morph" :style="{ '--orb-size': `${morph.size}px` }" aria-hidden="true"><BloubAvatar v-bind="launcher?.appearance" :size="morph.size * 1.25" /></span>
    <Transition :css="false" @enter="enterPanel" @leave="leavePanel">
      <aside v-if="open" id="closet-assistant" ref="panel" tabindex="-1" class="assistant-panel" :class="[compact ? 'sheet' : mode, { pinned: mode === 'overlay' && !compact, dragging: floating.dragging.value || !!sheetDrag, resizing }]" :style="panelStyle" :role="compact ? 'dialog' : 'complementary'" :aria-modal="compact || undefined" aria-label="个人助手">
        <template v-if="!compact"><a-button v-for="handle in resizeHandles" :key="handle.edge" type="text" class="assistant-resize-handle" :class="`resize-${handle.edge}`" role="separator" :aria-label="handle.label" :aria-orientation="handle.edge === 'bottom' ? 'horizontal' : 'vertical'" :aria-valuenow="Math.round(handle.value)" :aria-valuemin="handle.bounds.min" :aria-valuemax="handle.bounds.max" :aria-valuetext="handle.edge === 'corner' ? `宽 ${Math.round(dimensions.width)} 像素，高 ${Math.round(dimensions.height)} 像素` : undefined" aria-controls="closet-assistant" tabindex="0" data-no-drag data-sound="off" @pointerdown="startResize($event, handle.edge)" @pointermove="moveResize" @pointerup="endResize()" @pointercancel="endResize()" @lostpointercapture="endResize()" @keydown="resizeKey($event, handle.edge)" @dblclick="resetSize(handle.edge)" /></template>
        <header class="assistant-header" @pointerdown="startHeaderDrag" @pointermove="moveHeader" @pointerup="endHeaderDrag" @pointercancel="endHeaderDrag" @lostpointercapture="endHeaderDrag">
          <span v-if="compact" class="assistant-sheet-handle" aria-hidden="true" />
          <div class="assistant-identity"><span class="assistant-face assistant-header-avatar" :class="{'bloub-responding':launcher?.responding}"><BloubAvatar v-bind="launcher?.appearance" :size="48" /></span><div><strong>鱼搭助手</strong><small :title="session?.title">{{ session?.title || '今天也一起好好穿衣' }}</small></div></div>
          <div class="assistant-header-actions" data-no-drag>
            <a-tooltip title="新建对话"><a-button type="text" aria-label="新建对话" :disabled="busy || usingMocks" @click="newSession"><PlusOutlined /></a-button></a-tooltip>
            <a-tooltip title="聊天记录"><a-button type="text" aria-label="聊天记录" :disabled="busy || loading" @click="historyOpen = true"><HistoryOutlined /></a-button></a-tooltip>
            <a-dropdown v-if="!compact" v-model:open="layoutMenuOpen" :trigger="['click']"><a-tooltip :title="layoutMenuOpen ? '' : `助手布局：${modeLabel}`"><a-button type="text" :aria-label="`助手布局：${modeLabel}，切换布局`" aria-haspopup="menu" data-sound="off"><component :is="mode === 'floating' ? PushpinOutlined : PushpinFilled" /></a-button></a-tooltip><template #overlay><a-menu :selected-keys="[mode]" aria-label="助手布局模式" @click="changeMode"><a-menu-item v-for="item in modes" :key="item.key" :aria-label="`${item.label}${mode === item.key ? '，当前模式' : ''}`"><CheckOutlined v-if="mode === item.key" />{{ item.label }}</a-menu-item></a-menu></template></a-dropdown>
            <a-dropdown :trigger="['click']"><a-button type="text" aria-label="更多助手操作"><MoreOutlined /></a-button><template #overlay><a-menu @click="menuAction"><a-menu-item key="rename" :disabled="!selected || busy">重命名当前对话</a-menu-item><a-menu-item key="memory">管理长期记忆</a-menu-item><a-menu-item key="help">助手使用说明</a-menu-item><a-menu-divider /><a-menu-item key="delete" :disabled="!selected || busy" danger>删除当前对话</a-menu-item><a-menu-item key="clear" :disabled="!sessions.length || busy" danger>清空聊天记录</a-menu-item></a-menu></template></a-dropdown>
            <a-button type="text" aria-label="关闭个人助手" @click="close"><CloseOutlined /></a-button>
          </div>
        </header>
        <div class="assistant-context"><span class="assistant-context-dot" /><span :title="contextName">{{ contextName }}</span><small>随页面更新</small></div>
        <div v-if="compact" class="assistant-task-notice"><TaskNotice @opened="close" /></div>
        <div v-if="waitingTopics" class="assistant-waiting-topics"><small>等衣物的这会儿，想聊点什么？选话题后由你发送。</small><div><a-button v-for="topic in topics" :key="topic.label" size="small" :disabled="busy || loading || !models.configured" @click="pickTopic(topic.prompt)">{{ topic.label }}</a-button></div></div>
        <div ref="transcript" class="assistant-transcript" aria-label="聊天记录" aria-live="polite" :aria-busy="busy">
          <div v-if="!messages.length" class="assistant-welcome"><BloubAvatar class="assistant-face" :size="74" expression="happy" /><p class="eyebrow">你的鱼搭助手</p><h2>今天我能帮你做什么？</h2><p>按衣柜搭配、翻看保存的搭配、找出重复衣物，<br />也能记住你的穿衣偏好。</p><div class="assistant-welcome-suggestions"><a-button v-for="item in suggestions" :key="item.text" block @click="suggest(item.text)"><component :is="item.icon" /><span>{{ item.text }}</span></a-button></div></div>
          <article v-for="item in messages" :key="item.id" class="assistant-message" :class="item.role"><small>{{ item.role === 'user' ? '你' : '鱼搭助手' }}</small><p v-if="item.content" class="assistant-text">{{ item.role === 'user' ? userMessageText(item.content) : item.content }}</p><span v-if="item.status === 'FAILED'" class="assistant-interrupted">回复未完成</span><span v-else-if="item.status === 'CANCELLED'" class="assistant-interrupted">已停止生成</span>
            <a-button v-if="item.role === 'assistant'" type="link" size="small" @click="debugRequest = item.requestId || null; debugOpen = true">查看决策与执行记录</a-button>
            <a-collapse v-if="item.events.some(e => e.event === 'operation_result')" ghost class="assistant-operation-record"><a-collapse-panel key="steps" header="查看搭台操作记录"><ol><li v-for="event in item.events.filter(e => e.event === 'operation_result')" :key="event.data.operationId">{{ event.data.success ? '✓' : '!' }} {{ event.data.label }}<small v-if="event.data.message"> · {{ event.data.message }}</small></li></ol></a-collapse-panel></a-collapse>
            <template v-for="(event, index) in item.events" :key="index">
              <AgentWorkspaceResult v-if="event.event === 'workspace_result'" :result="event.data" @open="showPage" />
              <AgentCommandCard v-else-if="event.event === 'command'" :command="event.data" />
              <AgentProposal v-else-if="event.event === 'proposal'" :proposal="event.data" @applied="showPage" />
              <RecommendationGroup v-else-if="event.event === 'local_recommendation'" :view="event.data" dense />
              <div v-else-if="event.event === 'memory'" class="assistant-memory-notice"><span>{{ event.data.revoked ? '已撤销' : '已记住' }}：{{ event.data.content }}</span><a-button v-if="!event.data.revoked" type="link" size="small" @click="undoMemory(event.data)">撤销记忆</a-button></div>
              <div v-else-if="event.event === 'sources' && event.data.articles?.length" class="assistant-sources"><RouterLink v-for="article in event.data.articles" :key="article.id" :to="article.href" @click="showPage">{{ article.title }} ↗</RouterLink></div>
            </template>
          </article>
          <div v-if="busy && (isOperating || activityPhase !== 'responding')" class="assistant-activity"><ThoughtLine v-if="isOperating" :label="canvasExecution.runId ? canvasExecution.label || status : status || '正在操作'" :steps="operationSteps" /><LatticeLoader v-else :label="status || '正在思考'" /></div>
        </div>
        <footer class="assistant-composer">
          <a-alert v-if="error" type="error" :message="error" :description="errorHint || undefined" show-icon closable @close="error = ''"><template v-if="errorNewSession" #action><a-button size="small" type="primary" @click="error = ''; newSession()">新建对话</a-button></template></a-alert>
          <p v-if="!models.configured && !loading" class="assistant-not-configured">{{ usingMocks ? '演示模式不调用助手' : '助手尚未配置，请联系平台维护者。' }}</p>
          <QuickRecommend v-if="showQuick" :disabled="busy" @result="quickResult" />
          <form class="assistant-input-box" @submit.prevent="send">
            <a-textarea ref="textarea" v-model:value="input" aria-label="发送给助手的消息" :maxlength="4000" :auto-size="{ minRows: 1, maxRows: 4 }" placeholder="想怎么搭？或者问问平台用法…" :bordered="false" :disabled="busy || !models.configured" @keydown.enter.exact="enter" />
            <a-tooltip v-if="busy" title="停止生成"><a-button type="primary" danger shape="circle" aria-label="停止生成" data-sound="off" @click="stop"><template #icon><StopOutlined /></template></a-button></a-tooltip>
            <a-button v-else type="primary" html-type="submit" shape="circle" aria-label="发送消息" data-sound="off" :disabled="!input.trim() || !models.configured"><template #icon><SendOutlined /></template></a-button>
          </form>
          <div class="assistant-composer-tools">
            <div><SoundToggle /><a-popover v-model:open="optionsOpen" title="本次对话选项" trigger="click" placement="topLeft" overlay-class-name="assistant-options-popover"><a-button type="text" aria-label="助手对话选项" :aria-expanded="optionsOpen"><SettingOutlined /></a-button><template #content><div class="assistant-options"><label>本会话模型</label><a-select :value="session?.model || ''" aria-label="本会话模型" :options="modelOptions" :disabled="!selected || busy" @change="setModel" /><small v-if="!selected">发送消息或新建对话后可设置会话模型。</small><a-checkbox v-if="context.garmentId" v-model:checked="imageConsent" :disabled="busy">发送当前衣物图片到模型（仅本条）</a-checkbox><RouterLink to="/settings" @click="optionsOpen=false;showPage()">设置角色动效与预览 ↗</RouterLink></div></template></a-popover><span v-if="imageConsent" class="assistant-consent-badge">本条已授权</span></div>
            <small>{{ quota ? `今日剩余 ${Math.max(0, quota.limit - quota.used)} 条` : '正在读取额度' }}</small>
          </div>
          <p class="assistant-ai-note">内容由 AI 生成，请注意甄别</p>
        </footer>
      </aside>
    </Transition>
    <a-modal v-model:open="historyOpen" title="聊天记录" :footer="null" :width="520"><div class="assistant-history"><a-empty v-if="!sessions.length" description="还没有聊天记录" /><a-button v-for="item in sessions" :key="item.id" block :type="item.id === selected ? 'primary' : 'default'" @click="chooseSession(item.id)">{{ item.title }}</a-button></div><p class="assistant-dialog-note">聊天与长期记忆独立保存。</p></a-modal>
    <a-modal v-model:open="renameOpen" title="重命名对话" ok-text="保存名称" cancel-text="取消" :confirm-loading="renaming" :ok-button-props="{ disabled: !renameTitle.trim() }" @ok="saveTitle"><a-input v-model:value="renameTitle" aria-label="对话名称" :maxlength="100" @press-enter="saveTitle" /></a-modal>
  </Teleport>
</template>

<style scoped>
.assistant-task-notice{padding:0 14px;flex-shrink:0}.assistant-task-notice :deep(.task-notice){margin:10px 0 0}.assistant-waiting-topics{padding:12px 16px;border-bottom:1px solid var(--line);flex-shrink:0}.assistant-waiting-topics small{display:block;font-size:12px;line-height:1.6;color:var(--muted);margin-bottom:8px}.assistant-waiting-topics>div{display:flex;gap:8px;flex-wrap:wrap}
</style>
