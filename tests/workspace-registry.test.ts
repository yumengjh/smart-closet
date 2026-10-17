import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_WORKSPACE_TTL_MS, pruneAgentWorkspaces, workspaceSummary, activeWorkspace, createWorkspace, DEFAULT_WORKSPACE_ID, listWorkspaces, registerAgentWorkspace, removeWorkspace, renameWorkspace, setActiveWorkspace, WORKSPACE_LIMIT } from '../src/domain/workspace-registry.ts'

function memory() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m } }

test('there is always exactly one default workspace, first in the list', () => {
  const s = memory()
  assert.deepEqual(listWorkspaces('a', s).map(w => [w.id, w.name, w.kind]), [[DEFAULT_WORKSPACE_ID, '默认画板', 'default']])
  createWorkspace('a', '周末出游', 10, s, 'ws:1')
  assert.deepEqual(listWorkspaces('a', s).map(w => w.name), ['默认画板', '周末出游'])
  assert.deepEqual(listWorkspaces('b', s).map(w => w.name), ['默认画板'], 'Another account has its own list')
})

test('names are checked, trimmed and unique; the default cannot be renamed or removed', () => {
  const s = memory()
  createWorkspace('a', '  通勤  ', 1, s, 'ws:1')
  assert.equal(listWorkspaces('a', s)[1]!.name, '通勤')
  assert.throws(() => createWorkspace('a', '通勤', 2, s, 'ws:2'), /同名/)
  assert.throws(() => createWorkspace('a', '   ', 2, s, 'ws:2'), /名称/)
  assert.throws(() => createWorkspace('a', 'x'.repeat(21), 2, s, 'ws:2'), /名称/)
  assert.throws(() => createWorkspace('a', '默认画板', 2, s, 'ws:2'), /同名/)
  assert.throws(() => renameWorkspace('a', DEFAULT_WORKSPACE_ID, '别的', s), /默认画板/)
  assert.throws(() => removeWorkspace('a', DEFAULT_WORKSPACE_ID, s), /默认画板/)
  renameWorkspace('a', 'ws:1', '上班', s); assert.equal(listWorkspaces('a', s)[1]!.name, '上班')
  assert.throws(() => renameWorkspace('a', 'ws:none', '上班2', s), /没有找到/)
})

test('workspace count is limited', () => {
  const s = memory()
  for (let i = 0; i < WORKSPACE_LIMIT - 1; i++) createWorkspace('a', `画板${i}`, i, s, `ws:${i}`)
  assert.throws(() => createWorkspace('a', '多出来的', 99, s, 'ws:x'), /最多/)
})

test('an Agent workspace is listed once, named by time, and does not count against the limit', () => {
  const s = memory()
  const at = new Date(2026, 9, 17, 9, 5).getTime()
  registerAgentWorkspace('a', 'agent:s1', at, s); registerAgentWorkspace('a', 'agent:s1', at + 1, s); registerAgentWorkspace('a', 'main', at, s); registerAgentWorkspace('a', 'ws:1', at, s)
  const list = listWorkspaces('a', s)
  assert.equal(list.length, 2); assert.deepEqual([list[1]!.id, list[1]!.kind, list[1]!.name], ['agent:s1', 'agent', 'AI 搭配 · 10-17 09:05'])
  for (let i = 0; i < WORKSPACE_LIMIT - 1; i++) createWorkspace('a', `画板${i}`, i, s, `ws:${i}`)
})

test('the last used workspace is remembered while it exists, else the default is used', () => {
  const s = memory()
  createWorkspace('a', '周末', 1, s, 'ws:1')
  assert.equal(activeWorkspace('a', s), DEFAULT_WORKSPACE_ID)
  setActiveWorkspace('a', 'ws:1', s); assert.equal(activeWorkspace('a', s), 'ws:1')
  removeWorkspace('a', 'ws:1', s); assert.equal(activeWorkspace('a', s), DEFAULT_WORKSPACE_ID)
  setActiveWorkspace('a', 'ws:ghost', s); assert.equal(activeWorkspace('a', s), DEFAULT_WORKSPACE_ID)
})

test('blocked storage never throws', () => {
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(listWorkspaces('a', blocked).length, 1); assert.equal(activeWorkspace('a', blocked), DEFAULT_WORKSPACE_ID)
  assert.doesNotThrow(() => setActiveWorkspace('a', 'main', blocked))
  assert.doesNotThrow(() => registerAgentWorkspace('a', 'agent:s', 1, blocked))
})

const board = (saved: boolean, elements = 1) => ({ scene: { elements: Array.from({ length: elements }, () => ({})) }, savedSignature: saved ? 'x' : '' })
test('a workspace summary counts boards and unsaved drafts; empty boards are not drafts', () => {
  const s = memory()
  assert.deepEqual(workspaceSummary('a', 'main', s), { boards: 0, unsaved: 0 })
  s.setItem('yixu.workspace.v1:a:main', JSON.stringify({ boards: [board(false), board(true), board(false, 0)] }))
  assert.deepEqual(workspaceSummary('a', 'main', s), { boards: 3, unsaved: 1 })
  s.setItem('yixu.workspace.v1:a:main', '{broken'); assert.deepEqual(workspaceSummary('a', 'main', s), { boards: 0, unsaved: 0 })
})

test('stale Agent workspaces are cleared, but never one that still has an unsaved draft', () => {
  const s = memory(), now = 100 * 86400000, old = now - AGENT_WORKSPACE_TTL_MS - 1
  registerAgentWorkspace('a', 'agent:old-saved', old, s); registerAgentWorkspace('a', 'agent:old-draft', old, s); registerAgentWorkspace('a', 'agent:fresh', now - 1000, s)
  createWorkspace('a', '我的画板', old, s, 'ws:1')
  s.setItem('yixu.workspace.v1:a:agent:old-saved', JSON.stringify({ boards: [board(true)] }))
  s.setItem('yixu.workspace.v1:a:agent:old-draft', JSON.stringify({ boards: [board(false)] }))
  assert.deepEqual(pruneAgentWorkspaces('a', now, s), ['agent:old-saved'])
  assert.deepEqual(listWorkspaces('a', s).map(w => w.id), ['main', 'agent:old-draft', 'ws:1', 'agent:fresh'])
  assert.equal(s.getItem('yixu.workspace.v1:a:agent:old-saved'), null, 'Its saved copy on this device is removed too')
  assert.notEqual(s.getItem('yixu.workspace.v1:a:agent:old-draft'), null)
  assert.deepEqual(pruneAgentWorkspaces('a', now, s), [], 'Nothing more to clear')
})
