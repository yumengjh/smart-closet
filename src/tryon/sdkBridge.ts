
/**
 * Audited private seam in exactly @xmaxai/web-sdk 1.1.1. The SDK exposes neither dependency injection nor a custom
 * control URL publicly. Keep its RTC/session decoding intact, replace only the HTTP service BEFORE any connection.
 * Never supply a provider key to the browser. An ABI mismatch is fatal, never a fallback to direct upstream calls.
 */
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('实时 SDK 适配不匹配，请联系管理员。')
  return value as Record<string, unknown>
}
export type ControlRequest = (path: string, init: RequestInit) => Promise<unknown>
export function bindControlPlane(manager: unknown, lease: () => string, request: ControlRequest) {
  const connection = object(object(manager).connectionManager)
  const session = object(object(connection.dependencies).sessionService)
  const original = object(session.apiService)
  if (typeof session.createSession !== 'function' || typeof session.heartbeatSession !== 'function' || typeof session.closeSession !== 'function' || typeof original.post !== 'function') throw new Error('实时 SDK 版本不受支持。')
  const call = (method: string, path: string) => {
    const id = lease()
    if (!/^[a-f0-9-]{36}$/.test(id) || !(/^\/session$/.test(path) && method === 'POST' || /^\/session\/[A-Za-z0-9_-]+\/heartbeat$/.test(path) && method === 'PUT' || /^\/session\/[A-Za-z0-9_-]+$/.test(path) && method === 'DELETE')) return Promise.reject(new Error('试穿授权未就绪或控制操作无效。'))
    return request(`/api/tryon/sessions/${id}/sdk${path}`, { method, body: method === 'POST' ? '{}' : undefined, keepalive: method === 'DELETE' })
  }
  const bridge = {
    post: (path: string) => call('POST', path),
    put: (path: string) => call('PUT', path),
    delete: (path: string) => call('DELETE', path),
    get: () => Promise.reject(new Error('不支持此控制操作。')),
  }
  if (!Reflect.set(session, 'apiService', bridge) || session.apiService !== bridge) throw new Error('实时 SDK 控制面绑定失败。')
}
