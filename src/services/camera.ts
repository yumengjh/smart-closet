/** Inspect devices without opening a permission prompt or starting a stream. */
export async function hasCamera(devices?: Pick<MediaDevices, 'enumerateDevices'>): Promise<boolean> {
  if (!devices?.enumerateDevices) return false
  try { return (await devices.enumerateDevices()).some(device => device.kind === 'videoinput') }
  catch { return false }
}

export function cameraError(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return '摄像头权限未开启。你可以在浏览器中允许拍照，也可以从相册选择。'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没有找到可用的摄像头，可以先拍好照片，再从相册选择。'
  if (name === 'NotReadableError' || name === 'AbortError') return '摄像头暂时无法使用，可能正被其他应用占用。关闭后可重试，或从相册选择。'
  return '暂时无法打开摄像头，你仍可以从相册选择照片。'
}
