import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bulkEntry } from '../src/domain/waiting.ts'

const batch = (over: Record<string, unknown> = {}) => ({ id: 'b1', total: 133, submitted: 0, failed: 0, completed: 0, succeeded: 0, finished: false, createdAtMs: 1000, failures: [], jobIds: [], ...over })

test('a batch is one entry with a progress bar, not one per garment', () => {
  const entry = bulkEntry(batch({ submitted: 108, completed: 14, succeeded: 14, jobIds: ['j1', 'j2'] }))
  assert.equal(entry.kind, 'bulk')
  assert.equal(entry.state, 'processing')
  assert.match(entry.stage, /正在提交 108 \/ 133/)
  assert.match(entry.stage, /已完成 14/)
  assert.deepEqual(entry.childIds, ['j1', 'j2'])
  assert.ok(entry.progress! > 0.1 && entry.progress! < 0.11)
})

test('after submission it follows the tasks until they all finish', () => {
  const entry = bulkEntry(batch({ submitted: 133, finished: true, completed: 100, succeeded: 100 }))
  assert.equal(entry.state, 'processing')
  assert.match(entry.stage, /已提交 133 件，已完成 100 \/ 133/)
})

test('it finishes ready, or asks for a look when some did not work', () => {
  assert.equal(bulkEntry(batch({ submitted: 133, finished: true, completed: 133, succeeded: 133 })).state, 'ready')
  const failed = bulkEntry(batch({ submitted: 130, failed: 3, finished: true, completed: 130, succeeded: 128, failures: [{ garmentId: 'g', message: '图片文件已损坏' }] }))
  assert.equal(failed.state, 'attention')
  assert.match(failed.stage, /5 件未成功/)
  assert.match(failed.note, /损坏/)
})
