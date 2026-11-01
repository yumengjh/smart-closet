import { tryOnApi, type Limits, type Media } from './api'

export function frameCanvas(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) throw new Error('生成画面尚未就绪。')
  const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.floor(video.videoWidth * scale / 2) * 2)
  canvas.height = Math.max(2, Math.floor(video.videoHeight * scale / 2) * 2)
  return canvas
}
export function drawFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const font = Math.max(14, Math.floor(Math.min(canvas.width, canvas.height) / 40)), margin = font
  ctx.font = `${font}px system-ui, sans-serif`
  const label = 'AI 试穿效果', width = ctx.measureText(label).width + font
  ctx.fillStyle = '#0009'; ctx.fillRect(canvas.width - width - margin, canvas.height - font * 2 - margin, width, font * 2)
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, canvas.width - width - margin + font / 2, canvas.height - font - margin)
}
export async function photo(video: HTMLVideoElement) { const canvas = frameCanvas(video); canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height); return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('照片编码失败。')), 'image/png')) }

/** Hardware encode, fragmented output, bounded byte-offset uploads. Mic is local, never an SDK input. */
export async function startRecording(video: HTMLVideoElement, session: string, limits: Limits, microphone: MediaStream | undefined,
  onProgress: (seconds: number, bytes: number) => void, onLimit: () => void, onError: (e: Error) => void) {
  const b = await import('mediabunny')
  const canvas = frameCanvas(video)
  const audioTrack = microphone?.getAudioTracks()[0]
  const avc = await b.canEncodeVideo('avc', { width: canvas.width, height: canvas.height, frameRate: 24 })
  const aac = !audioTrack || await b.canEncodeAudio('aac', { numberOfChannels: 1, sampleRate: 48000 })
  const mp4 = avc && aac
  if (!mp4 && (!await b.canEncodeVideo('vp8', { width: canvas.width, height: canvas.height }) || audioTrack && !await b.canEncodeAudio('opus'))) throw new Error('当前浏览器不支持此有声录像编码，请使用最新系统浏览器。')
  const media = await tryOnApi.recording(session, mp4 ? 'video/mp4' : 'video/webm', Boolean(audioTrack))
  let sequence = 0, uploadedBytes = 0, totalBytes = 0, highWater = 0, queuedBytes = 0
  let tail = Promise.resolve(), failure: unknown, pending: Uint8Array<ArrayBuffer>[] = [], pendingOffset = 0, pendingSize = 0
  const start = performance.now()
  let stopping = false, ended = false, frame = 0, timer = 0, frameWork = Promise.resolve()
  const elapsed = () => Math.min(limits.recordingSeconds, (performance.now() - start) / 1000)
  const fail = (cause: unknown) => { if (failure) return; failure = cause; onError(cause instanceof Error ? cause : new Error('录像上传失败，已上传片段将保留。')) }
  const flush = () => {
    if (!pendingSize) return
    const bytes = new Uint8Array(pendingSize); let offset = 0
    for (const p of pending) { bytes.set(p, offset); offset += p.byteLength }
    const position = pendingOffset, seq = sequence++
    pending = []; pendingSize = 0; queuedBytes += bytes.byteLength
    tail = tail.then(async () => {
      if (failure) throw failure
      for (let attempt = 0; ; attempt++) {
        try { await tryOnApi.chunk(media.id, seq, position, bytes); break }
        catch (e) { if (attempt >= 2) throw e; await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt)) }
      }
      queuedBytes -= bytes.byteLength; uploadedBytes += bytes.byteLength; onProgress(elapsed(), uploadedBytes)
    })
    void tail.catch(fail)
  }
  const target = new b.StreamTarget(new WritableStream({
    async write(chunk) {
      if (failure) throw failure
      if (chunk.position < 0 || chunk.position + chunk.data.length > limits.recordingBytes || totalBytes + chunk.data.length > limits.recordingBytes) throw new Error('录像已达到文件大小限制。')
      if (pendingSize && chunk.position !== pendingOffset + pendingSize) flush()
      if (!pendingSize) pendingOffset = chunk.position
      pending.push(chunk.data.slice()); pendingSize += chunk.data.length; totalBytes += chunk.data.length; highWater = Math.max(highWater, chunk.position + chunk.data.length)
      if (pendingSize >= 1024 * 1024) flush()
      if (queuedBytes > 4 * 1024 * 1024) await tail
    },
  }), { chunked: false })
  const output = new b.Output({ format: mp4 ? new b.Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 5 }) : new b.WebMOutputFormat({ appendOnly: true, minimumClusterDuration: 5 }), target })
  const source = new b.CanvasSource(canvas, { codec: mp4 ? 'avc' : 'vp8', bitrate: 2_500_000, keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: 24 })
  const audio = audioTrack ? new b.MediaStreamAudioTrackSource(audioTrack, { codec: mp4 ? 'aac' : 'opus', bitrate: 96_000 }, { timestampBase: 'zero' }) : undefined
  if (audio) { output.addAudioTrack(audio); void audio.errorPromise.catch(fail) }
  try { await output.start() } catch (e) { source.close(); audio?.close(); microphone?.getTracks().forEach(t => t.stop()); throw e }
  let lastVideoTime = -1
  const pump = async () => {
    if (stopping || ended) return
    const timestamp = elapsed()
    if (timestamp - lastVideoTime < 1 / 24) { frame = requestAnimationFrame(() => { frameWork = pump() }); return }
    lastVideoTime = timestamp
    try { drawFrame(video, canvas); await source.add(timestamp, 1 / 24) }
    catch (e) { fail(e); return }
    if (elapsed() >= limits.recordingSeconds || highWater >= limits.recordingBytes - 1024 * 1024) { onLimit(); return }
    frame = requestAnimationFrame(() => { frameWork = pump() })
  }
  frameWork = pump()
  timer = window.setInterval(() => { flush(); onProgress(elapsed(), uploadedBytes); if (elapsed() >= limits.recordingSeconds) onLimit() }, 500)
  let stoppingWork: Promise<Media> | undefined
  const stop = (interrupted = false) => {
    if (stoppingWork) return stoppingWork
    stopping = true; cancelAnimationFrame(frame); clearInterval(timer); audio?.close(); microphone?.getTracks().forEach(t => t.stop())
    stoppingWork = (async () => {
      try {
        await frameWork; source.close(); audio?.close()
        if (failure) { await output.cancel(); throw failure }
        await output.finalize(); flush(); await tail
        if (sequence === 0) throw new Error('没有录制到可保存画面。')
        const result = await tryOnApi.complete(media.id, sequence - 1, Math.round(elapsed() * 1000), interrupted)
        ended = true; return result
      } finally { microphone?.getTracks().forEach(t => t.stop()); source.close(); audio?.close(); ended = true }
    })()
    return stoppingWork
  }
  return { id: media.id, stop }
}
export type Recorder = Awaited<ReturnType<typeof startRecording>>
