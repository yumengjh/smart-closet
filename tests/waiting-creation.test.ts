import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creationEntry, isPictureEntry } from '../src/domain/waiting.ts'
import type { CreationJob } from '../src/creation/types.ts'

const job = (patch: Partial<CreationJob>): CreationJob => ({ id: 'w1', status: 'QUEUED', templateId: 'sunlit-flatlay', templateVersion: 1, templateName: '暖阳平铺', createdAtMs: 1000, updatedAtMs: 1000, mediaUrl: null, quotaUnits: 1, parentJobId: null, canCancel: true, canExport: false, canRecreate: false, ...patch })

test('running creation waits in the processing centre beside pictures', () => {
  const entry = creationEntry(job({ status: 'RUNNING' }))
  assert.equal(entry.key, 'creation:w1')
  assert.equal(entry.state, 'processing')
  assert.equal(entry.title, '作品 · 暖阳平铺')
  assert.equal(entry.stage, '正在创作')
  assert.match(entry.note, /1 分钟/)
  assert.equal(entry.startedAt, 1000)
  assert.ok(isPictureEntry(entry))
})

test('finished creation links to that work in 我的图 with a thumbnail', () => {
  const entry = creationEntry(job({ status: 'SUCCEEDED', mediaUrl: '/api/creations/jobs/w1/image' }))
  assert.equal(entry.state, 'ready')
  assert.equal(entry.href, '/try/album?job=w1')
  assert.equal(entry.thumb, '/api/creations/jobs/w1/image')
})

test('paused by a disabled feature is not running, so the centre stops polling it', () => {
  const entry = creationEntry(job({ status: 'QUEUED', waitReason: 'FEATURE_DISABLED' }))
  assert.equal(entry.state, 'attention')
  assert.match(entry.stage, /不会用次数/)
})

test('failure, unknown and cancel each read plainly', () => {
  assert.equal(creationEntry(job({ status: 'FAILED', errorMessage: '图片服务暂时不可用' })).state, 'attention')
  assert.equal(creationEntry(job({ status: 'FAILED', errorMessage: '图片服务暂时不可用' })).note, '图片服务暂时不可用')
  assert.match(creationEntry(job({ status: 'UNKNOWN' })).stage, /不会自动重做/)
  assert.equal(creationEntry(job({ status: 'CANCELLED' })).state, 'cancelled')
  assert.equal(creationEntry(job({ status: 'SUCCEEDED' })).thumb, undefined)
})
