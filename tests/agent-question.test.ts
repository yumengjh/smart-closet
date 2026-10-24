import test from 'node:test'
import assert from 'node:assert/strict'
import { answerText } from '../src/agent/question.ts'

const options = [{ label: '裙装' }, { label: '裤装', description: '更方便走路' }, { label: '都可以' }]

test('single choice answers with the picked label', () => {
  assert.equal(answerText(options, [1], '', false), '裤装')
  assert.equal(answerText(options, [2, 0], '', false), '都可以')
})
test('multiple choice joins labels with 、 in the listed order, without duplicates', () => {
  assert.equal(answerText(options, [2, 0], '', true), '裙装、都可以')
  assert.equal(answerText(options, [1, 1, 0], '', true), '裙装、裤装')
})
test('typed text wins over picks and is trimmed', () => {
  assert.equal(answerText(options, [0], '  想穿背带裤 ', true), '想穿背带裤')
  assert.equal(answerText(options, [], '随便', false), '随便')
})
test('nothing usable gives an empty answer', () => {
  assert.equal(answerText(options, [], '   ', true), '')
  assert.equal(answerText(options, [5, -1, 1.5], '', false), '')
  assert.equal(answerText([{ label: '  ' }, { label: '好' }], [0, 1], '', true), '好')
})
