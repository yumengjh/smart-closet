import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionRedirect, canUseCloset } from '../src/domain/session.ts'
const initial = { username: 'invited', mustChangePassword: true }
test('all business deep links are blocked before changing the initial password', () => {
  for (const path of ['/wardrobe', '/pending', '/tasks', '/add', '/trash', '/garment/123', '/login', '/register']) assert.equal(sessionRedirect(path, initial), '/settings?firstLogin=1')
  assert.equal(sessionRedirect('/settings', initial), undefined)
  assert.equal(canUseCloset(initial), false)
})
test('authenticated users can use business pages after a successful password change', () => {
  const ready = { ...initial, mustChangePassword: false }
  assert.equal(sessionRedirect('/wardrobe', ready), undefined)
  assert.equal(sessionRedirect('/login', ready), '/wardrobe')
  assert.equal(sessionRedirect('/register', ready), '/wardrobe')
  assert.equal(canUseCloset(ready), true)
})
test('an expired or missing session goes to login and never loads business counts', () => {
  assert.equal(sessionRedirect('/tasks', null), '/login')
  assert.equal(sessionRedirect('/login', null), undefined)
  assert.equal(sessionRedirect('/register', null), undefined)
  assert.equal(canUseCloset(null), false)
})
