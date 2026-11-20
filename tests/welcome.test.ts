import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coversByStyle, fitsSex, markOnboarded, rankPresets, toggleStyle, STYLE_DIRECTIONS } from '../src/onboarding/welcome.ts'

const p = (id: string, category: string, styles: string[], gender: string | null = null, alreadyImported = false) => ({ id, gender, styles, displayUrl: `${id}.png`, fields: { category: [category] }, alreadyImported })

test('welcome: men never see women-only presets and women never see men-only ones', () => {
  assert.equal(fitsSex({ gender: '女款' }, 'MALE'), false)
  assert.equal(fitsSex({ gender: '男款' }, 'FEMALE'), false)
  assert.equal(fitsSex({ gender: '中性' }, 'MALE'), true)
  assert.equal(fitsSex({ gender: '女款' }, ''), true)
})

test('welcome: chosen styles rank first, nothing is dropped except the other sex, owned items go last', () => {
  const items = [p('a', 'T恤', ['法式']), p('b', 'T恤', []), p('c', 'T恤', ['甜美'], null, true), p('d', 'T恤', ['甜美']), p('w', '裙', ['甜美'], '女款')]
  assert.deepEqual(rankPresets(items, 'MALE', ['甜美']).map(i => i.id), ['d', 'a', 'b', 'c'])
})

test('welcome: at most three styles, tapping again removes one', () => {
  assert.deepEqual(toggleStyle(['甜美', '法式', '日系清新'], '工装风'), ['甜美', '法式', '日系清新'])
  assert.deepEqual(toggleStyle(['甜美', '法式'], '甜美'), ['法式'])
  assert.equal(new Set(STYLE_DIRECTIONS).size, 12)
})

test('welcome: finishing marks both the preset popup and the tour as done', () => {
  const map = new Map<string, string>()
  markOnboarded('amy', { setItem: (k: string, v: string) => { map.set(k, v) } })
  assert.equal(map.get('yuda.preset-onboarding.v1'), 'done')
  assert.equal(map.get('yuda.guide.v1:amy'), 'done')
})

test('welcome: admin style covers are matched by style name, unknown or empty ones are ignored', () => {
  const items = [
    { key: 'sweet', style: '甜美', imageUrl: '/api/onboarding/style-covers/sweet/image?v=2', version: 2 },
    { key: 'sweet', style: '甜美', imageUrl: '/api/other', version: 3 },
    { key: 'x', style: '不存在的风格', imageUrl: '/api/x' },
    { key: 'french', style: '法式', imageUrl: '' },
  ]
  assert.deepEqual(coversByStyle(items), { 甜美: '/api/onboarding/style-covers/sweet/image?v=2' })
  assert.deepEqual(coversByStyle(undefined), {})
})
