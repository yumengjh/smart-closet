import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromReviewLink, MAX_IDS, readReviewIds, saveReviewIds } from '../src/wardrobe/origin.ts'

function memory() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }

test('a garment opened from the review page carries its way back', () => {
  assert.deepEqual(fromReviewLink('g1'), { path: '/garment/g1', query: { from: 'review' } })
})

test('the order of the review list is remembered for 上一件 / 下一件', () => {
  const s = memory()
  saveReviewIds(['a', 'b', 'c'], s)
  assert.deepEqual(readReviewIds(s), ['a', 'b', 'c'])
})

test('the remembered list is capped and sanitised', () => {
  const s = memory()
  saveReviewIds(Array.from({ length: MAX_IDS + 20 }, (_, i) => `g${i}`), s)
  assert.equal(readReviewIds(s).length, MAX_IDS)
  s.setItem('yixu.review-ids.v1', JSON.stringify(['ok', 5, null, 'x'.repeat(100)]))
  assert.deepEqual(readReviewIds(s), ['ok'])
  s.setItem('yixu.review-ids.v1', '{broken')
  assert.deepEqual(readReviewIds(s), [])
})

test('blocked storage never throws', () => {
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.doesNotThrow(() => saveReviewIds(['a'], blocked))
  assert.deepEqual(readReviewIds(blocked), [])
})
