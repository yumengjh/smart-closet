import { test } from 'node:test'
import assert from 'node:assert/strict'
import { albumTiles, mergeWorks, workBucket } from '../src/try/album.ts'
import { albumJobHref, legacyCreation, legacyOotd, legacyWorks } from '../src/try/routes.ts'
import { OUTFIT_EFFECT_ID } from '../src/creation/steps.ts'
import type { CreationJob } from '../src/creation/types.ts'
import type { RenderJob } from '../src/services/platform.ts'

const ootd = (id: string, createdAt: number): RenderJob => ({ id, purpose: 'OOTD', status: 'SUCCEEDED', mediaUrl: `/m/${id}`, baselineId: 'b', planId: null, error: null, feedback: null, createdAt, parentJobId: null, summary: null })
const work = (id: string, createdAtMs: number, patch: Partial<CreationJob> = {}): CreationJob => ({ id, status: 'SUCCEEDED', templateId: 'flat', templateVersion: 1, templateName: '平铺', createdAtMs, updatedAtMs: createdAtMs, mediaUrl: `/w/${id}`, quotaUnits: 1, parentJobId: null, canCancel: false, canExport: true, canRecreate: true, ...patch })

test('pictures and works interleave by time and filter by source', () => {
  const tiles = albumTiles([ootd('a', 300), ootd('b', 100)], [work('x', 200), work('y', 400)], 'all')
  assert.deepEqual(tiles.map(t => `${t.kind}:${t.id}`), ['work:y', 'ootd:a', 'work:x', 'ootd:b'])
  assert.deepEqual(albumTiles([ootd('a', 300)], [work('x', 200)], 'ootd').map(t => t.id), ['a'])
  assert.deepEqual(albumTiles([ootd('a', 300)], [work('x', 200)], 'work').map(t => t.id), ['x'])
  // 两种来源的编号互不冲突，同一来源的重复只留一份。
  assert.equal(albumTiles([ootd('same', 1)], [work('same', 2), work('same', 2)], 'all').length, 2)
})
test('works land in done, running or failed; deleted ones are hidden', () => {
  assert.equal(workBucket(work('a', 1)), 'done')
  assert.equal(workBucket(work('a', 1, { status: 'RUNNING', mediaUrl: null })), 'running')
  assert.equal(workBucket(work('a', 1, { status: 'QUEUED', waitReason: 'FEATURE_DISABLED', mediaUrl: null })), 'running')
  assert.equal(workBucket(work('a', 1, { status: 'FAILED', mediaUrl: null })), 'failed')
  assert.equal(workBucket(work('a', 1, { status: 'UNKNOWN', mediaUrl: null })), 'failed')
  assert.equal(workBucket(work('a', 1, { status: 'CANCELLED', mediaUrl: null })), 'failed')
  assert.equal(workBucket(work('a', 1, { status: 'DELETED', mediaUrl: null })), 'hidden')
})
test('first page and older pages merge without duplicates, first copy wins', () => {
  const fresh = work('a', 5, { templateName: '新' })
  assert.deepEqual(mergeWorks([fresh, work('b', 4)], [work('a', 5, { templateName: '旧' }), work('c', 1)]).map(j => [j.id, j.templateName]), [['a', '新'], ['b', '平铺'], ['c', '平铺']])
})
test('old addresses land on the merged pages', () => {
  assert.deepEqual(legacyCreation({ outfit: 'o', template: 'flat', again: 'j' }), { path: '/try', query: { outfit: 'o', template: 'flat', again: 'j' } })
  assert.deepEqual(legacyWorks({}), { path: '/try/album', query: {} })
  assert.deepEqual(legacyOotd({ outfit: 'o' }), { path: '/try', query: { outfit: 'o', template: OUTFIT_EFFECT_ID } })
  assert.deepEqual(legacyOotd({}), { path: '/try', query: { template: OUTFIT_EFFECT_ID } })
  assert.deepEqual(legacyOotd({ job: 'j1', outfit: 'o' }), { path: '/try/album', query: { job: 'j1' } })
  assert.equal(albumJobHref('j 1'), '/try/album?job=j%201')
})
