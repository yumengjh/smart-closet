import test from 'node:test'
import assert from 'node:assert/strict'
import { countLinks, feedbackLength, feedbackPage } from '../src/domain/feedback.ts'

test('所在页面只带路由模板，其他一概不带', () => {
  assert.equal(feedbackPage('/garment/:id'), '/garment/:id')
  assert.equal(feedbackPage('/help'), '/help')
  assert.equal(feedbackPage('https://evil.example/x'), undefined)
  assert.equal(feedbackPage('/a?b=1'), undefined)
  assert.equal(feedbackPage(['/help']), undefined)
  assert.equal(feedbackPage('/' + 'a'.repeat(100)), undefined)
})

test('字数按字符算、链接与服务端同一口径', () => {
  assert.equal(feedbackLength('  试穿👗黑屏  '), 5)
  assert.equal(countLinks('看 https://a.example 和 WWW.b.example 还有 http://c'), 3)
  assert.equal(countLinks('没有链接'), 0)
})
