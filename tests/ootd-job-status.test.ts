import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adviceFor, routeTarget } from '../src/ootd/jobStatus.ts'
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
