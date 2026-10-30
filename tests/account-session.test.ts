import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AccountSwitchedError, accountEpoch, accountHeaders, accountIsStale, activeAccount, assertAccountCurrent, captureAccount,
  connectAccountTransport, markAccountStale, onAccountChange, resetAccountSession, setActiveAccount, type AccountTransport,
} from '../src/domain/accountSession.ts'

/** Two tabs of one browser: whatever one posts reaches the other's handler. */
function pair() {
  const handlers: Array<((account: string | null) => void) | undefined> = [undefined, undefined]
  const make = (self: number): AccountTransport => ({ post: account => handlers[1 - self]?.(account), listen: handler => { handlers[self] = handler }, close: () => { handlers[self] = undefined } })
  return [make(0), make(1)]
}
test.beforeEach(() => resetAccountSession())

test('a response that outlives an account change is rejected, one for the same account is kept', () => {
  setActiveAccount('alice')
  const request = captureAccount()
  request()
  setActiveAccount(null); setActiveAccount('bob')
  assert.throws(request, AccountSwitchedError)
  const next = captureAccount(); next()
})
test('switching straight from one account to another also invalidates requests in flight', () => {
  setActiveAccount('alice'); const request = captureAccount()
  setActiveAccount('bob')
  assert.throws(request, AccountSwitchedError)
})
test('first sign-in does not invalidate a request that started while signed out', () => {
  const request = captureAccount(); setActiveAccount('alice'); request()
  assert.equal(accountEpoch(), 0)
})
test('writes name the page account; sign-in requests and signed-out pages send nothing', () => {
  assert.deepEqual(accountHeaders('/api/closet/garments'), {})
  setActiveAccount('alice')
  assert.deepEqual(accountHeaders('/api/me/wearer-profile'), { 'X-Closet-Account': 'alice' })
  for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/portable-login']) assert.deepEqual(accountHeaders(path), {})
  assert.deepEqual(accountHeaders('/api/auth/logout'), { 'X-Closet-Account': 'alice' })
})
test('a tab that sees another tab sign in as someone else turns stale and refuses requests', () => {
  const [one, two] = pair()
  setActiveAccount('alice'); connectAccountTransport(one)
  const seen: boolean[] = []; onAccountChange(() => seen.push(accountIsStale()))
  const request = captureAccount()
  two.post('bob')
  assert.equal(accountIsStale(), true); assert.deepEqual(seen, [true])
  assert.throws(assertAccountCurrent, AccountSwitchedError)
  assert.throws(captureAccount, AccountSwitchedError)
  assert.throws(request, AccountSwitchedError)
  assert.equal(activeAccount(), 'alice')
})
test('another tab signing out also stales this page; the same account or a signed-out page does not', () => {
  const [one, two] = pair()
  connectAccountTransport(one)
  two.post('bob'); assert.equal(accountIsStale(), false, 'a page nobody is signed in on has nothing to protect')
  setActiveAccount('alice')
  two.post('alice'); assert.equal(accountIsStale(), false)
  two.post(null); assert.equal(accountIsStale(), true)
})
test('this tab announces its own sign-in and sign-out', () => {
  const [one, two] = pair(); const heard: Array<string | null> = []
  connectAccountTransport(one); two.listen(account => heard.push(account))
  setActiveAccount('alice'); setActiveAccount('alice'); setActiveAccount(null)
  assert.deepEqual(heard, ['alice', null])
})
test('markAccountStale is idempotent and notifies once', () => {
  let calls = 0; onAccountChange(() => calls++)
  markAccountStale(); markAccountStale(); assert.equal(calls, 1)
})
