/** Hidden video can decode frames without compositor callbacks. Metadata or a connected RTC room is not a frame. */
export function observeFirstFrame(video: HTMLVideoElement, onFrame: () => void) {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let frame: number | undefined
  const stop = () => {
    if (stopped) return
    stopped = true
    if (timer !== undefined) clearInterval(timer)
    if (frame !== undefined) video.cancelVideoFrameCallback?.(frame)
    video.removeEventListener('loadeddata', check)
    video.removeEventListener('playing', check)
  }
  function check() {
    if (stopped || !video.srcObject || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return
    const stream = video.srcObject as MediaStream
    if (typeof stream.getVideoTracks !== 'function' || !stream.getVideoTracks().some(t => t.readyState === 'live')) return
    stop(); onFrame()
  }
  video.addEventListener('loadeddata', check)
  video.addEventListener('playing', check)
  timer = setInterval(check, 150)
  if (typeof video.requestVideoFrameCallback === 'function') frame = video.requestVideoFrameCallback(check)
  check()
  return stop
}
