import test from 'node:test'
import assert from 'node:assert/strict'
import { costPerWear, minorToYuan, normalizeTags, yuanToMinor } from '../src/domain/marks.ts'

test('标签去空白、去重、保留顺序，过长与超量的丢掉', () => {
  assert.deepEqual(normalizeTags([' 面试 ', '出差', '面试', '', '一二三四五六七八九', 'a b']), ['面试', '出差', 'ab'])
  assert.deepEqual(normalizeTags(['1', '2', '3', '4', '5', '6', '7']), ['1', '2', '3', '4', '5', '6'])
})

test('每次约多少钱：没价格或没穿过不算，不足 1 元单独写', () => {
  assert.equal(costPerWear(null, 3), null)
  assert.equal(costPerWear(80000, 0), null)
  assert.equal(costPerWear(80000, 3), '¥267')
  assert.equal(costPerWear(50, 2), '不到 ¥1')
})

test('元与分互转', () => {
  assert.equal(yuanToMinor(199.9), 19990)
  assert.equal(yuanToMinor(null), null)
  assert.equal(minorToYuan(19990), 199.9)
  assert.equal(minorToYuan(null), null)
})
