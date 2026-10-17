<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { PlusOutlined, FolderOpenOutlined, ExpandOutlined, SaveOutlined, CloseOutlined, ArrowLeftOutlined, AimOutlined, MinusOutlined, AppstoreOutlined, MoreOutlined, DownloadOutlined, InfoCircleOutlined, SoundOutlined, AudioMutedOutlined } from '@ant-design/icons-vue'
import OutfitPage from './OutfitPage.vue'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import OutfitReview from '../components/OutfitReview.vue'
import BloubAvatar from '../agent/BloubAvatar.vue'
import { useClosetStore } from '../stores/closet'
import { isMissingOutfit } from '../domain/outfitErrors'
import { closetApi } from '../services/api'
import { boardSignature, workspace, createBoard, addBoard, openSavedBoard, mutateBoard, storageWarning, discardWorkspace, findOpenOutfit, dedupeOpenOutfits, BOARD_LIMIT, type WorkspaceBoard } from '../domain/outfit-workspace'
import { activeWorkspace, pruneAgentWorkspaces, createWorkspace, DEFAULT_WORKSPACE_ID, listWorkspaces, workspaceSummary, removeWorkspace, renameWorkspace, setActiveWorkspace, type WorkspaceInfo } from '../domain/workspace-registry'
import { normalizeScene, type Outfit, type OutfitDraft } from '../domain/outfit'
import { canvasBridge } from '../agent/bridge'
import { canvasExecution, stopCanvasRun } from '../agent/canvas-runtime'
import { playSound, soundEnabled, toggleSound } from '../services/sound'
const route = useRoute(), router = useRouter(), closet = useClosetStore(), { modal, message } = App.useApp()
// The floating companion steps aside on the canvas; this toolbar entry replaces it.
function openAssistant() { window.dispatchEvent(new CustomEvent('closet-assistant-open')) }
const sessionId = computed(() => typeof route.query.session === 'string' ? route.query.session : '')
// 画板 (workspace) holds 组合台 (boards): a default one, a temporary one per Agent run, and any the person creates.
const owner = () => closet.user!.username
const wsId = ref(sessionId.value ? `agent:${sessionId.value}` : activeWorkspace(owner()))
const space = computed(() => workspace(owner(), wsId.value))
const isTemporary = computed(() => wsId.value.startsWith('agent:'))
const workspaces = ref<WorkspaceInfo[]>([])
const workspaceName = computed(() => workspaces.value.find(w => w.id === wsId.value)?.name || '默认画板')
const wsCounts = ref<Record<string, number>>({})
function refreshWorkspaces() { workspaces.value = listWorkspaces(owner()); wsCounts.value = Object.fromEntries(workspaces.value.map(w => [w.id, workspaceSummary(owner(), w.id).boards])) }
const wsLabel = (w: WorkspaceInfo) => `${w.kind === 'agent' ? `${w.name}（临时）` : w.name} · ${wsCounts.value[w.id] ?? 0}`
const wsOptions = computed(() => [...workspaces.value.map(w => ({ value: w.id, label: wsLabel(w), short: w.name })), { value: '__new__', label: '＋ 新建画板…', short: '新建画板' }])
watch(sessionId, value => { if (value) wsId.value = `agent:${value}` })
watch(wsId, id => { void space.value; if (!id.startsWith('agent:')) setActiveWorkspace(owner(), id); refreshWorkspaces() }, { immediate: true })
const active = computed(() => space.value.boards.find(b => b.id === space.value.activeId))
const windowWidth = ref(window.innerWidth)
function resizeWorkspace() { windowWidth.value = window.innerWidth }
const focus = ref(window.innerWidth < 1024 || !!route.params.id)
const editor = ref<{ flush: () => void; exportPng: () => Promise<void> } | null>(null)
const viewport = ref<HTMLElement | null>(null)
const openLibrary = ref(false), saved = ref<Outfit[]>([]), opening = ref(false), saving = ref(false), error = ref('')
const checked = ref<string[]>([])
const boardsOpen = ref(false), boardInfo = ref(false), glowPreview = ref(false), reviewOpen=ref(false)
const readyForOotd=computed(()=>!!active.value?.outfitId&&!active.value.locked&&!active.value.error&&boardSignature(active.value)===active.value.savedSignature)
function reviewActive(){editor.value?.flush();if(active.value&&!active.value.locked)reviewOpen.value=true}
function openOotd(){editor.value?.flush();if(!readyForOotd.value){message.info('请先保存当前搭配，再生成 OOTD。');return}void router.push({path:'/ootd',query:{outfit:active.value!.outfitId}})}
let glowPreviewTimer: ReturnType<typeof setTimeout> | undefined
function endGlowPreview() { glowPreview.value = false; clearTimeout(glowPreviewTimer) }
function previewGlow() { glowPreview.value = true; clearTimeout(glowPreviewTimer); glowPreviewTimer = setTimeout(endGlowPreview, 10_000) }
function renameBoard(value: string) { const board = active.value; if (!board || board.locked || board.name === value) return; editor.value?.flush(); board.name = value; board.contentVersion++ }
function selectFromDrawer(board: WorkspaceBoard) { selectBoard(board, true); boardsOpen.value = false }
function moreAction({ key }: { key: string | number }) {
  if(key==='review')reviewActive()
  else if(key==='ootd')openOotd()
  else if (key === 'preview') previewGlow()
  else if (key === 'new') newBoard()
  else if (key === 'open') void library()
  else if (key === 'details') boardInfo.value = true
  else if (key === 'copy' && active.value) saveCopy(active.value)
  else if (key === 'overwrite' && active.value) overwriteSource(active.value)
  else if (key === 'export') void editor.value?.exportPng()
  else if (key === 'sound') toggleSound()
  else if (key === 'discard-temporary' || key === 'ws-delete') deleteWorkspace()
  else if (key === 'ws-rename') workspaceModal.value = { open: true, mode: 'rename', name: workspaceName.value }
}
const currentRun = computed(() => canvasExecution.workspaceId === space.value.id && !!canvasExecution.runId)
const selection = computed(() => checked.value.length ? space.value.boards.filter(b => checked.value.includes(b.id)) : active.value ? [active.value] : [])
// While editing one board ("聚焦"), Save means that board, whatever other boards were ticked in the overview. Ticked boards only
// decide what a batch save does from the overview; otherwise a leftover tick (e.g. an Agent's board) would be saved instead of
// the board being edited, and the new board would appear impossible to save.
const saveTargets = computed(() => focus.value ? (active.value ? [active.value] : []) : selection.value)
const surfaceStyle = computed(() => ({ transform: `translate(${space.value.camera.x}px, ${space.value.camera.y}px) scale(${space.value.camera.scale})` }))
let drag: { id: number; x: number; y: number; left: number; top: number } | undefined
function selectBoard(board: WorkspaceBoard, edit = false) { editor.value?.flush(); space.value.activeId = board.id; if (currentRun.value && canvasExecution.boardId !== board.id) canvasExecution.following = false; if (edit) focus.value = true; playSound('tap') }
// New 组合台: with only one 画板 it is created right away; with several, the person picks which 画板 it goes into.
const boardModal = ref({ open: false, name: '', target: '' })
function newBoard() {
  editor.value?.flush(); boardsOpen.value = false
  refreshWorkspaces()
  if (workspaces.value.length < 2) { createBoardIn(wsId.value); return }
  boardModal.value = { open: true, name: '', target: wsId.value }
}
function createBoardIn(target: string, name = '') {
  try {
    if (workspace(owner(), target).boards.length >= BOARD_LIMIT) { message.warning('这个画板已经放满十二个组合台，请先保存并关闭几个，或换一个画板。'); return }
    if (target !== wsId.value) switchWorkspace(target)
    const board = createBoard(name.trim() || undefined); addBoard(space.value, board)
    boardModal.value.open = false; focus.value = true; playSound('pop')
  } catch (e) { message.warning(String(e)) }
}
// The address /outfits/<id> (or /new) opens that outfit into the active 画板 whenever it is evaluated. Once the person moves
// to another 画板 or closes the board, the address must stop doing that, or the closed outfit comes straight back.
function detachRoute() { if (route.params.id || sessionId.value) void router.replace({ path: '/outfits/workspace' }) }
function switchWorkspace(id: string) {
  editor.value?.flush(); checked.value = []; wsId.value = id; focus.value = false; detachRoute()
  const next = space.value; if (!next.activeId && next.boards.length) next.activeId = next.boards[0].id
  void nextTick().then(fitOverview)
}
// 画板 management: create / rename / delete (the default one stays; a temporary Agent 画板 can only be deleted).
const workspaceModal = ref({ open: false, mode: 'create' as 'create' | 'rename', name: '' })
function onWorkspaceChange(id: string) { if (id === '__new__') workspaceModal.value = { open: true, mode: 'create', name: '' }; else switchWorkspace(id) }
function submitWorkspace() {
  try {
    const { mode, name } = workspaceModal.value
    if (mode === 'create') { const info = createWorkspace(owner(), name); refreshWorkspaces(); switchWorkspace(info.id); message.success(`已新建画板「${info.name}」。`) }
    else { renameWorkspace(owner(), wsId.value, name); refreshWorkspaces(); message.success('画板已改名。') }
    workspaceModal.value.open = false
  } catch (e) { message.error(e instanceof Error ? e.message : String(e)) }
}
function deleteWorkspace() {
  editor.value?.flush()
  const id = wsId.value, name = workspaceName.value
  if (id === DEFAULT_WORKSPACE_ID) return
  if (space.value.boards.some(board => board.locked)) { message.warning('Agent 正在操作组合台，请等待完成或先停止操作。'); return }
  const unsaved = space.value.boards.filter(b => b.scene.elements.length && boardSignature(b) !== b.savedSignature).length
  modal.confirm({
    title: `删除画板「${name}」？`,
    content: `将移除这个画板里的 ${space.value.boards.length} 个组合台${unsaved ? `，其中 ${unsaved} 个还没有保存到搭配库，草稿会丢失` : ''}。已经保存到搭配库的搭配会保留。`,
    okText: '删除画板', cancelText: '先留着', okButtonProps: { danger: true },
    async onOk() {
      if (space.value.boards.some(board => board.locked)) { message.warning('Agent 已开始操作，画板仍然保留。'); return }
      switchWorkspace(DEFAULT_WORKSPACE_ID); discardWorkspace(owner(), id); removeWorkspace(owner(), id); refreshWorkspaces()
      if (sessionId.value) await router.replace({ path: '/outfits/workspace' })
      playSound('pop'); message.success('画板已删除。')
    },
  })
}
async function library() { openLibrary.value = true; opening.value = true; try { saved.value = await closetApi.outfits() } catch (e) { message.error(String(e)) } finally { opening.value = false } }
function openOutfit(outfit: Outfit) {
  try {
    const found = findOpenOutfit(owner(), outfit.id, wsId.value)
    if (found && found.workspaceId !== wsId.value) { switchWorkspace(found.workspaceId); space.value.activeId = found.boardId; message.info(`这套搭配已经在「${workspaceName.value}」画板里打开，已切换过去。`) }
    else openSavedBoard(space.value, outfit)
    openLibrary.value = false; focus.value = true
  } catch (e) { message.warning(String(e)) }
}
function closeBoard(board: WorkspaceBoard) {
  if (board.locked) return
  const remove = () => { if (board.outfitId && board.outfitId === route.params.id) detachRoute(); space.value.boards = space.value.boards.filter(b => b.id !== board.id); checked.value = checked.value.filter(id => id !== board.id); if (space.value.activeId === board.id) space.value.activeId = space.value.boards[0]?.id || '' }
  if (board.scene.elements.length && boardSignature(board) !== board.savedSignature) modal.confirm({ title: '关闭这块未保存组合台？', content: '关闭会移除这块本机草稿。可以先保存到搭配库，再关闭。', okText: '关闭并丢弃', cancelText: '保留组合台', onOk: remove })
  else remove()
}
async function writeBoard(board: WorkspaceBoard, overwrite = false, copy = false) {
  if (board.locked) throw new Error('请先停止 Agent 并接手，或等待操作结束。')
  if (!board.scene.elements.length) throw new Error(`${board.name}：请先加入贴纸。`)
  const id = copy ? undefined : overwrite ? board.sourceOutfitId : board.outfitId
  const revision = overwrite ? board.sourceRevision : board.revision
  // A board remembers the outfit it was saved as. If that outfit is gone from the server (deleted elsewhere, or a different
  // server), updating it fails with "not found": save the board as a new outfit instead of losing the work.
  let result, recreated = false
  try { result = await closetApi.saveOutfit(id || null, id ? revision ?? null : null, board.name.trim(), board.scene) }
  catch (cause) {
    if (!id || !isMissingOutfit(cause)) throw cause
    result = await closetApi.saveOutfit(null, null, board.name.trim(), board.scene); recreated = true
  }
  if (recreated) message.warning(`「${board.name}」原来的搭配在服务器上已不存在，已另存为新搭配，内容没有丢。`)
  board.outfitId = result.id; board.revision = result.revision; board.scene = normalizeScene(result.scene); board.contentVersion++
  window.dispatchEvent(new Event('closet-outfit-saved')); board.savedSignature = boardSignature(board); board.status = '已保存'; board.error = ''; board.sourceOutfitId = undefined; board.sourceRevision = undefined
}
function confirmSave(boards = saveTargets.value) {
  editor.value?.flush()
  const pending = boards.filter(b => !b.locked && b.scene.elements.length && boardSignature(b) !== b.savedSignature)
  if (!pending.length) { message.info('所选组合台已保存、正在操作或仍为空。'); return Promise.resolve() }
  return new Promise<void>((resolve, reject) => {
    const finish = async (overwrite = false) => {
      saving.value = true; const failures: string[] = []
      try { for (const board of pending) { try { await writeBoard(board, overwrite); checked.value = checked.value.filter(id => id !== board.id) } catch (e) { board.error = e instanceof Error ? e.message : '保存失败'; failures.push(`${board.name}：${board.error}`) } }
        if (failures.length) { error.value = failures.join('\n'); playSound('error'); message.error(`有 ${failures.length} 块组合台未保存，成功项已保留。`); reject(new Error(error.value)) }
        else { error.value = ''; playSound('success'); message.success(`已保存 ${pending.length} 套搭配。`); resolve() }
      } finally { saving.value = false }
    }
    if (pending.length === 1 && pending[0].sourceOutfitId && !pending[0].outfitId) {
      modal.confirm({ title: '如何保存调整后的搭配？', content: '原搭配仍未改变。可以另存一套，或覆盖原搭配；版本冲突时保留草稿。', okText: '另存新搭配', cancelText: '取消', onOk: () => finish(false), onCancel: () => resolve(), footer: undefined })
      // Overwrite is a separate explicit action in the board toolbar.
    } else if (pending.length === 1) void finish(false) // One board: saving is the obvious intent, no extra dialog.
    else modal.confirm({ title: `保存 ${pending.length} 套搭配？`, content: '每块组合台独立保存到账号。部分失败时只需重试失败项；批量保存调整副本时默认另存。', okText: '确认保存', cancelText: '取消', onOk: () => finish(false), onCancel: () => resolve() })
  })
}
function saveCopy(board: WorkspaceBoard) { editor.value?.flush(); modal.confirm({ title: '另存为新搭配？', content: '保留当前草稿并保存为独立搭配，原搭配不变。', okText: '另存新搭配', cancelText: '取消', async onOk() { try { await writeBoard(board, false, true); message.success('已另存新搭配。'); playSound('success') } catch (e) { board.error = String(e); message.error(String(e)); throw e } } }) }
function overwriteSource(board: WorkspaceBoard) { editor.value?.flush(); modal.confirm({ title: '确认覆盖原搭配？', content: '将用这块临时组合台替换原搭配。版本冲突时不会覆盖，草稿仍保留。', okText: '确认覆盖', cancelText: '取消', async onOk() { try { await writeBoard(board, true); playSound('success'); message.success('原搭配已更新。') } catch (e) { board.error = String(e); message.error(String(e)); throw e } } }) }
function toggleChecked(id: string, selected: boolean) { checked.value = selected ? [...new Set([...checked.value, id])] : checked.value.filter(value => value !== id) }
const manageableBoards = computed(() => space.value.boards.filter(board => !board.locked))
const allManageableChecked = computed(() => manageableBoards.value.length > 0 && manageableBoards.value.every(board => checked.value.includes(board.id)))
function toggleAllBoards(selected: boolean) { checked.value = selected ? manageableBoards.value.map(board => board.id) : [] }
function discardBoards(boards = checked.value.length ? space.value.boards.filter(board => checked.value.includes(board.id)) : []) {
  editor.value?.flush()
  if (!boards.length) { message.info('请先勾选要丢弃的组合台。'); return }
  const removable = boards.filter(board => !board.locked)
  if (!removable.length) { message.info('所选组合台正在操作，暂时不能丢弃。'); return }
  modal.confirm({
    title: `丢弃所选 ${removable.length} 块组合台？`,
    content: '未保存的本机草稿会被移除。已保存到搭配库的搭配仍会保留。',
    okText: '丢弃所选组合台', cancelText: '继续保留', okButtonProps: { danger: true },
    onOk() {
      const ready = removable.filter(board => !board.locked)
      if (!ready.length) { message.warning('所选组合台已开始 Agent 操作，未作丢弃。'); return }
      const ids = new Set(ready.map(board => board.id))
      if (ready.some(board => board.outfitId && board.outfitId === route.params.id)) detachRoute()
      space.value.boards = space.value.boards.filter(board => !ids.has(board.id))
      checked.value = checked.value.filter(id => !ids.has(id))
      if (ids.has(space.value.activeId)) space.value.activeId = space.value.boards[0]?.id || ''
      playSound('pop'); message.success(`已丢弃 ${ready.length} 块组合台。`)
    },
  })
}
function userCamera() { if (currentRun.value) canvasExecution.following = false }
function wheel(event: WheelEvent) {
  userCamera()
  const camera = space.value.camera
  if (event.ctrlKey || event.metaKey) {
    const bounds = viewport.value!.getBoundingClientRect(); const x = event.clientX - bounds.left, y = event.clientY - bounds.top
    const scale = Math.max(.25, Math.min(2.5, camera.scale * Math.exp(-event.deltaY * .002)))
    camera.x = x - (x - camera.x) * scale / camera.scale; camera.y = y - (y - camera.y) * scale / camera.scale; camera.scale = scale
  } else { camera.x -= event.deltaX; camera.y -= event.deltaY }
}
function startPan(event: PointerEvent) {
  if ((event.target as HTMLElement).closest('button,input,a,.ant-checkbox-wrapper') || ![0, 1].includes(event.button)) return
  userCamera(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: space.value.camera.x, top: space.value.camera.y }; viewport.value?.setPointerCapture(event.pointerId)
}
function movePan(event: PointerEvent) { if (drag?.id === event.pointerId) { space.value.camera.x = drag.left + event.clientX - drag.x; space.value.camera.y = drag.top + event.clientY - drag.y } }
function endPan(event: PointerEvent) { if (drag?.id === event.pointerId) { drag = undefined; if (viewport.value?.hasPointerCapture(event.pointerId)) viewport.value.releasePointerCapture(event.pointerId) } }
function fitOverview() {
  const count = space.value.boards.length, width = Math.min(3, Math.max(1, count)) * 300, height = Math.ceil(Math.max(1, count) / 3) * 430
  const rect = viewport.value?.getBoundingClientRect(); if (!rect) return
  space.value.camera = { x: 24, y: 24, scale: Math.min(1, (rect.width - 48) / width, (rect.height - 48) / height) }
}
function followCurrent() { canvasExecution.following = true; const board = space.value.boards.find(b => b.id === canvasExecution.boardId); if (board) space.value.activeId = board.id; if (!focus.value) centerActive() }
function centerActive() { const i = space.value.boards.findIndex(b => b.id === space.value.activeId); if (i < 0 || !viewport.value) return; const camera = space.value.camera; camera.x = viewport.value.clientWidth / 2 - ((i % 3) * 300 + 140) * camera.scale; camera.y = viewport.value.clientHeight / 2 - (Math.floor(i / 3) * 430 + 210) * camera.scale }
async function loadRoute() {
  error.value = ''; const id = String(route.params.id || '')
  try {
    if (id && id !== 'new') {
      // A saved outfit is open in at most one 画板: if it already is, go there instead of making a second copy.
      const found = findOpenOutfit(owner(), id, wsId.value)
      if (found && found.workspaceId !== wsId.value) {
        switchWorkspace(found.workspaceId); space.value.activeId = found.boardId; focus.value = true
        message.info(`这套搭配已经在「${workspaceName.value}」画板里打开，已切换过去。`)
        return
      }
      const wasOpen = space.value.boards.some(b => b.outfitId === id)
      const outfit = await closetApi.outfit(id)
      const board = openSavedBoard(space.value, outfit)
      if (!wasOpen) {
        const key = `yixu.outfit-draft.v1:${closet.user!.username}:${id}`
        const old = JSON.parse(localStorage.getItem(key) || 'null') as OutfitDraft | null
        if (old?.scene && [1, 2].includes(old.scene.version)) { board.name = old.name; board.scene = normalizeScene(old.scene); board.revision = old.revision; board.status = '本机草稿'; if (old.revision !== outfit.revision) board.error = '原搭配已在另一处更新。请另存副本，或重新打开最新版本。'; localStorage.removeItem(key) }
      }
    }
    else if (id === 'new') {
      const suffix = typeof route.query.draft === 'string' ? ':' + route.query.draft : ''
      const key = `yixu.outfit-draft.v1:${closet.user!.username}:new${suffix}`
      const old = JSON.parse(localStorage.getItem(key) || 'null') as OutfitDraft | null
      const already = space.value.boards.find(b => b.id === (suffix ? `legacy${suffix}` : 'legacy:new'))
      if (already) space.value.activeId = already.id
      else if (old?.scene) { addBoard(space.value, createBoard(old.name, old.scene, suffix ? `legacy${suffix}` : 'legacy:new')); localStorage.removeItem(key) }
      else addBoard(space.value, createBoard())
      focus.value = true
    }
    if (typeof route.query.board === 'string') { const board = space.value.boards.find(b => b.id === route.query.board); if (board) { space.value.activeId = board.id; focus.value = true } else error.value = '这块临时组合台不在当前设备上。请在原设备查看，或重新生成。' }
    if (!space.value.activeId && space.value.boards.length) space.value.activeId = space.value.boards[0].id
  } catch (e) { error.value = e instanceof Error ? e.message : '工作区无法加载。' }
}
watch(() => [route.params.id, sessionId.value, route.query.board], () => { editor.value?.flush(); void loadRoute() })
watch(() => canvasExecution.boardId, async () => { if (currentRun.value && canvasExecution.following) { await nextTick(); if (!focus.value) centerActive() } })
watch(() => canvasExecution.runId, async (id, previous) => { if (!id && previous && canvasExecution.workspaceId === space.value.id && canvasExecution.following && !focus.value) { await nextTick(); fitOverview() } })
watch(focus, async value => { editor.value?.flush(); await nextTick(); if (!value) fitOverview() })
onMounted(() => {
  window.addEventListener('resize', resizeWorkspace)
  // Stale temporary Agent 画板 with nothing unsaved are tidied away; the list is read fresh afterwards.
  if (pruneAgentWorkspaces(owner()).length) refreshWorkspaces()
  // Older versions could open one saved outfit in several 画板; merge those copies (copies with unsaved edits are kept).
  if (dedupeOpenOutfits(owner(), wsId.value)) { refreshWorkspaces(); message.info('已合并重复打开的同一套搭配。') }
  void loadRoute().then(async () => { await nextTick(); if (!focus.value) fitOverview() })
  canvasBridge.value = {
    context: () => { editor.value?.flush(); const board = active.value; const selected = board?.scene.elements.find(e => board.selectedIds.includes(e.elementId || e.garmentId) && e.kind !== 'PERSON_PART'); return { route: route.path, workspaceId: space.value.id, boardId: board?.id, boardCount: space.value.boards.length, contentVersion: board?.contentVersion, outfitId: board?.outfitId, revision: board?.revision, name: board?.name, selectedIds: board?.selectedIds || [], garmentId: selected?.garmentId, scene: board?.scene } },
    apply: (scene, title) => { const board = active.value; if (!board || board.locked) throw new Error('请先选中可编辑组合台。'); mutateBoard(board, scene); if (title) board.name = title },
    save: async () => { if (!active.value) throw new Error('请先选中组合台。'); await confirmSave([active.value]) },
  }
})
onUnmounted(() => { endGlowPreview(); window.removeEventListener('resize', resizeWorkspace); editor.value?.flush(); canvasBridge.value = null })
</script>
<template>
  <section class="outfit-workspace">
    <header class="workspace-heading">
      <RouterLink to="/outfits"><a-button type="text" aria-label="返回搭配库"><ArrowLeftOutlined /></a-button></RouterLink>
      <div class="workspace-title">
        <a-input v-if="focus && active" :value="active.name" :disabled="!!active.locked" :maxlength="100" aria-label="搭配名称" placeholder="给搭配起个名字" @update:value="renameBoard" />
        <h1 v-else>{{ isTemporary ? '临时搭台' : '穿搭工作区' }}</h1>
        <a-tooltip v-if="active && focus" :title="active.locked ? 'Agent 正在搭配' : boardSignature(active) === active.savedSignature ? '已保存到搭配库' : '草稿自动保留在此设备，尚未保存到搭配库'"><span class="workspace-save-dot" :class="{ saved: boardSignature(active) === active.savedSignature }" role="status" :aria-label="boardSignature(active) === active.savedSignature ? '已保存' : '本机草稿'" /></a-tooltip>
        <a-select :value="wsId" size="small" class="workspace-ws-select" aria-label="切换画板" :options="wsOptions" option-label-prop="short" :dropdown-match-select-width="false" @dropdown-visible-change="workspaces = listWorkspaces(owner())" @change="onWorkspaceChange($event as string)" />
      </div>
      <div class="workspace-actions">
        <a-tooltip title="问鱼搭助手"><a-button type="text" class="workspace-assistant" aria-label="打开鱼搭助手" @click="openAssistant"><BloubAvatar :size="34" expression="happy" /></a-button></a-tooltip>
        <a-button class="workspace-personal-action" :disabled="!active || !!active.locked" @click="reviewActive">穿搭检查</a-button><a-button class="workspace-personal-action" :disabled="!readyForOotd" @click="openOotd">OOTD</a-button>
        <a-tooltip title="切换组合台、勾选保存"><a-button type="text" class="workspace-boards-button" :aria-label="`管理组合台，共 ${space.boards.length} 块`" @click="boardsOpen = true"><AppstoreOutlined /><span class="workspace-board-count">{{ space.boards.length }}</span></a-button></a-tooltip>
        <a-tooltip :title="focus ? '总览所有组合台' : '编辑当前组合台'"><a-button type="text" :aria-label="focus ? '总览所有组合台' : '聚焦当前组合台'" :disabled="!space.boards.length" @click="focus = !focus"><ExpandOutlined /><span class="workspace-view-label">{{ focus ? '总览' : '聚焦' }}</span></a-button></a-tooltip>
        <a-dropdown :trigger="['click']" placement="bottomRight"><a-button type="text" aria-label="更多搭台操作"><MoreOutlined /></a-button><template #overlay><a-menu @click="moreAction">
          <a-menu-item key="new" :disabled="space.boards.length >= 12"><PlusOutlined /> 新组合台</a-menu-item>
          <a-menu-item key="open"><FolderOpenOutlined /> 打开已有搭配</a-menu-item>
          <a-menu-divider />
          <a-menu-item key="review" :disabled="!active || !!active.locked">穿搭检查</a-menu-item><a-menu-item key="ootd" :disabled="!readyForOotd">OOTD（先保存搭配）</a-menu-item>
          <a-menu-item key="details" :disabled="!active"><InfoCircleOutlined /> 搭配说明与保存状态</a-menu-item>
          <a-menu-item key="export" :disabled="!focus || !active?.scene.elements.length || !!active?.locked"><DownloadOutlined /> 导出当前搭配</a-menu-item>
          <a-menu-item v-if="active?.outfitId" key="copy" :disabled="!!active.locked">另存副本…</a-menu-item>
          <a-menu-item v-if="active?.sourceOutfitId && !active.outfitId" key="overwrite" :disabled="!!active.locked">覆盖原搭配…</a-menu-item>
          <a-menu-item key="ws-rename" :disabled="wsId === 'main' || isTemporary">重命名画板…</a-menu-item><a-menu-item v-if="wsId !== 'main'" key="ws-delete" danger :disabled="!!currentRun"><CloseOutlined /> 删除这个画板…</a-menu-item><a-menu-divider /><a-menu-item key="preview"><AimOutlined /> 预览 AI 光晕</a-menu-item><a-menu-item key="sound"><SoundOutlined v-if="soundEnabled" /><AudioMutedOutlined v-else />{{ soundEnabled ? '关闭音效' : '开启音效' }}</a-menu-item>
        </a-menu></template></a-dropdown>
        <a-button type="primary" class="workspace-save" :loading="saving" :disabled="!saveTargets.length || saveTargets.every(b => !!b.locked || !b.scene.elements.length)" @click="confirmSave().catch(() => {})"><SaveOutlined /><span>{{ !focus && checked.length ? `保存 ${checked.length} 套` : '保存' }}</span></a-button>
      </div>
    </header>
    <div v-if="storageWarning.text || error" class="workspace-notice"><a-alert type="warning" show-icon closable :message="storageWarning.text || error" @close="error = ''" /></div>
    <div v-if="currentRun" class="workspace-runbar" role="status"><span class="workspace-ai-dot" /><strong>{{ canvasExecution.label || '正在准备搭配' }}</strong><a-button v-if="!canvasExecution.following" aria-label="恢复跟随 Agent" @click="followCurrent"><AimOutlined /></a-button><a-button danger @click="stopCanvasRun()">停止并接手</a-button></div>
    <div v-if="glowPreview && !currentRun" class="workspace-runbar workspace-glow-preview" role="status"><span class="workspace-ai-dot" /><strong>光晕效果预览 · 不执行操作</strong><a-button @click="endGlowPreview">结束预览</a-button></div>
    <div v-if="focus && active" class="workspace-focus" :class="{ 'agent-operating': !!active.locked }">
      <OutfitPage :key="active.id" ref="editor" :board="active" :save-board="() => confirmSave([active!])" />

      <a-alert v-if="active.error" class="workspace-board-error" type="error" :message="active.error" show-icon closable @close="active.error = ''" />
    </div>
    <div v-else ref="viewport" class="workspace-viewport" aria-label="多组合台工作平面" @wheel.prevent="wheel" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan">
      <div class="workspace-surface" :style="surfaceStyle">
        <article v-for="(board, index) in space.boards" :key="board.id" class="workspace-artboard" :class="{ selected: active?.id === board.id, 'agent-operating': !!board.locked }" :style="{ left: `${index % 3 * 300}px`, top: `${Math.floor(index / 3) * 430}px` }">
          <header><span>0{{ index + 1 }} · {{ board.name }}</span><a-checkbox :checked="checked.includes(board.id)" :disabled="!!board.locked" :aria-label="`选择组合台 ${board.name}`" @change="toggleChecked(board.id, $event.target.checked)" /></header>
          <a-button class="workspace-artboard-preview" @click="selectBoard(board, true)" :aria-label="`编辑 ${board.name}`"><OutfitThumbnail :scene="board.scene" :title="board.name" :resolution="420" /></a-button>
          <footer><span>{{ board.status }}</span><a-button type="text" :disabled="!!board.locked" :aria-label="`关闭组合台 ${board.name}`" @click="closeBoard(board)"><CloseOutlined /></a-button></footer>
          <div v-if="board.locked" class="workspace-aurora workspace-aurora-board" aria-hidden="true" />
        </article>
      </div>
      <div v-if="!space.boards.length" class="workspace-empty"><p class="eyebrow">A LITTLE SPACE TO EXPERIMENT</p><h2>把今天想穿的，放在一起。</h2><p>{{ isTemporary ? 'Agent 的方案会在这里逐步搭起来。临时结果只保留在此设备。' : '每块组合台一套搭配，放在一起看看，再决定穿哪套。' }}</p><a-button type="primary" @click="newBoard"><PlusOutlined /> 新建第一个组合台</a-button></div>
      <div class="workspace-camera"><a-button size="small" aria-label="缩小工作区" @click="userCamera(); space.camera.scale = Math.max(.25, space.camera.scale / 1.2)"><MinusOutlined /></a-button><span>{{ Math.round(space.camera.scale * 100) }}%</span><a-button size="small" aria-label="放大工作区" @click="userCamera(); space.camera.scale = Math.min(2.5, space.camera.scale * 1.2)"><PlusOutlined /></a-button><a-button size="small" @click="userCamera(); fitOverview()">适应全部</a-button></div>
    </div>
    <div v-if="currentRun || glowPreview" class="workspace-aurora workspace-aurora-area" aria-hidden="true" />
    <a-drawer v-model:open="boardsOpen" title="工作区组合台" placement="left" :width="Math.min(360, windowWidth)" root-class-name="workspace-board-drawer">
      <p class="workspace-drawer-note">{{ workspaceName }} · {{ space.boards.length }} / 12 块 · {{ checked.length ? `已选择 ${checked.length} 块` : isTemporary ? '临时方案满意后再保存' : '草稿自动保留在此设备' }}</p>
      <a-checkbox :checked="allManageableChecked" :indeterminate="checked.length > 0 && !allManageableChecked" :disabled="!manageableBoards.length" @change="toggleAllBoards($event.target.checked)">全选可管理组合台</a-checkbox>
      <nav class="workspace-board-nav" aria-label="工作区组合台"><div v-for="(board, index) in space.boards" :key="board.id" :class="{ active: active?.id === board.id }">
        <a-checkbox :checked="checked.includes(board.id)" :aria-label="`选择组合台 ${board.name}`" :disabled="!!board.locked" @change="toggleChecked(board.id, $event.target.checked)" />
        <a-button type="text" class="workspace-board-choice" @click="selectFromDrawer(board)"><span>{{ index + 1 }} · {{ board.name }}</span><small>{{ board.locked ? '搭配中' : boardSignature(board) === board.savedSignature ? '已保存' : '本机草稿' }}</small></a-button>
        <a-button type="text" :disabled="!!board.locked" :aria-label="`关闭组合台 ${board.name}`" @click="closeBoard(board)"><CloseOutlined /></a-button>
      </div></nav>
      <a-empty v-if="!space.boards.length" description="新建组合台，开始一套搭配" />
      <template #footer><div class="workspace-drawer-actions"><a-button :disabled="space.boards.length >= 12" @click="newBoard"><PlusOutlined /> 新组合台</a-button><a-button danger :disabled="!checked.length || !selection.some(board => checked.includes(board.id) && !board.locked)" @click="discardBoards()"><CloseOutlined /> 丢弃所选 {{ checked.length }} 块</a-button><a-button type="primary" :loading="saving" :disabled="!selection.length" @click="confirmSave().catch(() => {})"><SaveOutlined /> 保存所选 {{ checked.length || (active ? 1 : 0) }} 套</a-button><a-button v-if="wsId !== 'main'" danger block :disabled="!!currentRun" @click="deleteWorkspace">删除这个画板</a-button></div></template>
    </a-drawer>
    <a-modal v-model:open="boardModal.open" title="新建组合台" ok-text="新建" cancel-text="取消" :width="400" @ok="createBoardIn(boardModal.target, boardModal.name)">
      <a-form layout="vertical">
        <a-form-item label="放进哪个画板"><a-select v-model:value="boardModal.target" :options="workspaces.map(w => ({ value: w.id, label: wsLabel(w) }))" aria-label="放进哪个画板" /></a-form-item>
        <a-form-item label="组合台名称（可以以后再改）"><a-input v-model:value="boardModal.name" :maxlength="100" placeholder="未命名搭配" @press-enter="createBoardIn(boardModal.target, boardModal.name)" /></a-form-item>
      </a-form>
    </a-modal>
    <a-modal v-model:open="workspaceModal.open" :title="workspaceModal.mode === 'create' ? '新建画板' : '重命名画板'" :ok-text="workspaceModal.mode === 'create' ? '新建' : '保存'" cancel-text="取消" :width="380" @ok="submitWorkspace">
      <a-input v-model:value="workspaceModal.name" :maxlength="20" show-count placeholder="例如：周末出游、通勤" aria-label="画板名称" @press-enter="submitWorkspace" />
      <p class="workspace-modal-note">画板用来分组放组合台：默认有一个「默认画板」，Agent 搭配时会自己建临时画板，你也可以自己建。</p>
    </a-modal>
    <OutfitReview v-if="active" v-model:open="reviewOpen" :scene="active.scene" />
    <a-drawer v-model:open="boardInfo" title="搭配说明" :width="Math.min(380, windowWidth)">
      <template v-if="active"><h2 class="workspace-info-title">{{ active.name }}</h2><a-tag>{{ boardSignature(active) === active.savedSignature ? '已保存至搭配库' : '本机草稿' }}</a-tag><p>{{ active.reason || active.status }}</p><p>{{ isTemporary ? '临时搭台不会自动保存到账号，请确认满意后保存。' : '草稿自动保留在当前设备，保存后才能在其他设备查看。' }}</p><a-alert v-if="active.scene.elements.some(e => ['INPUT','GENERATE','DISPLAY'].includes(e.assetKind))" type="info" message="原图含背景，穿搭衔接仅供参考。" show-icon /><a-alert v-if="active.error" type="error" :message="active.error" show-icon /></template>
    </a-drawer>
    <a-modal v-model:open="openLibrary" title="打开已有搭配" :footer="null" :width="800"><a-spin v-if="opening" /><div v-else class="workspace-library"><a-button v-for="outfit in saved" :key="outfit.id" @click="openOutfit(outfit)"><OutfitThumbnail :scene="outfit.scene" :title="outfit.name" /><span>{{ outfit.name }}</span></a-button><a-empty v-if="!saved.length" description="还没有保存的搭配" /></div></a-modal>
  </section>
</template>
<style>
.outfit-workspace { position: relative; display: flex; flex-direction: column; height: 100%; min-width: 0; padding: 0; overflow: hidden; }
.workspace-heading { display: flex; flex: none; height: 56px; gap: 12px; align-items: center; padding: 6px 12px; border-bottom: 1px solid var(--line); background: var(--surface); }
.workspace-heading > a, .workspace-actions { flex: none; }
.workspace-heading > a > .ant-btn, .workspace-actions > .ant-btn, .workspace-actions > .ant-dropdown-trigger { height: 36px; min-width: 36px; padding-inline: 10px; }
.workspace-title { display: flex; flex: 1; min-width: 0; align-items: center; gap: 14px; }
.workspace-title h1 { margin: 0; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.workspace-title .ant-input { width: min(280px, 100%); min-width: 0; font-size: 16px; font-weight: 500; border-color: transparent; background: transparent; }
.workspace-title .ant-input:hover, .workspace-title .ant-input:focus { border-color: var(--line); }
.workspace-mode-label { color: var(--muted); font-size: 12px; white-space: nowrap; }
.workspace-save-dot { flex: none; width: 7px; height: 7px; background: var(--warning); border-radius: 50%; }
.workspace-save-dot.saved { background: var(--success); }
.workspace-actions { display: flex; align-items: center; gap: 10px; }
.workspace-actions .workspace-personal-action + .workspace-personal-action { margin-left: 0; }
.workspace-assistant.ant-btn { display: inline-flex; align-items: center; justify-content: center; }
.workspace-board-count { font-size: 12px; }
.workspace-save.ant-btn { min-width: 80px; }
.workspace-boards-button { position: relative; }
.workspace-board-nav { display: flex; flex-direction: column; gap: 8px; }
.workspace-board-nav > div { display: flex; align-items: center; gap: 8px; border-radius: var(--radius-sm); padding: 4px 8px; }
.workspace-board-nav > div.active { background: var(--accent-soft); }
.workspace-board-choice.ant-btn { flex: 1; min-width: 0; height: auto; min-height: 52px; text-align: left; padding: 6px; }
.workspace-board-choice.ant-btn > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-board-choice small { display: block; color: var(--muted); font-size: 12px; margin-top: 3px; }
.workspace-board-nav .ant-checkbox-wrapper { padding: 12px 0; }
.workspace-board-nav .ant-btn:last-child { width: 36px; height: 36px; padding: 0; flex: none; }
.workspace-drawer-note { margin-bottom: 16px; color: var(--muted); font-size: 13px; }
.workspace-drawer-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.workspace-drawer-actions .ant-btn { flex: 1 1 auto; min-width: 0; }
.workspace-drawer-actions .ant-btn-block { flex-basis: 100%; }
.workspace-info-title { font-size: 18px; margin-bottom: 12px; }
.workspace-notice { position: absolute; z-index: 40; top: 64px; left: 12px; right: 12px; }
.workspace-runbar { position: absolute; z-index: 40; top: 64px; left: 248px; right: 288px; display: flex; align-items: center; gap: 8px; padding: 4px 8px 4px 14px; border: 1px solid var(--info-line); border-radius: var(--radius-md); color: var(--info); background: var(--info-bg); box-shadow: 0 4px 16px #202a4010; font-size: 12px; }
.workspace-runbar strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-runbar .ant-btn { flex: none; height: 36px; }
.workspace-ai-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #827bd0; box-shadow: 0 0 12px #aab3ee; }
.workspace-focus { position: relative; isolation: isolate; display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
.workspace-focus .outfit-editor-page { flex: 1; min-height: 0; height: auto; padding: 0; }
.workspace-board-error { position: absolute; z-index: 6; bottom: 36px; left: 12px; right: 12px; }
.workspace-viewport { position: relative; flex: 1; min-height: 0; overflow: hidden; background-color: var(--paper); background-image: radial-gradient(var(--line) .8px, transparent .8px); background-size: 18px 18px; touch-action: none; cursor: grab; }
.workspace-surface { position: absolute; transform-origin: 0 0; }
.workspace-artboard { position: absolute; width: 280px; box-shadow: 0 6px 25px #3d463210; border: 1px solid var(--line); border-radius: var(--radius-lg); color: var(--ink); background: var(--canvas); overflow: hidden; }
.workspace-artboard.selected { outline: 2px solid var(--ink); outline-offset: 3px; }
.workspace-artboard header, .workspace-artboard footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 12px; font-size: 12px; }
.workspace-artboard-preview.ant-btn { display: block; width: 100%; height: auto; padding: 0; border: 0; border-radius: 0; }
.workspace-artboard-preview.ant-btn > span { display: block; width: 100%; }
.workspace-artboard .outfit-thumbnail { width: 100%; }
.workspace-artboard canvas { width: 100%; height: auto; display: block; }
.workspace-artboard footer { font-size: 11px; color: var(--muted); }
.workspace-camera { position: absolute; right: 104px; bottom: 16px; display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--overlay); border-radius: var(--radius-lg); cursor: default; box-shadow: 0 2px 12px #0001; }
.workspace-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(90%, 430px); text-align: center; cursor: default; }
.workspace-empty h2 { font-size: 24px; }
.workspace-empty p { color: var(--muted); line-height: 1.8; }
.workspace-library { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.workspace-library .ant-btn { height: auto; padding: 0; white-space: normal; overflow: hidden; }
.workspace-library canvas { width: 100%; height: auto; display: block; }
.workspace-library span { display: block; padding: 10px; }
/* The edge field communicates control at the scale of the studio, with a clear centre. */
.workspace-aurora { position: absolute; inset: 0; z-index: 5; pointer-events: none; overflow: hidden; border-radius: inherit; isolation: isolate; }
.workspace-aurora-area { top: 56px; --glow-depth: clamp(54px, 10vmin, 110px); }
.workspace-aurora::before, .workspace-aurora::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit; }
.workspace-aurora::before {
  background: linear-gradient(to bottom, rgb(78 108 235 / .62), rgb(97 118 235 / .18) 45%, transparent) top / 100% var(--glow-depth) no-repeat,
    linear-gradient(to top, rgb(91 105 236 / .68), rgb(111 115 240 / .2) 48%, transparent) bottom / 100% var(--glow-depth) no-repeat,
    linear-gradient(to right, rgb(83 112 235 / .58), rgb(111 123 239 / .16) 46%, transparent) left / var(--glow-depth) 100% no-repeat,
    linear-gradient(to left, rgb(101 100 234 / .6), rgb(136 115 239 / .18) 46%, transparent) right / var(--glow-depth) 100% no-repeat;
  box-shadow: inset 0 0 0 2px rgb(163 178 255 / .9), inset 0 0 20px rgb(86 116 246 / .65);
  opacity: .85;
}
.workspace-aurora::after {
  background: radial-gradient(ellipse at 3% 2%, rgb(109 139 255 / .6), transparent 44%), radial-gradient(ellipse at 98% 100%, rgb(136 109 244 / .5), transparent 42%);
  box-shadow: inset 0 0 64px rgb(102 117 245 / .55), inset 0 0 16px rgb(169 189 255 / .8);
  opacity: .48;
  transform: scale(1);
  animation: workspace-aurora-breathe 5s ease-in-out infinite;
  will-change: opacity, transform;
}
.workspace-aurora-board { --glow-depth: 38px; border-radius: var(--radius-lg); }
.workspace-aurora-board::before { opacity: .7; }
.workspace-aurora-board::after { background: none; }
.workspace-focus.agent-operating { outline: 1px solid #a9b9e9; outline-offset: -1px; }
@keyframes workspace-aurora-breathe { 0%, 100% { opacity: .38; transform: scale(1.015); } 50% { opacity: .9; transform: scale(1); } }
@media(prefers-reduced-motion: reduce) { .workspace-aurora::after { animation: none; opacity: .6; transform: none; will-change: auto; } }
@media(max-width: 1279px) and (min-width: 1024px) { .workspace-runbar { left: var(--sidebar-w, 224px); right: 256px; } }
@media(max-width: 1023px) {
  .workspace-heading { gap: 4px; padding: 6px 8px; }
  .workspace-heading > a > .ant-btn, .workspace-actions > .ant-btn, .workspace-actions > .ant-dropdown-trigger { padding: 0; width: 36px; }
  .workspace-title { gap: 4px; }
  .workspace-title h1 { font-size: 14px; }
  .workspace-title .ant-input { padding-inline: 4px; font-size: 16px; }
  .workspace-mode-label, .workspace-actions .workspace-view-label, .workspace-save-dot { display: none; }
  .workspace-actions { gap: 0; }
  .workspace-save.ant-btn { width: auto; min-width: 56px; padding-inline: 8px; }
  .workspace-save .anticon { display: none; }
  .workspace-board-count { position: absolute; top: 2px; right: 0; font-size: 10px; background: var(--surface); line-height: 14px; padding: 0 2px; }
  .workspace-actions .ant-btn > .anticon + span { margin-inline-start: 0; }
  .workspace-title h1 { max-width: 120px; }
  .workspace-runbar { left: 8px; right: 8px; top: 62px; }
  .workspace-focus .outfit-editor-page { padding-bottom: calc(68px + env(safe-area-inset-bottom)); }
  .workspace-board-error { bottom: 100px; }
  .workspace-camera { right: auto; left: 12px; bottom: 12px; }
  .workspace-library { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>

<style scoped>
.workspace-ws-select { width: 168px; flex: none; }
.workspace-modal-note { margin: 12px 0 0; font-size: 12px; line-height: 1.7; color: var(--muted-copy); }
@media (max-width: 767px) { .workspace-ws-select { width: 118px; } }@media(max-width:760px){.workspace-personal-action{display:none}}</style>
