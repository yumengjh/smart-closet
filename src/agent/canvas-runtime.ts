import { nextTick, reactive } from 'vue'
import { recordBoardTrace } from './trace-client'
import { router } from '../router'
import { useClosetStore } from '../stores/closet'
import { closetApi } from '../services/api'
import { agentRequest, type AgentContext } from './api'
import { createOutfitElement } from '../domain/outfit-images'
import { arrangeOutfit, orderOutfitLayers } from '../domain/outfit-layout'
import { addBoard, createBoard, mutateBoard, workspace, type OutfitWorkspace } from '../domain/outfit-workspace'
import { sceneWrite, type OutfitScene } from '../domain/outfit'
import { playSound } from '../services/sound'

export type CanvasCommand = { runId: string; sessionId: string; workspaceId: string; boardId: string; operationId: string; sequence: number; expectedVersion: number; kind: string; label: string; payload: any }
export const canvasExecution = reactive({ runId: '', workspaceId: '', boardId: '', label: '', following: true, error: '' })
type LocalRun = { cancelled: boolean; space: OutfitWorkspace; path: string }
const runs = new Map<string, LocalRun>()
const applied = new Map<string, { version: number; scene?: unknown; boardCount?: number }>()
let queue = Promise.resolve()

export function handleCanvasCommand(command: CanvasCommand) {
  queue = queue.then(() => execute(command)).catch(() => {})
}
export async function stopCanvasRun(runId = canvasExecution.runId) {
  const run = runs.get(runId)
  if (run) {
    run.cancelled = true
    for (const board of run.space.boards) if (board.locked === runId) { board.locked = undefined; board.status = '已停止 · 可继续编辑' }
  }
  if (canvasExecution.runId === runId) { canvasExecution.runId = ''; canvasExecution.label = '' }
  try { await agentRequest(`/runs/${runId}/cancel`, 'POST', {}) } catch { /* Server also expires unacknowledged commands. */ }
}
export function failCanvasExecution() { for (const [id, run] of runs) if (!run.cancelled) void stopCanvasRun(id) }

async function execute(command: CanvasCommand) {
  const owner = useClosetStore().user?.username
  const currentBoard = runs.get(command.runId)?.space.boards.find(b => b.id === command.boardId)
  const before = currentBoard ? structuredClone(JSON.parse(JSON.stringify(currentBoard.scene))) : undefined
  const ack = (body: unknown) => agentRequest(`/runs/${command.runId}/ack`, 'POST', { operationId: command.operationId, sequence: command.sequence, ...body as object })
  const reported = (ackStatus: string, message = '') => {
    const board = runs.get(command.runId)?.space.boards.find(b => b.id === command.boardId)
    if (owner && board) recordBoardTrace(owner, command.sessionId, command.boardId, 'agent', before, board.scene, { operationId: command.operationId, runId: command.runId, beforeVersion: command.expectedVersion, afterVersion: board.contentVersion, ackStatus, message })
  }
  const duplicate = applied.get(command.operationId)
  if (duplicate) { try { await ack({ success: true, ...duplicate }); reported('DUPLICATE_CONFIRMED') } catch (e) { reported('DUPLICATE_ACK_FAILED', e instanceof Error ? e.message : '') }; return }
  try {
    if (!owner) throw new Error('登录已失效。')
    let run = runs.get(command.runId)
    if (command.kind === 'open') {
      const space = workspace(owner, command.workspaceId)
      if (space.boards.length + command.payload.requiredBoards > 12) throw new Error('画板容量不足，请先保存并关闭部分画板。')
      // A source snapshot must still match the source board when a run starts.
      const source = command.payload.source as AgentContext | undefined
      if (source?.workspaceId && source.boardId) {
        const sourceBoard = workspace(owner, source.workspaceId).boards.find(b => b.id === source.boardId)
        if (!sourceBoard || sourceBoard.contentVersion !== source.contentVersion) throw new Error('源画板已经变化，请重新发起调整。')
      }
      for (const [id, previous] of runs) if (!previous.cancelled && previous.space.id === space.id) await stopCanvasRun(id)
      const path = `/outfits/workspace?session=${command.sessionId}`
      run = { cancelled: false, space, path }; runs.set(command.runId, run)
      Object.assign(canvasExecution, { runId: command.runId, workspaceId: space.id, boardId: '', label: command.label, following: true, error: '' })
      await router.push(path); await nextTick()
      const result = { version: 0, boardCount: space.boards.length }; applied.set(command.operationId, result); await ack({ success: true, ...result }); return
    }
    if (!run || run.cancelled || !isRunRoute(router.currentRoute.value, run)) throw new Error('操作已停止或已经离开搭台。')
    const space = run.space
    if (command.kind === 'complete') {
      for (const board of space.boards) if (board.locked === command.runId) { board.locked = undefined; board.status = '待你确认 · 未保存' }
      run.cancelled = true; canvasExecution.runId = ''; canvasExecution.label = ''; playSound('complete')
      const result = { version: 0 }; applied.set(command.operationId, result); await ack({ success: true, ...result }); return
    }
    let board = space.boards.find(b => b.id === command.boardId)
    if (command.kind === 'create') {
      if (board) throw new Error('画板已存在。')
      board = createBoard(command.payload.name, command.payload.scene as OutfitScene | undefined, command.boardId)
      board.traceSessionId = command.sessionId; board.traceOwner = owner
      board.reason = command.payload.reason
      board.sourceOutfitId = command.payload.sourceOutfitId; board.sourceRevision = command.payload.sourceRevision
      board.undo = [board.scene.elements.map(e => ({ ...e }))]
      board.locked = command.runId; board.status = '正在搭配'; const previous = space.activeId; addBoard(space, board); if (!canvasExecution.following) space.activeId = previous
    } else {
      if (command.kind === 'begin' && board && !board.locked && board.contentVersion === command.expectedVersion) { board.locked = command.runId; board.undo = [...board.undo.slice(-79), board.scene.elements.map(e => ({ ...e }))]; board.redo = []; board.status = '正在调整' }
      if (!board || board.locked !== command.runId || board.contentVersion !== command.expectedVersion) throw new Error('画板内容已改变，停止后请重新发起操作。')
      if (command.kind === 'begin') { /* Lock and snapshot are applied above. */ }
      else if (command.kind === 'add' || command.kind === 'replace') {
        const garment = await closetApi.detail(command.payload.garmentId)
        if (garment.status !== 'ACTIVE') throw new Error('衣物已不在衣柜中。')
        const item = await createOutfitElement(garment, board.scene.elements)
        if (run.cancelled || board.contentVersion !== command.expectedVersion) throw new Error('操作已停止。')
        const elements = [...board.scene.elements]
        if (command.kind === 'replace') {
          const index = elements.findIndex(e => e.elementId === command.payload.elementId)
          if (index < 0) throw new Error('待替换的衣物已经变化。')
          elements[index] = { ...item, elementId: elements[index].elementId, zIndex: elements[index].zIndex }
        } else elements.push(item)
        mutateBoard(board, orderOutfitLayers({ ...board.scene, elements }), false); playSound('pop')
      } else if (command.kind === 'remove') {
        const index = board.scene.elements.findIndex(e => e.elementId === command.payload.elementId)
        if (index < 0) throw new Error('待移除的贴纸已不存在。')
        mutateBoard(board, orderOutfitLayers({ ...board.scene, elements: board.scene.elements.filter((_, i) => i !== index) }), false)
      } else if (command.kind === 'layout') mutateBoard(board, arrangeOutfit(board.scene), false)
      else if (command.kind === 'adjust') {
        const { elementId, intent } = command.payload
        const elements = board.scene.elements.map(e => e.elementId !== elementId ? e : { ...e,
          x: Math.max(0, Math.min(1080, e.x + (intent === 'left' ? -30 : intent === 'right' ? 30 : 0))),
          y: Math.max(0, Math.min(1350, e.y + (intent === 'up' ? -30 : intent === 'down' ? 30 : 0))),
          width: Math.max(24, Math.min(2160, e.width * (intent === 'smaller' ? .9 : intent === 'larger' ? 1.1 : 1))),
          height: Math.max(24, Math.min(2700, e.height * (intent === 'smaller' ? .9 : intent === 'larger' ? 1.1 : 1))), flipX: intent === 'flip' ? !e.flipX : e.flipX })
        mutateBoard(board, { ...board.scene, elements }, false)
      } else if (command.kind === 'finish') { board.locked = undefined; board.status = '待你确认 · 未保存' }
      else throw new Error('未开放的画板操作。')
    }
    if (!board) throw new Error('画板未创建。')
    board.traceSessionId = command.sessionId; board.traceOwner = owner
    Object.assign(canvasExecution, { boardId: board.id, label: command.label })
    if (canvasExecution.following) space.activeId = board.id
    await nextTick()
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 180))
    if (run.cancelled) throw new Error('操作已停止。')
    const result = { version: board.contentVersion, scene: sceneWrite(board.scene) }
    applied.set(command.operationId, result); reported('EXECUTED_PENDING_ACK'); await ack({ success: true, ...result }); reported('ACK_ACCEPTED')
  } catch (e) {
    const text = e instanceof Error ? e.message : '画板操作失败。'
    reported('FAILED', text)
    canvasExecution.error = text
    const run = runs.get(command.runId)
    if (run) { run.cancelled = true; for (const board of run.space.boards) if (board.locked === command.runId) { board.locked = undefined; board.status = '操作中断'; board.error = text } }
    if (canvasExecution.runId === command.runId) canvasExecution.runId = ''
    await ack({ success: false, message: text }).catch(() => {})
  }
}
function isRunRoute(to: { path: string; query: Record<string, unknown> }, run: LocalRun) { return to.path === '/outfits/workspace' && to.query.session === run.space.id.slice('agent:'.length) }
router.afterEach(to => { for (const [id, run] of runs) if (!run.cancelled && !isRunRoute(to, run)) void stopCanvasRun(id) })
window.addEventListener('pagehide', failCanvasExecution)
window.addEventListener('closet-session-expired', failCanvasExecution)
