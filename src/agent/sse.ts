export type StreamEvent = { event: string; data: any }
export async function readAgentStream(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
  const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let complete = false
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
        if (event && data) { if (event === 'done') complete = true; onEvent({ event, data: JSON.parse(data) }) }
      }
      if (buffer.length > 200000) throw new Error('回复数据过大。')
      if (done) break
    }
    if (!complete) throw new Error('回复已中断。消息可能已经计入额度，请查看会话后再主动重试。')
  } finally { reader.releaseLock() }
}
