import test from 'node:test'
import assert from 'node:assert/strict'
import { passwordBytes, passwordProblem } from '../src/domain/account.ts'

test('password limit counts UTF-8 bytes like the server and BCrypt', () => {
  assert.equal(passwordProblem('a'.repeat(72)), '')
  assert.match(passwordProblem('a'.repeat(73)), /72 字节/)
  assert.equal(passwordProblem('密'.repeat(24)), '')
  assert.match(passwordProblem('密'.repeat(25)), /72 字节/)
  assert.equal(passwordBytes('🐟'), 4)
  assert.equal(passwordProblem('🐟'.repeat(18)), '')
  assert.match(passwordProblem('🐟'.repeat(11)), /12 个字符/)
  assert.match(passwordProblem('short'), /12 个字符/)
})
