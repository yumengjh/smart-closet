import test from 'node:test'
import assert from 'node:assert/strict'
import { CLOTHING_ROLES, badge, boxStyle, itemChips } from '../src/inspiration/labels.ts'

test('位置框换成百分比，不合法的不画', () => {
  assert.deepEqual(boxStyle([0.1, 0.2, 0.6, 0.9]), { left: '10.00%', top: '20.00%', width: '50.00%', height: '70.00%' })
  assert.equal(boxStyle([0.6, 0.2, 0.1, 0.9]), null)
  assert.equal(boxStyle([0, 0, 1.2, 1]), null)
  assert.equal(boxStyle(null), null)
})

test('卡片标签去空去重、穿法用人话、最多三个', () => {
  assert.deepEqual(itemChips({ fit: '宽松', length: '短款', wear: 'OPEN' }), ['宽松', '短款', '敞开穿'])
  assert.deepEqual(itemChips({ fit: '', length: '', wear: 'NA' }), [])
})

test('鞋算衣服，包和腰带算配饰；编号徽章', () => {
  assert.ok(CLOTHING_ROLES.has('SHOES'))
  assert.ok(!CLOTHING_ROLES.has('BAG') && !CLOTHING_ROLES.has('BELT'))
  assert.equal(badge(1), '①')
  assert.equal(badge(21), '21')
})

test('拖动缩放后的框夹在图内、保持最小边长、可反向拖', async () => {
  const { clampBox } = await import('../src/inspiration/labels.ts')
  assert.deepEqual(clampBox(-0.2, 0.1, 0.5, 1.3), [0, 0.1, 0.5, 1])
  assert.deepEqual(clampBox(0.6, 0.6, 0.2, 0.2), [0.2, 0.2, 0.6, 0.6])
  assert.deepEqual(clampBox(0.5, 0.5, 0.51, 0.505), [0.5, 0.5, 0.54, 0.54])
})
