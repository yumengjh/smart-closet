import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colorFamilies, familyFromHex, familyFromName, pileTilt, rackBays } from '../src/wardrobe/rack.ts'

const g = (id: string, category: string, primary = '', imageColor = '') => ({ id, category: [category], primaryColor: primary ? [primary] : [], imageColor })

test('rack: garments hang in fixed bays by role; shoes and extras sit on shelves; empty bays are left out', () => {
  const bays = rackBays([g('1', 'T恤'), g('2', '牛仔裤'), g('3', '风衣'), g('4', '运动鞋'), g('5', '帽子'), g('6', '衬衫'), g('7', '斜挎包')])
  assert.deepEqual(bays.map(bay => [bay.key, bay.items.map(item => item.id)]), [['OUTER', ['3']], ['TOP', ['1', '6']], ['BOTTOM', ['2']], ['SHOES', ['4']], ['EXTRAS', ['5', '7']]])
  assert.deepEqual(bays.filter(bay => bay.shelf).map(bay => bay.key), ['SHOES', 'EXTRAS'])
})

test('rack: tilt is stable per garment and stays within three degrees', () => {
  for (const id of ['a', 'b', 'c9f1', 'f0e2c3d4']) { assert.equal(pileTilt(id), pileTilt(id)); assert.ok(Math.abs(pileTilt(id)) <= 3) }
})

test('colour families: confirmed colour names win over the picture colour', () => {
  assert.equal(familyFromName('藏青色'), '蓝')
  assert.equal(familyFromName('卡其色'), '米')
  assert.equal(familyFromName('酒红色'), '红')
  assert.equal(familyFromName('米白色'), '白')
  assert.equal(familyFromName('未知颜色'), null)
  assert.equal(familyFromHex('#111111'), '黑')
  assert.equal(familyFromHex('#f4f4f2'), '白')
  assert.equal(familyFromHex('#3366cc'), '蓝')
  assert.equal(familyFromHex('nope'), null)
  const shares = colorFamilies([g('1', 'T恤', '白色', '#222222'), g('2', '裤', '', '#3366cc'), g('3', '裙', '白色'), g('4', '帽', '未知颜色')])
  assert.deepEqual(shares.map(share => [share.family, share.count]), [['白', 2], ['蓝', 1]])
})
