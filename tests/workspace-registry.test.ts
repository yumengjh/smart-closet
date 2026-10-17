import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeWorkspace, createWorkspace, DEFAULT_WORKSPACE_ID, listWorkspaces, registerAgentWorkspace, removeWorkspace, renameWorkspace, setActiveWorkspace, WORKSPACE_LIMIT } from '../src/domain/workspace-registry.ts'

function memory() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }

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
