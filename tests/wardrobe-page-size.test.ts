import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PAGE_SIZE, pageAfterSizeChange, readPageSize, savePageSize } from '../src/wardrobe/pageSize.ts'

function memory() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }

test('page size is remembered and only known sizes are accepted', () => {
  const s = memory()
  assert.equal(readPageSize(s), DEFAULT_PAGE_SIZE)
  savePageSize(36, s); assert.equal(readPageSize(s), 36)
  savePageSize(500, s); assert.equal(readPageSize(s), 36, 'An unsupported size is not stored')
  s.setItem('yixu.wardrobe-page-size.v1', 'abc'); assert.equal(readPageSize(s), DEFAULT_PAGE_SIZE)
})

test('blocked storage never throws', () => {
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readPageSize(blocked), DEFAULT_PAGE_SIZE)
  assert.doesNotThrow(() => savePageSize(12, blocked))
})

test('changing the page size keeps the first visible garment on screen', () => {
  assert.equal(pageAfterSizeChange(3, 24, 12), 5, 'Garments 49–72 start at garment 49 = page 5 of 12')
  assert.equal(pageAfterSizeChange(5, 12, 48), 2)
  assert.equal(pageAfterSizeChange(1, 24, 48), 1)
})
