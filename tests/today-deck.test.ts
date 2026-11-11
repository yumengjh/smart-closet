import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendUnique, collageSlots, coverTint, issueNo, masthead, outfitKey, stampOpacity, swipeOutcome, TODAY_OCCASIONS } from '../src/today/deck.ts'

const url = (p: string) => `/media/${p}`

test('today: masthead shows month.day and weekday; issue numbers are two digits', () => {
  assert.deepEqual(masthead(new Date(2026, 10, 11)), { day: '11.11', week: '周三' })
  assert.deepEqual(masthead(new Date(2026, 0, 4)), { day: '01.04', week: '周日' })
  assert.equal(issueNo(3), 'NO.03')
})

test('today: occasions map to existing enum values only', () => {
  const known = new Set(['DAILY', 'COMMUTE', 'DATE', 'SPORT', 'OUTDOOR', 'FORMAL', 'TRAVEL', 'HOME'])
  assert.ok(TODAY_OCCASIONS.every(o => known.has(o.value)))
  assert.equal(TODAY_OCCASIONS[0].value, 'DAILY')
})

test('today: collage places one piece per group, outer behind, skips pieces without images', () => {
  const slots = collageSlots([
    { id: 't', role: 'TOP', displayUrl: 'a.png' }, { id: 'o', role: 'OUTER', displayUrl: 'b.png' }, { id: 'b', role: 'BOTTOM', displayUrl: 'c.png' },
    { id: 's', role: 'SHOES', displayUrl: 'd.png' }, { id: 'i', role: 'INNER', displayUrl: 'e.png' }, { id: 'h', role: 'HAT', displayUrl: null },
  ], url)
  assert.deepEqual(slots.map(s => s.id), ['o', 't', 'b', 's'])
  assert.equal(slots[0]!.url, '/media/b.png')
})

test('today: with a dress the outer moves aside', () => {
  const slots = collageSlots([{ id: 'd', role: 'ONE_PIECE', displayUrl: 'a' }, { id: 'o', role: 'OUTER', displayUrl: 'b' }], url)
  assert.deepEqual(slots.find(s => s.id === 'o')!.left, 50)
})

test('today: tint follows the first main garment colour family, neutral when unknown', () => {
  assert.equal(coverTint([{ id: '1', role: 'SHOES', color: '黑色' }, { id: '2', role: 'TOP', color: '酒红' }]), '#B8404A')
  assert.equal(coverTint([{ id: '1', role: 'TOP', color: '' }]), '#DCCBAA')
})

test('today: refills skip outfits already seen', () => {
  const o = (...ids: string[]) => ({ garments: ids.map(id => ({ id })) })
  const seen = new Set([outfitKey(['a', 'b'])])
  const next = appendUnique([o('a', 'b')], seen, [o('b', 'a'), o('c', 'd'), o('d', 'c')])
  assert.equal(next.length, 2)
  assert.ok(seen.has('c,d'))
})

test('today: swipe needs distance or a quick flick in the same direction', () => {
  assert.equal(swipeOutcome(120, 0), 1)
  assert.equal(swipeOutcome(-95, 0), -1)
  assert.equal(swipeOutcome(40, 0.9), 1)
  assert.equal(swipeOutcome(40, -0.9), 0)
  assert.equal(swipeOutcome(20, 2), 0)
  assert.equal(stampOpacity(45, 1), 0.5)
  assert.equal(stampOpacity(45, -1), 0)
})

test('today: the worn card only comes back on the same day and for the same account', async () => {
  const { readWorn, saveWorn } = await import('../src/today/worn.ts')
  const map = new Map<string, string>(); const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) } }
  const day = new Date(2026, 10, 11, 9)
  saveWorn('amy', { date: day.toDateString(), name: '周末', garments: [{ id: 'g', role: 'TOP', color: '白', displayUrl: 'a', name: 'T' }] }, store)
  assert.equal(readWorn('amy', new Date(2026, 10, 11, 22), store)?.name, '周末')
  assert.equal(readWorn('amy', new Date(2026, 10, 12, 8), store), null)
  assert.equal(readWorn('bob', day, store), null)
})
