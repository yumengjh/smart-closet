import test from 'node:test'
import assert from 'node:assert/strict'
import { AgentStreamError, failureAdvice, isStopped } from '../src/agent/failure.ts'

test('every failure class gets advice the user can act on, and only too-long conversations offer a new one', () => {
  assert.equal(failureAdvice('NEW_SESSION').newSession, true)
  assert.match(failureAdvice('NEW_SESSION').hint, /新开一个对话/)
  assert.match(failureAdvice('LATER').hint, /稍后/)
  assert.match(failureAdvice('RETRY').hint, /换种说法/)
  for (const retry of ['LATER', 'RETRY', 'NONE', undefined]) assert.equal(failureAdvice(retry).newSession, false)
  assert.equal(failureAdvice('NONE').hint, '')
})
test('aborting the request is recognised as a stop, not as a failure', () => {
  const abort = new AbortController(); abort.abort()
  assert.equal(isStopped(abort.signal.reason), true)
  assert.equal(isStopped(new DOMException('x', 'AbortError')), true)
  assert.equal(isStopped(new Error('网络错误')), false)
  assert.equal(isStopped(new AgentStreamError('回复已中断', 'RETRY')), false)
})
