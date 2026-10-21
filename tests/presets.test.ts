import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupPresets, presetGroup, presetName, presetQuery } from '../src/services/presetGroups.ts'

test('presets are grouped by where they are worn', () => {
  const item = (category: string, name = '') => ({ fields: { category: [category] }, name })
  assert.equal(presetGroup(item('风衣')), '外套')
  assert.equal(presetGroup(item('牛仔背带裤')), '连体')
  assert.equal(presetGroup(item('直筒牛仔裤')), '下装')
  assert.equal(presetGroup(item('运动鞋')), '鞋')
  assert.equal(presetGroup(item('棒球帽')), '配饰')
  assert.equal(presetGroup(item('Polo衫')), '上装')
  assert.equal(presetGroup(item('', '不知道是什么')), '其他')
  assert.deepEqual(groupPresets([item('衬衫'), item('长裤'), item('衬衫')]).map(g => [g.group, g.items.length]), [['上装', 2], ['下装', 1]])
})

test('preset filters become query parameters', () => {
  assert.equal(presetQuery({}), '')
  assert.equal(presetQuery({ season: '秋', styles: ['工装风', '户外机能'] }), '?styles=%E5%B7%A5%E8%A3%85%E9%A3%8E&styles=%E6%88%B7%E5%A4%96%E6%9C%BA%E8%83%BD&season=%E7%A7%8B')
})

test('a preset without a name is called by colour and category', () => {
  assert.equal(presetName({ name: null, fields: { primaryColor: ['深蓝色'], category: ['牛仔背带裤'] } }), '深蓝色牛仔背带裤')
  assert.equal(presetName({ name: '我的风衣', fields: {} }), '我的风衣')
})
