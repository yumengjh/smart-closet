import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readCollapsed, saveCollapsed, sidebarWidth } from '../src/shell/sidebarPreference.ts'

function memory() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }

test('the sidebar is expanded until the person collapses it, and the choice is remembered', () => {
  const s = memory()
  assert.equal(readCollapsed(s), false)
  saveCollapsed(true, s); assert.equal(readCollapsed(s), true)
  saveCollapsed(false, s); assert.equal(readCollapsed(s), false)
})

test('blocked storage never throws and keeps the sidebar expanded', () => {
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readCollapsed(blocked), false)
  assert.doesNotThrow(() => saveCollapsed(true, blocked))
})

test('collapsed width only fits icons', () => {
  assert.equal(sidebarWidth(false), 224); assert.equal(sidebarWidth(true), 72)
})
