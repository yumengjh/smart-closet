import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latestRequest } from '../src/recommend/latest.ts'

test('only the most recent ticket stays current, whatever order responses arrive in', () => {
  const runs = latestRequest()
  const first = runs.next(), second = runs.next()
  assert.equal(runs.isLatest(first), false)
  assert.equal(runs.isLatest(second), true)
  const third = runs.next()
  assert.equal(runs.isLatest(second), false)
  assert.equal(runs.isLatest(third), true)
})

test('separate guards count independently', () => {
  const a = latestRequest(), b = latestRequest()
  const ticket = a.next(); b.next(); b.next()
  assert.equal(a.isLatest(ticket), true)
})
