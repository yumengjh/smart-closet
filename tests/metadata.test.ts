import test from 'node:test'
import assert from 'node:assert/strict'
import { metadataChoices, matchesMetadataOption, metadataPatch, rebaseMetadata } from '../src/domain/metadata.ts'
const fields = ['secondaryColors', 'materialComposition', 'careInstructions', 'brand'].map(key => ({ key, label: key, options: [], multiple: key === 'secondaryColors', suggestion: false }))
test('metadata uses canonical server keys and preserves punctuation in single text values', () => {
  assert.deepEqual(metadataPatch(fields, { secondaryColors: ['蓝色', '白色'], materialComposition: ['棉 80%，涤纶 20%'], careInstructions: ['冷水手洗,不可漂白'] }, {}, []), { secondaryColors: ['蓝色', '白色'], materialComposition: ['棉 80%，涤纶 20%'], careInstructions: ['冷水手洗,不可漂白'] })
})
test('clearing creates an explicit empty override while reset fields are excluded', () => {
  assert.deepEqual(metadataPatch(fields, { brand: [], secondaryColors: ['白色'] }, { brand: ['示例品牌'], secondaryColors: ['蓝色'] }, ['secondaryColors']), { brand: [] })
})
test('new single and multi values survive editing without membership restrictions', () => {
  const openFields = [
    { key: 'primaryColor', label: '主色', options: ['蓝色'], multiple: false, suggestion: false },
    { key: 'neckline', label: '领型', options: ['圆领'], multiple: false, suggestion: false },
    { key: 'patterns', label: '图案', options: ['条纹'], multiple: true, suggestion: false },
  ]
  assert.deepEqual(metadataPatch(openFields, { primaryColor: ['浅蓝色'], neckline: ['小圆领'], patterns: ['细条纹', ' 刺绣 ', '刺绣'] }, {}, []),
    { primaryColor: ['浅蓝色'], neckline: ['小圆领'], patterns: ['细条纹', '刺绣'] })
  assert.deepEqual(metadataChoices(openFields[0]!, ['浅蓝色', '蓝色']), [{ value: '蓝色', label: '蓝色' }, { value: '浅蓝色', label: '浅蓝色' }])
  assert.equal(matchesMetadataOption('蓝', { value: '浅蓝色' }), true)
  assert.equal(matchesMetadataOption('新颜色', { value: '蓝色' }), false)
})
test('conflict reconciliation keeps edited values and adopts concurrent changes in untouched fields', () => {
  const original = { brand: [], secondaryColors: ['蓝色'] }
  const current = { brand: ['另一端修改的品牌'], secondaryColors: ['黑色'] }
  const form = { brand: [], secondaryColors: ['白色'] }
  const rebased = rebaseMetadata(fields, form, original, current)
  assert.deepEqual(rebased.brand, ['另一端修改的品牌'])
  assert.deepEqual(metadataPatch(fields, rebased, current, []), { secondaryColors: ['白色'] })
})
