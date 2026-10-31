/**
 * Why the session ended, shown once on the login page (smart-closet-server#175). The server answers 401 SESSION_EVICTED when
 * a sixth login on the same account signed this device out; it says nothing about the other devices and neither does this.
 */
export const SESSION_EVICTED = 'SESSION_EVICTED'
export const SESSION_EVICTED_NOTICE = '该账号在其他设备登录，本设备已退出。请重新登录。'

let pending: string | null = null

/** Remember the reason carried by a 401 body; any other code leaves no notice. */
export function noteSessionLost(code?: string | null) {
  if (code === SESSION_EVICTED) pending = SESSION_EVICTED_NOTICE
}

/** A protected request answered 401: keep the reason, then let the shell return to the login page. */
export function signalSessionExpired(code?: string | null) {
  noteSessionLost(code)
  window.dispatchEvent(new Event('closet-session-expired'))
}

/** The notice for the login page, at most once. */
export function takeSessionNotice() {
  const notice = pending
  pending = null
  return notice
}
