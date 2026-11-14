import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creationInput, creationStatus, liveCreation, readPendingCreation } from '../src/creation/model.ts'
import type { CreationTemplate } from '../src/creation/types.ts'

const flatlay: CreationTemplate = { id: 'sunlit-flatlay', version: 3, name: '暖阳平铺', description: '', previewUrl: null, personRequired: false, options: { light: ['DEFAULT', 'WARM'] }, maxGarments: 3, available: true, unavailableReason: null }
const person = { id: 'person', revision: 5 }
test('switching to a flatlay omits stale identity and pose fields and never serializes garment profiles', () => {
  const garments = [{ id: 'g', revision: 2, name: 'private', genderFit: ['private'], note: 'not allowed' }]
  const input = creationInput(flatlay, garments, person, 'WARM', { mode: 'CUSTOM', id: 'pose' }, '')
  assert.deepEqual(input, { templateId: 'sunlit-flatlay', templateVersion: 3, garments: [{ id: 'g', revision: 2 }], options: { light: 'WARM' } })
})
test('person templates require a confirmed selection and freeze its actual revision', () => {
  const template = { ...flatlay, personRequired: true }
  assert.throws(() => creationInput(template, [{ id: 'g', revision: 1 }], undefined, 'DEFAULT', { mode: 'AUTO' }, ''), /形象/)
  const input = creationInput(template, [{ id: 'g', revision: 1 }], person, 'DEFAULT', { mode: 'AUTO' }, '', { id: 'outfit', revision: 7 }, 'prior')
  assert.equal(input.baselineRevision, 5); assert.equal(input.outfitRevision, 7); assert.equal(input.parentJobId, 'prior')
})
test('unavailable effects, oversized selections and long instructions cannot reach preparation', () => {
  assert.throws(() => creationInput({ ...flatlay, available: false, unavailableReason: '效果待验证' }, [], undefined, 'DEFAULT', { mode: 'AUTO' }, ''), /待验证/)
  assert.throws(() => creationInput(flatlay, [], undefined, 'DEFAULT', { mode: 'AUTO' }, ''), /衣物/)
  assert.throws(() => creationInput(flatlay, Array.from({ length: 4 }, (_, i) => ({ id: String(i), revision: 1 })), undefined, 'DEFAULT', { mode: 'AUTO' }, ''), /3 件/)
  assert.throws(() => creationInput(flatlay, [{ id: 'g', revision: 1 }], undefined, 'DEFAULT', { mode: 'AUTO' }, '字'.repeat(201)), /200 字/)
})
test('duplicate clothes use one reference and only published light options reach the service', () => {
  const input = creationInput(flatlay, [{ id: 'g', revision: 1 }, { id: 'g', revision: 2 }], undefined, 'COOL', { mode: 'AUTO' }, '  明亮一点  ')
  assert.deepEqual(input.garments, [{ id: 'g', revision: 2 }]); assert.equal(input.options.light, 'DEFAULT'); assert.equal(input.note, '明亮一点')
})
test('uncertain submission recovery requires the original key and preparation, damaged storage cannot create a task', () => {
  assert.deepEqual(readPendingCreation('{"key":"same-key","preparationId":"same-preparation","provider":"do-not-read"}'), { key: 'same-key', preparationId: 'same-preparation' })
  for (const value of [null, '{', '{}', '{"key":"","preparationId":"p"}', '{"key":123,"preparationId":"p"}']) assert.equal(readPendingCreation(value), null)
})
test('unknown is neither success nor an automatically retryable running task', () => {
  assert.equal(creationStatus({ status: 'UNKNOWN' }), '结果待确认'); assert.equal(liveCreation({ status: 'UNKNOWN' }), false)
  assert.equal(liveCreation({ status: 'QUEUED' }), true); assert.equal(liveCreation({ status: 'SUCCEEDED' }), false)
})
test('a queue paused by the feature switch does not claim generation is running', () => {
  assert.equal(creationStatus({ status: 'QUEUED', waitReason: 'FEATURE_DISABLED' }), '等待功能恢复')
  assert.equal(liveCreation({ status: 'QUEUED', waitReason: 'FEATURE_DISABLED' }), false)
})
