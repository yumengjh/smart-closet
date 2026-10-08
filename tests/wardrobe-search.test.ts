import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTags, combineQuery, removeWords } from '../src/wardrobe/search.ts'

test('dropdown filters join the typed text once', () => {
  assert.equal(combineQuery('适合海边的', '白色', '', '夏'), '适合海边的 白色 夏')
  assert.equal(combineQuery('白色上衣', '白色'), '白色上衣')
})

test('tags show every understood condition, including the default image style', () => {
  const tags = buildTags({ filters: { primaryColor: ['白色'], role: ['INNER', 'TOP'], seasons: ['夏'] }, freeText: '适合海边' }, { applied: 'PHOTO', dominant: 'PHOTO' })
  assert.deepEqual(tags.map(t => t.label), ['颜色：白色', '位置：上装', '季节：夏', '描述：适合海边', '图片风格：写实实物（衣柜中最多）'])
  assert.equal(buildTags(null, { applied: 'ALL', dominant: 'PHOTO' }).length, 0)
})

test('closing a tag removes only its words', () => {
  const [color, role] = buildTags({ filters: { primaryColor: ['白色'], role: ['TOP'] }, freeText: '适合海边' }, null)
  assert.equal(removeWords('适合海边的白色上衣', color.words), '适合海边 上衣')
  assert.equal(removeWords('适合海边的白色上衣', role.words), '适合海边的白色')
})
