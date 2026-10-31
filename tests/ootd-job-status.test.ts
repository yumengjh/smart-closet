import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adviceFor, failureReason, groupRecords, routeTarget } from '../src/ootd/jobStatus.ts'
import type { RenderJob } from '../src/services/platform.ts'

const job = (over: Partial<RenderJob>): RenderJob => ({ id: 'j1', purpose: 'OOTD', status: 'SUCCEEDED', mediaUrl: null, baselineId: null, planId: null, error: null, feedback: null, createdAt: 1, parentJobId: null, summary: null, ...over })

test('an unknown result explains itself and offers a manual retry, never an automatic one', () => {
  const advice = adviceFor(job({ status: 'UNKNOWN', error: '服务重启打断了这次请求' }))
  assert.equal(advice.canRetry, true); assert.equal(advice.canCancel, false); assert.equal(advice.tone, 'warning')
  assert.match(advice.body, /服务重启打断了这次请求/); assert.match(advice.body, /不会自动重发/); assert.match(advice.body, /1 个图像额度/)
})

test('running jobs can be cancelled but not retried; failed and cancelled can be retried', () => {
  for (const status of ['QUEUED', 'RUNNING', 'WAITING_RESOURCE']) { const a = adviceFor(job({ status })); assert.deepEqual([a.canCancel, a.canRetry, a.canDelete], [true, false, false], status) }
  for (const status of ['FAILED', 'CANCELLED']) { const a = adviceFor(job({ status })); assert.deepEqual([a.canRetry, a.canDelete], [true, true], status) }
  assert.equal(adviceFor(job({ status: 'CANCEL_REQUESTED' })).canRetry, false)
  assert.equal(adviceFor(job({ status: 'DELETE_PENDING' })).canDelete, false)
})

test('a finished picture is never offered for retry', () => {
  assert.equal(adviceFor(job({ status: 'SUCCEEDED', mediaUrl: '/api/me/private-media/x' })).canRetry, false)
})

test('deep link: picture opens viewer, no picture opens status, unknown id is reported only once loaded', () => {
  const list = [job({ id: 'a', mediaUrl: '/m/a' }), job({ id: 'b', status: 'UNKNOWN' })]
  assert.equal(routeTarget('a', list, true).action, 'view')
  assert.equal(routeTarget('b', list, true).action, 'status')
  assert.equal(routeTarget('zzz', list, true).action, 'missing')
  assert.equal(routeTarget('zzz', [], false).action, 'wait', 'Not found yet while the list is still loading')
  assert.equal(routeTarget('', list, true).action, 'wait')
})

test('records split into pictures, running and failures; a failure replaced by a successful retry folds away (#106)', () => {
  const list = [
    job({ id: 'ok', mediaUrl: '/m/ok', createdAt: 5 }),
    job({ id: 'f1', status: 'FAILED', createdAt: 1 }),
    job({ id: 'f2', status: 'FAILED', createdAt: 2, summary: { retryOf: 'f1' } }),
    job({ id: 'r3', status: 'SUCCEEDED', mediaUrl: '/m/r3', createdAt: 3, summary: { retryOf: 'f2' } }),
    job({ id: 'u', status: 'UNKNOWN', createdAt: 4 }),
    job({ id: 'run', status: 'RUNNING', createdAt: 6, summary: { retryOf: 'u' } }),
    job({ id: 'c', status: 'CANCELLED', createdAt: 7 }),
  ]
  const g = groupRecords(list)
  assert.deepEqual(g.done.map(j => j.id), ['ok', 'r3'], 'Pictures only, newest first')
  assert.deepEqual(g.running.map(j => j.id), ['run'])
  assert.deepEqual(g.failed.map(j => j.id), ['c', 'u'], 'Open failures, never mixed with pictures')
  assert.deepEqual(g.replaced.map(j => j.id), ['f2', 'f1'], 'Replaced through a failed retry too')
  assert.equal(g.replacedBy.get('f1'), 'r3')
  assert.equal(g.retryState.get('u'), 'retrying'); assert.equal(g.retryState.get('c'), 'open')
})

test('failure cards get one plain reason', () => {
  assert.equal(failureReason(job({ status: 'UNKNOWN' })), '生成中断，结果待核实')
  assert.equal(failureReason(job({ status: 'FAILED', error: '本机连接服务商超时，请检查网络和服务商地址。不会自动重试。' })), '服务商响应超时')
  assert.equal(failureReason(job({ status: 'FAILED', error: 'HTTP 500 upstream exploded' })), '模型没有返回可用的图片')
  assert.equal(failureReason(job({ status: 'FAILED', error: '衣物资料已变化，请重新检查。' })), '原资料已变化，请回到上方重新准备')
})
