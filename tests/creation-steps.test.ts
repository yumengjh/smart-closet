import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateBlock, liveCount, newlyDone, nextStep, readDraft, serializeDraft, startStep, stepBlock, stepsFor, workState } from '../src/creation/steps.ts'
import type { CreationTemplate } from '../src/creation/types.ts'

const flat: CreationTemplate = { id: 'flat', version: 1, name: '平铺', description: '', previewUrl: null, personRequired: false, options: {}, maxGarments: 3, available: true, unavailableReason: null }
const worn: CreationTemplate = { ...flat, id: 'worn', personRequired: true, maxGarments: 20 }

test('only person effects have a third step', () => {
  assert.deepEqual(stepsFor(flat), ['effect', 'garments']); assert.deepEqual(stepsFor(worn), ['effect', 'garments', 'person'])
  assert.deepEqual(stepsFor(undefined), ['effect', 'garments']); assert.equal(nextStep(stepsFor(flat), 'garments'), undefined)
})
test('each step names why it cannot continue, unavailable effects included', () => {
  assert.match(stepBlock('effect', { template: undefined, garmentCount: 0, hasPerson: false }), /效果/)
  assert.equal(stepBlock('effect', { template: { ...flat, available: false, unavailableReason: '待验证' }, garmentCount: 0, hasPerson: false }), '待验证')
  assert.match(stepBlock('garments', { template: flat, garmentCount: 0, hasPerson: false }), /衣服/)
  assert.match(stepBlock('garments', { template: flat, garmentCount: 4, hasPerson: false }), /3 件/)
  assert.match(stepBlock('garments', { template: worn, garmentCount: 13, hasPerson: true }), /12 件/)
  assert.match(stepBlock('person', { template: worn, garmentCount: 1, hasPerson: false }), /形象/)
})
test('generate needs every step; a flat effect never asks for a person', () => {
  assert.equal(generateBlock({ template: flat, garmentCount: 2, hasPerson: false }), '')
  assert.match(generateBlock({ template: worn, garmentCount: 2, hasPerson: false }), /形象/)
})
test('a restored draft lands on the first incomplete step', () => {
  assert.equal(startStep({ template: undefined, garmentCount: 2, hasPerson: false }), 'effect')
  assert.equal(startStep({ template: flat, garmentCount: 0, hasPerson: false }), 'garments')
  assert.equal(startStep({ template: worn, garmentCount: 2, hasPerson: false }), 'person')
  assert.equal(startStep({ template: flat, garmentCount: 2, hasPerson: false }), 'garments')
})
test('draft round-trips and damaged fields fall back to defaults', () => {
  const draft = { ids: ['a', 'b'], templateId: 'flat', baselineId: 'p', light: 'WARM' as const, pose: { mode: 'PRESET' as const, id: 'x' }, note: '亮一点', outfitId: 'o' }
  assert.deepEqual(readDraft(serializeDraft(draft)), draft)
  for (const bad of [null, '{', '[]', '"x"']) assert.deepEqual(readDraft(bad).ids, [])
  const odd = readDraft('{"ids":["a","a",3,""],"light":"RED","pose":{"mode":"CUSTOM"},"note":' + JSON.stringify('字'.repeat(300)) + '}')
  assert.deepEqual(odd.ids, ['a']); assert.equal(odd.light, 'DEFAULT'); assert.deepEqual(odd.pose, { mode: 'AUTO' }); assert.equal(odd.note.length, 200)
})
test('work state wording', () => {
  assert.equal(workState({ status: 'RUNNING', canRecreate: false }).label, '创作中')
  assert.equal(workState({ status: 'QUEUED', canRecreate: false }).label, '等待中')
  assert.equal(workState({ status: 'UNKNOWN', canRecreate: false }).tone, 'unsure')
  assert.equal(workState({ status: 'QUEUED', waitReason: 'FEATURE_DISABLED', canRecreate: false }).tone, 'idle')
  const failed = workState({ status: 'FAILED', errorMessage: '图片服务暂时不可用', canRecreate: true })
  assert.equal(failed.tone, 'failed'); assert.equal(failed.detail, '图片服务暂时不可用')
  assert.equal(liveCount([{ status: 'RUNNING' }, { status: 'SUCCEEDED' }, { status: 'QUEUED', waitReason: 'FEATURE_DISABLED' }]), 1)
})
test('celebration fires once, only for jobs seen unfinished', () => {
  const seen = new Map<string, string>(), done = new Set<string>()
  assert.deepEqual(newlyDone(seen, [{ id: 'a', status: 'SUCCEEDED' }, { id: 'b', status: 'RUNNING' }], done), [])
  assert.deepEqual(newlyDone(seen, [{ id: 'a', status: 'SUCCEEDED' }, { id: 'b', status: 'SUCCEEDED' }], done), ['b'])
  assert.deepEqual(newlyDone(seen, [{ id: 'b', status: 'SUCCEEDED' }], done), [])
})
