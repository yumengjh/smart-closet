import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STRICTNESS_NOTES, strictnessNote, wornLabel } from '../src/recommend/format.ts'

test('slider notes follow the nearest measured level, with 50 marked as recommended', () => {
  assert.equal(Object.keys(STRICTNESS_NOTES).length, 5)
  assert.match(strictnessNote(50), /^推荐/)
  assert.equal(strictnessNote(55), STRICTNESS_NOTES[50])
  assert.equal(strictnessNote(5), STRICTNESS_NOTES[0])
  assert.equal(strictnessNote(90), STRICTNESS_NOTES[100])
})

test('wear labels count whole local days and stay empty without a record', () => {
  const now = new Date('2026-10-08T15:00:00').getTime()
  assert.equal(wornLabel(null, now), '')
  assert.equal(wornLabel('2026-10-08', now), '今天穿过')
  assert.equal(wornLabel('2026-10-05', now), '上次穿着：3 天前')
})
