// 「画板」是装「组合台」（一套搭配）的工作区。默认只有一个「默认画板」；Agent 每次搭配会自己建一个临时画板；也可以自己新建。
// 这里只管画板的清单和当前使用哪一个（仅存在这台浏览器），组合台本身仍由 outfit-workspace.ts 保存。
export type WorkspaceKind = 'default' | 'user' | 'agent'
export type WorkspaceInfo = { id: string; name: string; kind: WorkspaceKind; createdAt: number }
export const DEFAULT_WORKSPACE_ID = 'main'
export const DEFAULT_WORKSPACE_NAME = '默认画板'
export const WORKSPACE_LIMIT = 12
export const WORKSPACE_NAME_LIMIT = 20
type Store = Pick<Storage, 'getItem' | 'setItem'>

const listKey = (owner: string) => `yixu.workspaces.v1:${owner}`
const activeKey = (owner: string) => `yixu.workspace-active.v1:${owner}`
function local(): Store | undefined { try { return globalThis.localStorage } catch { return undefined } }
const dateText = (ms: number) => { const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` }

function stored(owner: string, store: Store | undefined): WorkspaceInfo[] {
  try {
    const raw = JSON.parse(store?.getItem(listKey(owner)) || '[]')
    if (!Array.isArray(raw)) return []
    return (raw as Partial<WorkspaceInfo>[]).filter(w => typeof w?.id === 'string' && typeof w.name === 'string' && (w.kind === 'user' || w.kind === 'agent') && w.id !== DEFAULT_WORKSPACE_ID)
      .map(w => ({ id: w.id!, name: w.name!.slice(0, 60), kind: w.kind as WorkspaceKind, createdAt: Number(w.createdAt) || 0 }))
  } catch { return [] }
}
function save(owner: string, list: WorkspaceInfo[], store: Store | undefined) { try { store?.setItem(listKey(owner), JSON.stringify(list)) } catch { /* storage blocked */ } }

export function listWorkspaces(owner: string, store: Store | undefined = local()): WorkspaceInfo[] {
  return [{ id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME, kind: 'default', createdAt: 0 }, ...stored(owner, store).sort((a, b) => a.createdAt - b.createdAt)]
}
export function cleanWorkspaceName(name: string): string | null {
  const value = name.trim().replace(/\s+/g, ' ')
  return value && value.length <= WORKSPACE_NAME_LIMIT ? value : null
}
/** A temporary Agent workspace shows up in the list the first time it is used. */
export function registerAgentWorkspace(owner: string, id: string, now = Date.now(), store: Store | undefined = local()) {
  if (!id.startsWith('agent:')) return
  const list = stored(owner, store)
  if (list.some(w => w.id === id)) return
  const info: WorkspaceInfo = { id, name: `AI 搭配 · ${dateText(now)}`, kind: 'agent', createdAt: now }
  save(owner, [...list, info].slice(-WORKSPACE_LIMIT * 2), store)
}
export function createWorkspace(owner: string, name: string, now = Date.now(), store: Store | undefined = local(), id = `ws:${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`): WorkspaceInfo {
  const clean = cleanWorkspaceName(name)
  if (!clean) throw new Error(`画板名称需为 1 到 ${WORKSPACE_NAME_LIMIT} 个字。`)
  const all = listWorkspaces(owner, store)
  if (all.filter(w => w.kind !== 'agent').length >= WORKSPACE_LIMIT) throw new Error(`最多 ${WORKSPACE_LIMIT} 个画板，请先删除不用的。`)
  if (all.some(w => w.name === clean)) throw new Error('已经有同名的画板。')
  const info: WorkspaceInfo = { id, name: clean, kind: 'user', createdAt: now }
  save(owner, [...stored(owner, store), info], store)
  return info
}
export function renameWorkspace(owner: string, id: string, name: string, store: Store | undefined = local()) {
  if (id === DEFAULT_WORKSPACE_ID) throw new Error('默认画板不能改名。')
  const clean = cleanWorkspaceName(name)
  if (!clean) throw new Error(`画板名称需为 1 到 ${WORKSPACE_NAME_LIMIT} 个字。`)
  const list = stored(owner, store)
  if (!list.some(w => w.id === id)) throw new Error('没有找到这个画板。')
  if (list.some(w => w.id !== id && w.name === clean) || clean === DEFAULT_WORKSPACE_NAME) throw new Error('已经有同名的画板。')
  save(owner, list.map(w => w.id === id ? { ...w, name: clean } : w), store)
}
export function removeWorkspace(owner: string, id: string, store: Store | undefined = local()) {
  if (id === DEFAULT_WORKSPACE_ID) throw new Error('默认画板不能删除。')
  save(owner, stored(owner, store).filter(w => w.id !== id), store)
  if (activeWorkspace(owner, store) === DEFAULT_WORKSPACE_ID) setActiveWorkspace(owner, DEFAULT_WORKSPACE_ID, store)
}
/** The workspace used last, if it still exists; otherwise the default one. */
export function activeWorkspace(owner: string, store: Store | undefined = local()): string {
  try { const id = store?.getItem(activeKey(owner)) || ''; return listWorkspaces(owner, store).some(w => w.id === id) ? id : DEFAULT_WORKSPACE_ID } catch { return DEFAULT_WORKSPACE_ID }
}
export function setActiveWorkspace(owner: string, id: string, store: Store | undefined = local()) {
  try { store?.setItem(activeKey(owner), id) } catch { /* storage blocked */ }
}
