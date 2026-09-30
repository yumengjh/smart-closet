import test from 'node:test'
import assert from 'node:assert/strict'
import { workflowSummary, generatedImages, blocksConfirmation, isProcessing, processingSeconds } from '../src/domain/workflow.ts'
import type { ClosetTask } from '../src/services/api'
const draft = { status: 'DRAFT' as const, taskStatus: 'SUCCEEDED' as const }
test('processing completion never means garment confirmed', () => assert.match(workflowSummary(draft).title, /尚未入柜/))
test('cancelling remains an active processing state', () => assert.equal(isProcessing('CANCEL_REQUESTED'), true))
test('only recognition explicitly retains original photograph', () => assert.match(workflowSummary(draft, { mode: '仅识别' } as ClosetTask).description, /保留原图/))
test('original and masks never appear as generated results', () => {
  const task = { inputUrl: '/original', assets: [{ id: '1', kind: 'INPUT', url: '/original' }, { id: '2', kind: 'MASK', url: '/mask' }, { id: '3', kind: 'STICKER', url: '/sticker' }] } as ClosetTask
  assert.deepEqual(generatedImages(task).map(item => item.id), ['3'])
})
test('problem photographs block confirming even after processing ends', () => {
  for (const assessment of ['MULTIPLE_GARMENTS', 'NO_GARMENT', 'UNUSABLE']) {
    assert.equal(blocksConfirmation(assessment), true)
    assert.match(workflowSummary({ ...draft, assessment }).title, /重新上传/)
  }
})
test('AI failure allows reviewing original instead of implying generation completed', () => assert.match(workflowSummary({ ...draft, taskStatus: 'FAILED' }).title, /失败.*原图/))
test('adopting a result later never inflates the processing duration', () => {
  const task = { status: 'NEEDS_REVIEW', createdAt: '2026-09-30T10:00:00Z', updatedAt: '2026-09-30T10:30:00Z', steps: [{ finishedAt: '2026-09-30T10:01:09Z' }] } as ClosetTask
  assert.equal(processingSeconds(task), 69)
})

test('unfinished sticker remains actionable even for an already confirmed garment', () => {
  const imageProcessing = { jobId: 'image-job', status: 'NEEDS_REVIEW', stickerRequired: true, stickerReady: false, stickerAssetId: null }
  assert.match(workflowSummary({ ...draft, imageProcessing }).title, /贴纸尚未完成/)
  assert.match(workflowSummary({ ...draft, status: 'ACTIVE', imageProcessing }).title, /已入柜，贴纸尚未完成/)
  assert.match(workflowSummary({ ...draft, imageProcessing: { ...imageProcessing, stickerReady: true } }).title, /核对结果/)
})
