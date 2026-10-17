import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readView, saveView, VIEW_TTL_MS } from '../src/wardrobe/viewMemory.ts'

function memory() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m } }

test('remembers filters, page and scroll position for the tab', () => {
  const s = memory()
  saveView({ q: '白衬衫', category: '衬衫', color: '', season: '夏', imageStyle: '', page: 3, scrollY: 1240 }, s, 1000)
  assert.deepEqual(readView(s, 2000), { q: '白衬衫', category: '衬衫', color: '', season: '夏', imageStyle: '', page: 3, scrollY: 1240, ids: [], savedAt: 1000 })
})

test('stale, future or broken entries are ignored', () => {
  const s = memory()
  saveView({ q: '', category: '', color: '', season: '', imageStyle: '', page: 2, scrollY: 10 }, s, 1000)
  assert.equal(readView(s, 1000 + VIEW_TTL_MS + 1), null)
  assert.equal(readView(s, 500), null)
  s.setItem('yixu.wardrobe-view.v1', '{not json')
  assert.equal(readView(s, 1000), null)
})

test('values are sanitised', () => {
  const s = memory()
  s.setItem('yixu.wardrobe-view.v1', JSON.stringify({ q: 5, page: -3, scrollY: 'x', savedAt: 1000 }))
  assert.deepEqual(readView(s, 1000), { q: '', category: '', color: '', season: '', imageStyle: '', page: 1, scrollY: 0, ids: [], savedAt: 1000 })
})

test('blocked storage never throws', () => {
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.doesNotThrow(() => saveView({ q: '', category: '', color: '', season: '', imageStyle: '', page: 1, scrollY: 0 }, blocked))
  assert.equal(readView(blocked), null)
})

test('remembers the garment order of the page for previous / next', () => {
  const s = memory()
  saveView({ q: '', category: '', color: '', season: '', imageStyle: '', page: 2, scrollY: 0, ids: ['a', 'b', 'c'] }, s, 1000)
  assert.deepEqual(readView(s, 1000)?.ids, ['a', 'b', 'c'])
  s.setItem('yixu.wardrobe-view.v1', JSON.stringify({ ids: ['x', 5, null, 'y'], savedAt: 1000 }))
  assert.deepEqual(readView(s, 1000)?.ids, ['x', 'y'], 'Non-text ids are dropped')
})
