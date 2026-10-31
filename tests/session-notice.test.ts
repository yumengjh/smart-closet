import test from 'node:test'
import assert from 'node:assert/strict'
import { SESSION_EVICTED_NOTICE, noteSessionLost, signalSessionExpired, takeSessionNotice } from '../src/domain/sessionNotice.ts'

test('an eviction leaves one notice for the login page', () => {
  noteSessionLost('SESSION_EVICTED')
  assert.equal(takeSessionNotice(), SESSION_EVICTED_NOTICE)
  assert.equal(takeSessionNotice(), null, 'shown at most once')
})

test('other 401 reasons leave no notice', () => {
  for (const code of ['AUTHENTICATION_REQUIRED', undefined, null, '']) noteSessionLost(code)
  assert.equal(takeSessionNotice(), null)
})

test('the notice names no other device', () => {
  assert.doesNotMatch(SESSION_EVICTED_NOTICE, /Chrome|Safari|Edge|iPhone|Android|Windows|macOS|·/)
})

test('a protected 401 notes the reason and returns to the login page', () => {
  const events: string[] = []
  const previous = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = { dispatchEvent: (event: Event) => { events.push(event.type); return true } }
  try {
    signalSessionExpired('SESSION_EVICTED')
    assert.deepEqual(events, ['closet-session-expired'])
    assert.equal(takeSessionNotice(), SESSION_EVICTED_NOTICE)
    signalSessionExpired('AUTHENTICATION_REQUIRED')
    assert.deepEqual(events, ['closet-session-expired', 'closet-session-expired'])
    assert.equal(takeSessionNotice(), null)
  } finally { (globalThis as { window?: unknown }).window = previous }
})
