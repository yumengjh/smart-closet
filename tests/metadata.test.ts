import test from 'node:test'
import assert from 'node:assert/strict'
import { metadataPatch, rebaseMetadata } from '../src/domain/metadata.ts'
const fields = ['secondaryColors', 'materialComposition', 'careInstructions', 'brand'].map(key => ({ key, label: key, options: [], multiple: key === 'secondaryColors', suggestion: false }))
test('metadata uses canonical server keys and preserves punctuation in single text values', () => {
  assert.deepEqual(metadataPatch(fields, { secondaryColors: ['蓝色', '白色'], materialComposition: ['棉 80%，涤纶 20%'], careInstructions: ['冷水手洗,不可漂白'] }, {}, []), { secondaryColors: ['蓝色', '白色'], materialComposition: ['棉 80%，涤纶 20%'], careInstructions: ['冷水手洗,不可漂白'] })
})
test('clearing creates an explicit empty override while reset fields are excluded', () => {
  assert.deepEqual(metadataPatch(fields, { brand: [], secondaryColors: ['白色'] }, { brand: ['示例品牌'], secondaryColors: ['蓝色'] }, ['secondaryColors']), { brand: [] })
})
test('conflict reconciliation keeps edited values and adopts concurrent changes in untouched fields', () => {
  const original = { brand: [], secondaryColors: ['蓝色'] }
  const current = { brand: ['另一端修改的品牌'], secondaryColors: ['黑色'] }
  const form = { brand: [], secondaryColors: ['白色'] }
  const rebased = rebaseMetadata(fields, form, original, current)
  assert.deepEqual(rebased.brand, ['另一端修改的品牌'])
  assert.deepEqual(metadataPatch(fields, rebased, current, []), { secondaryColors: ['白色'] })
})
