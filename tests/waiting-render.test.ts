import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderEntry } from '../src/domain/waiting.ts'
import type { RenderJob } from '../src/services/platform.ts'

const job = (patch: Partial<RenderJob>): RenderJob => ({ id: 'j1', purpose: 'OOTD', status: 'QUEUED', mediaUrl: null, baselineId: 'b1', planId: null, error: null, feedback: null, createdAt: 1000, parentJobId: null, summary: { kind: 'OOTD', pose: '叉腰站姿' }, ...patch })

test('running picture stays in the processing centre with an expectation of the wait', () => {
  const entry = renderEntry(job({ status: 'RUNNING' }))
  assert.equal(entry.key, 'render:j1')
  assert.equal(entry.state, 'processing')
  assert.equal(entry.title, 'OOTD 穿搭图 · 叉腰站姿')
  assert.match(entry.note, /1 分钟/)
  assert.equal(entry.thumb, undefined)
})

test('finished OOTD links straight to the picture and carries a thumbnail', () => {
  const entry = renderEntry(job({ status: 'SUCCEEDED', mediaUrl: '/api/media/x' }))
  assert.equal(entry.state, 'ready')
  assert.equal(entry.href, '/ootd?job=j1')
  assert.equal(entry.thumb, '/api/media/x')
})

test('model and body adjustment pictures have their own titles and destinations', () => {
  assert.equal(renderEntry(job({ purpose: 'BASELINE', summary: null, status: 'SUCCEEDED' })).href, '/settings?section=personal')
  assert.equal(renderEntry(job({ summary: { kind: 'ADJUST' } })).title, '身材调整图')
})

test('unknown and failed results ask for a check; cancelled ones do not', () => {
  assert.equal(renderEntry(job({ status: 'UNKNOWN' })).state, 'attention')
  assert.equal(renderEntry(job({ status: 'FAILED', error: '额度不足' })).note, '额度不足')
  assert.equal(renderEntry(job({ status: 'CANCELLED' })).state, 'cancelled')
})
