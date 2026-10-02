import { reactive, watch } from 'vue'
import { normalizeScene, OUTFIT_VERSION, type Outfit, type OutfitElement, type OutfitScene } from './outfit'

export const BOARD_LIMIT = 12
export type WorkspaceBoard = {
  id: string; name: string; scene: OutfitScene; contentVersion: number
  outfitId?: string; revision: number | null; sourceOutfitId?: string; sourceRevision?: number | null
  savedSignature: string; selectedIds: string[]; undo: OutfitElement[][]; redo: OutfitElement[][]; zoom: number
  locked?: string; status: string; reason?: string; error?: string
}
export type OutfitWorkspace = { id: string; owner: string; boards: WorkspaceBoard[]; activeId: string; camera: { x: number; y: number; scale: number }; updatedAt: number }
const spaces = new Map<string, OutfitWorkspace>()
export const storageWarning = reactive({ text: '' })
export function boardSignature(board: Pick<WorkspaceBoard, 'name' | 'scene'>) { return JSON.stringify({ name: board.name, scene: board.scene }) }
export function createBoard(name = '未命名搭配', scene: OutfitScene = { version: OUTFIT_VERSION, elements: [] }, id: string = crypto.randomUUID()): WorkspaceBoard {
  return { id, name, scene: normalizeScene(scene), contentVersion: 0, revision: null, savedSignature: '', selectedIds: [], undo: [], redo: [], zoom: 1, status: '草稿' }
}
export function addBoard(space: OutfitWorkspace, board: WorkspaceBoard) {
  if (space.boards.length >= BOARD_LIMIT) throw new Error('工作区最多十二块画板，请先保存并关闭部分画板。')
  space.boards.push(board); space.activeId = board.id
}
export function workspace(owner: string, id = 'main'): OutfitWorkspace {
  const key = `yixu.workspace.v1:${owner}:${id}`
  const existing = spaces.get(key); if (existing) return existing
  let saved: OutfitWorkspace | undefined
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); if (value?.owner === owner && value.id === id && Array.isArray(value.boards)) saved = value } catch {}
  const space = reactive<OutfitWorkspace>({ id, owner, boards: (saved?.boards || []).slice(0, BOARD_LIMIT).filter(b => b.scene?.elements && [1, 2].includes(b.scene.version)).map(b => ({ ...createBoard(b.name, b.scene, b.id), ...b, locked: undefined, status: b.locked ? '已中断 · 可继续编辑' : b.status, scene: normalizeScene(b.scene) })), activeId: saved?.activeId || '', camera: saved?.camera || { x: 30, y: 30, scale: 1 }, updatedAt: Date.now() })
  spaces.set(key, space)
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
export function mutateBoard(board: WorkspaceBoard, scene: OutfitScene, record = true) {
  if (record) { board.undo = [...board.undo.slice(-79), board.scene.elements.map(e => ({ ...e }))]; board.redo = [] }
  board.scene = normalizeScene(scene); board.contentVersion++; board.error = ''
  if (!board.locked) board.status = '草稿'
}
