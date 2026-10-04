export function createApiUrls(base = '') {
  if (base) {
    const origin = new URL(base)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash
      || (origin.pathname !== '/' && origin.pathname !== '') || origin.origin !== base.replace(/\/$/, '')) {
      throw new Error('VITE_API_BASE_URL 必须是完整的后端 Origin，不能包含路径、查询参数或凭据。')
    }
    base = origin.origin
  }
  function apiUrl(path: string): string {
    if (!/^\/api(?:\/|\?|$)/.test(path) || path.includes('\\')) throw new Error('无效的 API 路径。')
    const resolved = new URL(path, base || 'http://same-origin.invalid')
    if (!/^\/api(?:\/|$)/.test(resolved.pathname)) throw new Error('无效的 API 路径。')
    return base ? resolved.href : path
  }
  function mediaUrl(path: string | null | undefined): string | undefined {
    return path == null ? undefined : /^\/api(?:\/|\?|$)/.test(path) ? apiUrl(path) : path
  }
  function isApiMedia(path: string): boolean {
    if (/^\/api(?:\/|\?|$)/.test(path)) { apiUrl(path); return true }
    if (!base) return false
    try { const url = new URL(path); return url.origin === base && /^\/api(?:\/|$)/.test(url.pathname) }
    catch { return false }
  }
  return { apiUrl, mediaUrl, isApiMedia }
}
