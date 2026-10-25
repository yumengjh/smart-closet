import test from 'node:test'
import assert from 'node:assert/strict'
import { readAgentStream, type StreamEvent } from '../src/agent/sse.ts'
function stream(text: string) {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close() } })
}
test('assistant SSE preserves Chinese split across UTF8 bytes and CRLF frames', async () => {
  const result: StreamEvent[] = []
  await readAgentStream(stream('event: token\r\ndata: {"text":"蓝色衬衫"}\r\n\r\nevent: done\r\ndata: {"quota":{"used":1}}\r\n\r\n'), e => result.push(e))
  assert.deepEqual(result, [{ event: 'token', data: { text: '蓝色衬衫' } }, { event: 'done', data: { quota: { used: 1 } } }])
})
test('partial reply requires deliberate retry and is not reported as completed', async () => {
  const result: StreamEvent[] = []
  await assert.rejects(readAgentStream(stream('event: token\ndata: {"text":"部分回复"}\n\n'), e => result.push(e)), /主动重试/)
  assert.equal(result[0].data.text, '部分回复')
})

for (const terminal of ['done', 'error']) {
  test(`${terminal} ends reading immediately without waiting for EOF or replaying later frames`, async () => {
    let cancelled = false
    const events: StreamEvent[] = []
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode(`event: ${terminal}\ndata: {"message":"已确定失败"}\n\nevent: token\ndata: {"text":"不应追加"}\n\n`)) },
      cancel() { cancelled = true; return new Promise(() => {}) },
    })
    const timeout = AbortSignal.timeout(1000)
    const result = readAgentStream(body, event => events.push(event))
    const bounded = Promise.race([result, new Promise((_, reject) => timeout.addEventListener('abort', () => reject(new Error('仍在等待 EOF'))))])
    if (terminal === 'error') await assert.rejects(bounded, /已确定失败/)
    else await bounded
    assert.equal(cancelled, true)
    assert.deepEqual(events.map(e => e.event), [terminal])
  })
}
