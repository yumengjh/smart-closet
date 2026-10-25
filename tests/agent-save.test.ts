import test from 'node:test'
import assert from 'node:assert/strict'
import { savePresentation, assertSaveTarget } from '../src/agent/save.ts'

test('overwrite names the saved target in both title and explanation', () => {
  const card = savePresentation({ saveMode: 'OVERWRITE', targetName: '蓝灰格纹 × 浅灰长裤' })
  assert.equal(card.title, '覆盖原搭配「蓝灰格纹 × 浅灰长裤」')
  assert.ok(card.summary.includes(card.title))
  assert.equal(card.button, '确认覆盖')
})
test('new outfit is clearly distinguished and legacy cards still work', () => {
  assert.equal(savePresentation({ saveMode: 'NEW' }).title, '另存为新搭配')
  assert.equal(savePresentation({}).button, '确认保存')
})
test('overwrite is bound to the original target and revision before sending a write', () => {
  const choice = { saveMode: 'OVERWRITE' as const, targetOutfitId: 'a', targetRevision: 2 }
  assert.doesNotThrow(() => assertSaveTarget(choice, { sourceOutfitId: 'a', sourceRevision: 2 }))
  assert.doesNotThrow(() => assertSaveTarget(choice, { outfitId: 'a', revision: 2 }))
  assert.throws(() => assertSaveTarget(choice, { sourceOutfitId: 'b', sourceRevision: 2 }))
  assert.throws(() => assertSaveTarget(choice, { sourceOutfitId: 'a', sourceRevision: 3 }))
})
