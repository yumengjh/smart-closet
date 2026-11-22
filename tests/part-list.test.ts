import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answerAsk, answered, askValue, barReason, firstTarget, fitStatus, fitView, legacyReview, positionOptions, positionValue, pruneWear, resetAnswer, reviewPassed, setPosition, skipGarment, wearAgain, type FitGarment } from '../src/ootd/part-list.ts'
import type { Part, Review } from '../src/services/platform.ts'

const worn = (garmentId: string, role: string, position = role) => ({ garmentId, revision: 1, label: garmentId, role, referenceAssetId: 'a-' + garmentId, position, layer: 'MAIN' as const })
const item = (garmentId: string, note: string | null = null, position: string | null = null, layer: 'INNER' | 'MAIN' | 'OUTER' = 'MAIN') => ({ garmentId, label: garmentId, layer, position, note })
const base = (extra: Partial<Review>): Review => ({ items: [], slots: [], blockers: [], warnings: [], fingerprint: 'f', ruleVersion: 'composition-v2', parts: [], asks: [], ...extra })
const garments: FitGarment[] = ['shirt', 'pants', 'jacket', 'necklace', 'tee', 'thing'].map(id => ({ id, label: id + ' 名', thumb: '/t/' + id }))
const ok: Part[] = [
  { part: 'UPPER', label: '上身', state: 'OK', items: [item('shirt')] }, { part: 'LOWER', label: '下身', state: 'OK', items: [item('pants')] },
  { part: 'OUTER', label: '外套', state: 'OK', items: [item('jacket', '穿在最外面', null, 'OUTER')] }, { part: 'SHOES', label: '鞋', state: 'NONE', items: [] },
  { part: 'EXTRA', label: '配饰', state: 'OK', items: [item('necklace', '自然佩戴')] },
]
const good = base({ items: [worn('shirt', 'TOP'), worn('pants', 'BOTTOM'), worn('jacket', 'OUTER'), worn('necklace', 'ACCESSORY', 'UNKNOWN')], parts: ok })

test('a passing v2 review becomes rows in body order with notes, shoes and accessories', () => {
  const view = fitView({ ...good, parts: [...ok].reverse() }, garments, ['shirt', 'pants', 'jacket', 'necklace'])
  assert.equal(view.legacy, false)
  assert.deepEqual(view.rows.map(row => row.part), ['UPPER', 'LOWER', 'OUTER', 'SHOES', 'EXTRA'])
  assert.equal(view.rows[2].items[0].note, '穿在最外面'); assert.equal(view.rows[2].items[0].thumb, '/t/jacket')
  assert.deepEqual([view.rows[3].message, view.rows[3].fix, view.rows[3].blocking], ['不穿鞋', 'ADD_SHOES', false])
  assert.equal(view.rows[4].items[0].accessory, true); assert.equal(view.rows[0].items[0].accessory, false)
  assert.deepEqual(view.status, { tone: 'ok', text: '可以了' }); assert.equal(view.first, null)
  assert.equal(reviewPassed(good), true); assert.equal(barReason(good, '先设置谁来穿'), '先设置谁来穿')
})
test('a missing lower body puts the blocker on that row with its fix, and it comes first', () => {
  const review = base({ parts: [{ part: 'UPPER', label: '上身', state: 'OK', items: [item('shirt')] }, { part: 'LOWER', label: '下身', state: 'MISSING', items: [] }, { part: 'SHOES', label: '鞋', state: 'NONE', items: [] }],
    blockers: [{ code: 'STRUCTURE_INVALID', message: '还差下装', action: '去搭配里加一件', fix: 'ADD_BOTTOM' }] })
  const view = fitView(review, garments, ['shirt'])
  const lower = view.rows.find(row => row.part === 'LOWER')!
  assert.deepEqual([lower.message, lower.fix, lower.blocking], ['还差下装', 'ADD_BOTTOM', true])
  assert.equal(view.issues.length, 0); assert.equal(view.first, 'part:LOWER')
  assert.deepEqual(view.status, { tone: 'block', text: '还差下装' }); assert.equal(reviewPassed(review), false)
})
test('nothing to wear: the long blocker lands on the first missing row; REPLACE stays its own row', () => {
  const review = base({ parts: [{ part: 'UPPER', label: '上身', state: 'MISSING', items: [] }, { part: 'LOWER', label: '下身', state: 'MISSING', items: [] }, { part: 'SHOES', label: '鞋', state: 'OK', items: [item('shoes')] }],
    blockers: [{ code: 'GARMENT_UNAVAILABLE', message: '白衬衫已移入回收站', action: '', fix: 'REPLACE' }, { code: 'STRUCTURE_INVALID', message: '还差上衣和下装，或一件连衣裙', action: '', fix: 'ADD_MAIN' }] })
  const view = fitView(review, garments, ['shoes'])
  assert.equal(view.rows[0].message, '还差上衣和下装，或一件连衣裙'); assert.equal(view.rows[0].fix, 'ADD_MAIN')
  assert.equal(view.rows[1].message, '还差下装')
  assert.deepEqual(view.issues, [{ key: 'issue:0', message: '白衬衫已移入回收站', fix: 'REPLACE' }])
  assert.equal(view.first, 'issue:0'); assert.equal(barReason(review, '先设置谁来穿'), '白衬衫已移入回收站')
})
test('a blocker naming a garment sits on that garment; unknown or missing ids stay on top', () => {
  const review = base({ parts: ok, items: good.items, blockers: [
    { code: 'REFERENCE_MISSING', message: '牛仔夹克没有可用的图片', action: '', fix: 'REPLACE', garmentId: 'jacket' },
    { code: 'ACCESSORY_POSITION_CONFLICT', message: '项链戴不到手腕上', action: '', fix: null, garmentId: 'necklace' },
    { code: 'GARMENT_INACTIVE', message: '有一件已移入回收站', action: '', fix: 'REPLACE', garmentId: 'gone' },
    { code: 'REVISION_CHANGED', message: '这套刚改过，再看一下', action: '', garmentId: null },
  ] })
  const view = fitView(review, garments, ['shirt', 'pants', 'jacket', 'necklace'])
  const jacket = view.rows.find(row => row.part === 'OUTER')!.items[0], necklace = view.rows.find(row => row.part === 'EXTRA')!.items[0]
  assert.deepEqual(jacket.issues, [{ key: 'item:jacket', message: '牛仔夹克没有可用的图片', fix: 'REPLACE' }])
  assert.deepEqual(necklace.issues, [{ key: 'item:necklace', message: '项链戴不到手腕上', fix: null }])
  assert.deepEqual(view.issues.map(issue => [issue.message, issue.fix]), [['有一件已移入回收站', 'REPLACE'], ['这套刚改过，再看一下', null]])
  assert.equal(view.first, 'item:jacket'); assert.equal(view.rows[0].items[0].issues.length, 0)
  // 那件这次不穿时，拦截回到清单顶部。
  assert.deepEqual(fitView(review, garments, ['shirt', 'pants', 'necklace']).issues[0], { key: 'issue:0', message: '牛仔夹克没有可用的图片', fix: 'REPLACE' })
})
test('bar reason: first blocker, then how many to choose, then the page reason', () => {
  const asks = [{ code: 'CHOOSE_INNER' as const, garmentIds: ['shirt', 'tee'], message: '两件上衣，哪件穿里面？' }, { code: 'CHOOSE_PART' as const, garmentIds: ['thing'], message: '这件穿在哪？' }]
  assert.equal(barReason(base({ asks: asks.slice(0, 1) }), 'x'), '有一件要你选')
  assert.equal(barReason(base({ asks }), 'x'), '有 2 件要你选')
  assert.equal(barReason(base({ asks, blockers: [{ code: 'STRUCTURE_INVALID', message: '还差下装', action: '' }] }), 'x'), '还差下装')
  assert.equal(barReason(null, '先设置谁来穿'), '先设置谁来穿')
  assert.deepEqual(fitStatus(base({ asks })), { tone: 'ask', text: '有 2 件要你选' })
  assert.deepEqual(fitStatus(null, { error: 'offline' }), { tone: 'idle', text: '暂时没查到' }); assert.deepEqual(fitStatus(null), { tone: 'idle', text: '' })
})
test('asks list their garments and options; the first target is the first ask when nothing blocks', () => {
  const review = base({ parts: ok, asks: [{ code: 'CHOOSE_ONE', garmentIds: ['jacket', 'tee'], message: '两件外套，这次穿哪件？' }, { code: 'CHOOSE_PART', garmentIds: ['thing'], message: '这件穿在哪？' }] })
  const view = fitView(review, garments, garments.map(g => g.id))
  assert.deepEqual(view.asks[0].options, [{ value: 'jacket', label: 'jacket 名' }, { value: 'tee', label: 'tee 名' }])
  assert.deepEqual(view.asks[1].options.map(o => o.label), ['上身', '下身', '外套', '鞋', '配饰', '拿在手里', '这次不穿'])
  assert.equal(view.first, 'ask:0'); assert.equal(firstTarget(review), 'ask:0')
})
test('skipped clothes leave their rows at once and are listed at the end in outfit order', () => {
  const view = fitView(good, garments.slice(0, 4), ['shirt', 'pants', 'necklace'])
  assert.equal(view.rows.find(row => row.part === 'OUTER')!.items.length, 0)
  assert.deepEqual(view.skipped.map(g => g.id), ['jacket'])
})
test('empty parts fall back to the old style: slots as rows, blockers listed, warnings as notes', () => {
  const v1 = base({ ruleVersion: 'composition-v1', parts: [], asks: [], items: [worn('shirt', 'TOP'), worn('ring', 'ACCESSORY', 'UNKNOWN')],
    slots: [{ role: 'TOP', label: '上身主体', state: 'PRESENT', items: [worn('shirt', 'TOP')] }, { role: 'BOTTOM', label: '下身主体', state: 'MISSING', items: [] }, { role: 'ACCESSORY', label: '首饰 / 配饰', state: 'UNKNOWN', items: [worn('ring', 'ACCESSORY', 'UNKNOWN')] }],
    blockers: [{ code: 'STRUCTURE_INVALID', message: '搭配缺少穿着主体', action: '去补' }], warnings: [{ code: 'NO_SHOES', message: '没有鞋' }] })
  assert.equal(legacyReview(v1), true); assert.equal(legacyReview({ ...v1, parts: undefined }), true); assert.equal(legacyReview(good), false)
  const view = fitView(v1, [], ['shirt', 'ring'])
  assert.equal(view.legacy, true); assert.deepEqual(view.rows.map(r => r.label), ['上身主体', '首饰 / 配饰'])
  assert.equal(view.rows[1].items[0].accessory, true); assert.equal(view.rows[1].items[0].position, null)
  assert.deepEqual(view.issues.map(i => i.message), ['搭配缺少穿着主体']); assert.deepEqual(view.notes, ['没有鞋']); assert.equal(view.first, 'issue:0')
})
test('answering asks rewrites the wear state exactly as 3.1 says', () => {
  const state = { selected: ['shirt', 'tee', 'pants', 'jacket', 'coat', 'thing'], wearRoles: { shirt: 'INNER' } }
  assert.deepEqual(answerAsk(state, { code: 'CHOOSE_INNER', garmentIds: ['shirt', 'tee'] }, 'tee'), { selected: state.selected, wearRoles: { tee: 'INNER' } })
  assert.deepEqual(answerAsk(state, { code: 'CHOOSE_ONE', garmentIds: ['jacket', 'coat'] }, 'coat').selected, ['shirt', 'tee', 'pants', 'coat', 'thing'])
  assert.deepEqual(answerAsk(state, { code: 'CHOOSE_PART', garmentIds: ['thing'] }, 'HANDHELD').wearRoles, { shirt: 'INNER', thing: 'PART:HANDHELD' })
  const skipped = answerAsk({ ...state, wearRoles: { thing: 'PART:TOP' } }, { code: 'CHOOSE_PART', garmentIds: ['thing'] }, 'SKIP')
  assert.deepEqual(skipped, { selected: ['shirt', 'tee', 'pants', 'jacket', 'coat'], wearRoles: {} })
  assert.equal(answerAsk(state, { code: 'CHOOSE_ONE', garmentIds: ['jacket', 'coat'] }, 'nope'), state)
  assert.equal(answerAsk(state, { code: 'CHOOSE_PART', garmentIds: ['thing'] }, 'HAIR'), state)
  assert.equal('multiLayer' in answerAsk(state, { code: 'CHOOSE_INNER', garmentIds: ['shirt', 'tee'] }, 'shirt'), false)
})
test('the answer shows at once and can be changed before the new result arrives', () => {
  const order = ['shirt', 'jacket', 'coat', 'thing']
  const one = { code: 'CHOOSE_ONE' as const, garmentIds: ['jacket', 'coat'] }, part = { code: 'CHOOSE_PART' as const, garmentIds: ['thing'] }
  let state = { selected: order, wearRoles: {} as Record<string, string> }
  assert.equal(askValue(one, state), ''); assert.equal(askValue(part, state), '')
  state = answerAsk(state, one, 'jacket', order); assert.equal(askValue(one, state), 'jacket')
  state = answerAsk(state, one, 'coat', order); assert.deepEqual(state.selected, ['shirt', 'coat', 'thing']); assert.equal(askValue(one, state), 'coat')
  state = answerAsk(state, part, 'SKIP', order); assert.equal(askValue(part, state), 'SKIP')
  state = answerAsk(state, part, 'BOTTOM', order); assert.deepEqual(state.selected, ['shirt', 'coat', 'thing']); assert.equal(askValue(part, state), 'BOTTOM')
  assert.equal(askValue({ code: 'CHOOSE_INNER', garmentIds: ['a', 'b'] }, { selected: ['a', 'b'], wearRoles: { b: 'INNER' } }), 'b')
  assert.deepEqual(wearAgain({ selected: ['a'], wearRoles: {} }, 'new', []).selected, ['a', 'new'])
})
test('skip and wear again keep outfit order; answered roles can be reset; stale roles are pruned', () => {
  const order = ['shirt', 'pants', 'jacket']
  const off = skipGarment({ selected: order, wearRoles: { jacket: 'PART:OUTER', shirt: 'INNER' } }, 'jacket')
  assert.deepEqual(off, { selected: ['shirt', 'pants'], wearRoles: { shirt: 'INNER' } })
  assert.deepEqual(wearAgain({ selected: ['pants'], wearRoles: {} }, 'shirt', order).selected, ['shirt', 'pants'])
  assert.equal(answered({ a: 'INNER', b: 'PART:TOP', c: 'ACCESSORY:EAR' }, 'a') && answered({ b: 'PART:TOP' }, 'b'), true)
  assert.equal(answered({ c: 'ACCESSORY:EAR' }, 'c'), false)
  assert.deepEqual(resetAnswer({ selected: [], wearRoles: { a: 'INNER', b: 'PART:TOP' } }, 'a').wearRoles, { b: 'PART:TOP' })
  assert.deepEqual(pruneWear({ a: 'INNER', gone: 'PART:TOP' }, ['a']), { a: 'INNER' })
})
test('accessory position: natural by default, inferred or chosen positions shown, natural clears the choice', () => {
  assert.equal(positionValue({ garmentId: 'n', position: null }, {}), '')
  assert.equal(positionValue({ garmentId: 'n', position: 'NECK' }, {}), 'ACCESSORY:NECK')
  assert.equal(positionValue({ garmentId: 'n', position: null }, { n: 'ACCESSORY:WRIST' }), 'ACCESSORY:WRIST')
  assert.equal(positionOptions({ position: null })[0].label, '自然佩戴'); assert.equal(positionOptions({ position: 'EAR' }).some(o => o.value === ''), false)
  assert.deepEqual(setPosition({ selected: [], wearRoles: { n: 'ACCESSORY:EAR' } }, 'n', '').wearRoles, {})
  assert.deepEqual(setPosition({ selected: [], wearRoles: {} }, 'n', 'ACCESSORY:HAND_LEFT').wearRoles, { n: 'ACCESSORY:HAND_LEFT' })
})
