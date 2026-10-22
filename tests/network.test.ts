import test from 'node:test'
import assert from 'node:assert/strict'
import { NetworkError, fetchWithRetry, isNetworkFailure } from '../src/domain/network.ts'

const noWait = async () => {}
const ok = () => new Response('{}', { status: 200 })

test('reads retry after a dropped connection and then succeed', async () => {
  let calls = 0
  const fetchStub = async () => { calls++; if (calls < 3) throw new TypeError('Load failed'); return ok() }
  const response = await fetchWithRetry('/api/closet/tasks', {}, { fetch: fetchStub as typeof fetch, wait: noWait })
  assert.equal(response.status, 200)
  assert.equal(calls, 3)
})

test('a read that keeps failing ends as NetworkError with a clear message', async () => {
  const fetchStub = async () => { throw new TypeError('Load failed') }
  await assert.rejects(fetchWithRetry('/api/recommendations', {}, { fetch: fetchStub as typeof fetch, wait: noWait }),
    (error: unknown) => error instanceof NetworkError && /网络连接中断/.test((error as Error).message))
})

test('writes are never repeated, and HTTP errors and caller aborts pass through untouched', async () => {
  let calls = 0
  const failing = async () => { calls++; throw new TypeError('Failed to fetch') }
  await assert.rejects(fetchWithRetry('/api/outfits', { method: 'POST' }, { fetch: failing as typeof fetch, wait: noWait }), NetworkError)
  assert.equal(calls, 1)

  const server = async () => new Response('{}', { status: 502 })
  assert.equal((await fetchWithRetry('/api/x', {}, { fetch: server as typeof fetch, wait: noWait })).status, 502)

  const controller = new AbortController(); controller.abort()
  const aborted = async () => { throw new DOMException('The operation was aborted.', 'AbortError') }
  await assert.rejects(fetchWithRetry('/api/x', { signal: controller.signal }, { fetch: aborted as typeof fetch, wait: noWait }), { name: 'AbortError' })
  assert.equal(isNetworkFailure(new TypeError('Load failed')), true)
  assert.equal(isNetworkFailure(new Error('请求失败 (500)')), false)
})
