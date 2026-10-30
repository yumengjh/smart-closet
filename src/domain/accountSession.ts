/**
 * Which account this page belongs to (issues smart-closet-server#159 / #160).
 *
 * Browser tabs share one session cookie, so signing in as B in another tab silently turns every request of a tab that
 * still shows A into a request as B. The page therefore remembers the account it was loaded for and
 *  - counts account changes ("epoch"): a response that arrives after the account changed belongs to the old account and is
 *    discarded instead of being written into the new account's state;
 *  - tells the other tabs when it signs in or out, and marks itself stale when another tab reports a different account;
 *    a stale page refuses every request until it is reloaded;
 *  - names the account in X-Closet-Account on writes, so the server can refuse a submit that raced the broadcast.
 * The header and these checks can only make a request fail; authorization stays with the server's own session.
 */
export class AccountSwitchedError extends Error {
  constructor(message = '登录账号已在其他窗口切换，本页内容已过期，请重新加载页面。') { super(message); this.name = 'AccountSwitchedError' }
}

/** True for the expected refusal of an out-of-date page: nothing to report, the shell already asks for a reload. */
export const isAccountSwitched = (cause: unknown): cause is AccountSwitchedError => cause instanceof AccountSwitchedError

/**
 * Timers and polls of a page that has gone stale (another tab signed in as someone else) must stop instead of retrying a
 * request that is refused every time. Check before sending and before scheduling the next round (smart-closet-server#177).
 */
export const mayPoll = () => !stale

/**
 * Request-layer sink for the refusal above: a request that nobody awaits (fire-and-forget, `void load()`, an interval tick)
 * would otherwise end as "Uncaught (in promise) AccountSwitchedError" in the console. Other rejections still surface.
 * Returns the function that removes the listener.
 */
export function silenceAccountSwitch(target: { addEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void; removeEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void }) {
  const listener = (event: PromiseRejectionEvent) => { if (isAccountSwitched(event.reason)) event.preventDefault() }
  target.addEventListener('unhandledrejection', listener)
  return () => target.removeEventListener('unhandledrejection', listener)
}

/** Vue's error hook: the expected refusal is dropped, anything else goes to `otherwise` (the console by default). */
export function accountAwareErrorHandler(otherwise: (error: unknown, info: string) => void = (error, info) => console.error(`[Vue] ${info}`, error)) {
  return (error: unknown, _instance: unknown, info: string) => { if (!isAccountSwitched(error)) otherwise(error, info) }
}

/** Sends a tab-to-tab message; returns a function that closes the transport. */
export type AccountTransport = { post(account: string | null): void; listen(handler: (account: string | null) => void): void; close(): void }

const header = 'X-Closet-Account'
let account: string | null = null
let epoch = 0
let stale = false
let transport: AccountTransport | null = null
const listeners = new Set<() => void>()

export const activeAccount = () => account
export const accountEpoch = () => epoch
export const accountIsStale = () => stale
/** Runs when the account changes or the page turns stale. Returns the unsubscribe function. */
export function onAccountChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function notify() { for (const listener of [...listeners]) { try { listener() } catch { /* One listener must not stop the others. */ } } }

/** Called whenever the signed-in user is known to have changed (login, logout, expired session, /api/auth/me result). */
export function setActiveAccount(next: string | null) {
  if (next === account) return
  const previous = account
  account = next
  // Signing in from nothing changes no request in flight (none could have carried a user's data); leaving or replacing an account does.
  if (previous !== null) epoch++
  transport?.post(next)
  notify()
}

/** Another tab reported a different account while this page still shows one: stop using the shared session. */
export function markAccountStale() {
  if (stale) return
  stale = true; epoch++
  notify()
}

/** Throws when this page may no longer use the shared session. */
export function assertAccountCurrent() { if (stale) throw new AccountSwitchedError() }

/** Header that binds a write to the account this page shows. Empty when nobody is signed in or for sign-in itself. */
export function accountHeaders(path = ''): Record<string, string> {
  if (!account || /^\/api\/auth\/(login|register|portable-login)$/.test(path.split('?')[0])) return {}
  return { [header]: account }
}

/** Snapshot taken before a request; the returned check throws when the account changed or the page went stale since. */
export function captureAccount() {
  const started = epoch
  assertAccountCurrent()
  return () => { if (stale || epoch !== started) throw new AccountSwitchedError() }
}

/** Start listening to the other tabs. Safe to call more than once. */
export function connectAccountTransport(next: AccountTransport | null = defaultTransport()) {
  transport?.close()
  transport = next
  transport?.listen(other => { if (account !== null && other !== account) markAccountStale() })
}

/** BroadcastChannel where it exists, the storage event of localStorage otherwise. */
export function defaultTransport(): AccountTransport | null {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('closet-account')
      return { post: value => channel.postMessage({ account: value }), listen: handler => { channel.onmessage = event => handler((event.data as { account?: string | null })?.account ?? null) }, close: () => channel.close() }
    }
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const key = 'closet.account.signal'
      let handler: ((account: string | null) => void) | undefined
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key || !event.newValue) return
        try { handler?.((JSON.parse(event.newValue) as { account: string | null }).account) } catch { /* Ignore a malformed signal. */ }
      }
      return {
        post: value => { try { localStorage.setItem(key, JSON.stringify({ account: value, at: Date.now() })) } catch { /* Storage may be blocked. */ } },
        listen: next => { handler = next; window.addEventListener('storage', onStorage) },
        close: () => window.removeEventListener('storage', onStorage),
      }
    }
  } catch { /* No cross-tab channel: the server check still protects writes. */ }
  return null
}

/** Tests only. */
export function resetAccountSession() { transport?.close(); transport = null; account = null; epoch = 0; stale = false; listeners.clear() }
