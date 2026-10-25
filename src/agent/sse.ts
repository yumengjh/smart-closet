export type StreamEvent = { event: string; data: any }
export async function readAgentStream(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
  const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let terminal = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        const lines = frame.split('\n')
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
        if (event && data) {
          const parsed = JSON.parse(data)
          terminal = event === 'done' || event === 'error'
          onEvent({ event, data: parsed })
          // The protocol has ended even if a proxy keeps the HTTP connection open.
          if (terminal) {
            void reader.cancel().catch(() => {})
            if (event === 'error') throw new Error(parsed.message || '回复已中断，请主动重试。')
            return
          }
        }
      }
      if (buffer.length > 200000) throw new Error('回复数据过大。')
      if (done) break
    }
    if (!terminal) throw new Error('回复已中断。消息可能已经计入额度，请查看会话后再主动重试。')
  } finally { reader.releaseLock() }
}
