import { createUuid } from './id'
import { reactive, watch } from 'vue'
import { recordBoardTrace } from '../agent/trace-client'
import { listWorkspaces, registerAgentWorkspace } from './workspace-registry'
import { normalizeScene, OUTFIT_VERSION, type Outfit, type OutfitElement, type OutfitScene } from './outfit'

export const BOARD_LIMIT = 12
export type WorkspaceBoard = {
  id: string; name: string; scene: OutfitScene; contentVersion: number
  outfitId?: string; revision: number | null; sourceOutfitId?: string; sourceRevision?: number | null
  savedSignature: string; selectedIds: string[]; undo: OutfitElement[][]; redo: OutfitElement[][]; zoom: number
  traceSessionId?: string; traceOwner?: string; locked?: string; status: string; reason?: string; error?: string
}
export type OutfitWorkspace = { id: string; owner: string; boards: WorkspaceBoard[]; activeId: string; camera: { x: number; y: number; scale: number }; updatedAt: number }
const spaces = new Map<string, OutfitWorkspace>()
export const storageWarning = reactive({ text: '' })
export function boardSignature(board: Pick<WorkspaceBoard, 'name' | 'scene'>) { return JSON.stringify({ name: board.name, scene: board.scene }) }
export function createBoard(name = '未命名搭配', scene: OutfitScene = { version: OUTFIT_VERSION, elements: [] }, id: string = createUuid()): WorkspaceBoard {
  return { id, name, scene: normalizeScene(scene), contentVersion: 0, revision: null, savedSignature: '', selectedIds: [], undo: [], redo: [], zoom: 1, status: '草稿' }
}
export function addBoard(space: OutfitWorkspace, board: WorkspaceBoard) {
  if (space.boards.length >= BOARD_LIMIT) throw new Error('工作区最多十二个组合台，请先保存并关闭部分组合台。')
  space.boards.push(board); space.activeId = board.id
}
export function workspace(owner: string, id = 'main'): OutfitWorkspace {
  const key = `yixu.workspace.v1:${owner}:${id}`
  registerAgentWorkspace(owner, id)
  const existing = spaces.get(key); if (existing) return existing
  let saved: OutfitWorkspace | undefined
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); if (value?.owner === owner && value.id === id && Array.isArray(value.boards)) saved = value } catch {}
  const space = reactive<OutfitWorkspace>({ id, owner, boards: (saved?.boards || []).slice(0, BOARD_LIMIT).filter(b => b.scene?.elements && [1, 2].includes(b.scene.version)).map(b => ({ ...createBoard(b.name, b.scene, b.id), ...b, locked: undefined, status: b.locked ? '已中断 · 可继续编辑' : b.status, scene: normalizeScene(b.scene) })), activeId: saved?.activeId || '', camera: saved?.camera || { x: 30, y: 30, scale: 1 }, updatedAt: Date.now() })
  spaces.set(key, space)
  for (const board of space.boards) if (board.traceSessionId) recordBoardTrace(owner, board.traceSessionId, board.id, 'restore', undefined, board.scene, { afterVersion: board.contentVersion })
  watch(space, () => {
    try { localStorage.setItem(key, JSON.stringify({ ...space, updatedAt: Date.now() })); storageWarning.text = '' } catch { storageWarning.text = '本机存储空间不足，草稿暂未自动保留。请先保存到搭配库。' }
  }, { deep: true, flush: 'sync' })
  return space
}
export function openSavedBoard(space: OutfitWorkspace, outfit: Outfit) {
  const opened = space.boards.find(b => b.outfitId === outfit.id)
  if (opened) { space.activeId = opened.id; return opened }
  const board = createBoard(outfit.name, outfit.scene)
  board.outfitId = outfit.id; board.revision = outfit.revision; board.savedSignature = boardSignature(board); board.status = '已保存'
  addBoard(space, board); return board
}
export function mutateBoard(board: WorkspaceBoard, scene: OutfitScene, record = true, source = 'proposal') {
  const before = board.scene, beforeVersion = board.contentVersion
  if (record) { board.undo = [...board.undo.slice(-79), board.scene.elements.map(e => ({ ...e }))]; board.redo = [] }
  board.scene = normalizeScene(scene); board.contentVersion++; board.error = ''
  if (!board.locked) board.status = '草稿'
  if (record && board.traceSessionId && board.traceOwner) recordBoardTrace(board.traceOwner, board.traceSessionId, board.id, source, before, board.scene, { beforeVersion, afterVersion: board.contentVersion })
}
/** Forget a workspace (画板) and everything saved on this device for it; saved outfits on the account are untouched. */
export function discardWorkspace(owner: string, id: string) {
  const key = `yixu.workspace.v1:${owner}:${id}`
  const space = spaces.get(key); if (space) { space.boards = []; space.activeId = '' }
  spaces.delete(key)
  try { localStorage.removeItem(key) } catch { /* storage blocked */ }
}

/** Where a saved outfit is already open as a 组合台, looking in `preferId` first, then in every other 画板 of the account. */
export function findOpenOutfit(owner: string, outfitId: string, preferId = 'main'): { workspaceId: string; boardId: string } | null {
  const ids = [preferId, ...listWorkspaces(owner).map(w => w.id).filter(id => id !== preferId)]
  for (const id of ids) {
    const board = workspace(owner, id).boards.find(b => b.outfitId === outfitId)
    if (board) return { workspaceId: id, boardId: board.id }
  }
  return null
}
/**
 * A saved outfit should be open in only one 画板. Older versions let the same outfit be opened in several, so merge them:
 * the copy with unsaved edits wins, else the one in `keepIn`, else the first; other copies are dropped only when they carry
 * no edits of their own (nothing is lost). Returns how many duplicates were removed.
 */
export function dedupeOpenOutfits(owner: string, keepIn = 'main'): number {
  const ids = [keepIn, ...listWorkspaces(owner).map(w => w.id).filter(id => id !== keepIn)]
  const groups = new Map<string, { space: OutfitWorkspace; board: WorkspaceBoard }[]>()
  for (const id of ids) {
    const space = workspace(owner, id)
    for (const board of space.boards) if (board.outfitId) groups.set(board.outfitId, [...(groups.get(board.outfitId) || []), { space, board }])
  }
  let removed = 0
  for (const copies of groups.values()) {
    if (copies.length < 2) continue
    const edited = (c: { board: WorkspaceBoard }) => boardSignature(c.board) !== c.board.savedSignature
    const keeper = copies.find(edited) || copies[0]
    for (const copy of copies) {
      if (copy === keeper || copy.board.locked || edited(copy)) continue
      copy.space.boards = copy.space.boards.filter(b => b.id !== copy.board.id)
      if (copy.space.activeId === copy.board.id) copy.space.activeId = copy.space.boards[0]?.id || ''
      removed++
    }
  }
  return removed
}
