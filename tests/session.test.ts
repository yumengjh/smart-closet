import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionRedirect, canUseCloset } from '../src/domain/session.ts'
const initial = { username: 'invited', mustChangePassword: true }
test('all business deep links are blocked before changing the initial password', () => {
  for (const path of ['/wardrobe', '/pending', '/tasks', '/add', '/trash', '/garment/123', '/login', '/register', '/forgot']) assert.equal(sessionRedirect(path, initial), '/settings?firstLogin=1')
  assert.equal(sessionRedirect('/settings', initial), undefined)
  assert.equal(canUseCloset(initial), false)
})
test('authenticated users can use business pages after a successful password change', () => {
  const ready = { ...initial, mustChangePassword: false }
  assert.equal(sessionRedirect('/wardrobe', ready), undefined)
  assert.equal(sessionRedirect('/login', ready), '/today')
  assert.equal(sessionRedirect('/register', ready), '/today')
  assert.equal(sessionRedirect('/forgot', ready), '/today', '已登录不需要找回密码')
  assert.equal(sessionRedirect('/feedback', ready), undefined)
  assert.equal(canUseCloset(ready), true)
})
test('an expired or missing session goes to login and never loads business counts', () => {
  assert.equal(sessionRedirect('/tasks', null), '/login')
  assert.equal(sessionRedirect('/login', null), undefined)
  assert.equal(sessionRedirect('/register', null), undefined)
  assert.equal(sessionRedirect('/forgot', null), undefined, '没登录可以找回密码')
  assert.equal(sessionRedirect('/feedback', null), undefined, '没登录也能打开意见反馈')
  assert.equal(canUseCloset(null), false)
})
