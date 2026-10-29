// Issue #120/#122: the backend classifies a failed or stopped turn; the page turns the class into advice the user can act on.
export type RetryHint = 'RETRY' | 'LATER' | 'NEW_SESSION' | 'NONE'
export type FailureAdvice = { hint: string; newSession: boolean }
export class AgentStreamError extends Error {
  retry?: RetryHint
  errorType?: string
  constructor(message: string, retry?: RetryHint, errorType?: string) { super(message); this.name = 'AgentStreamError'; this.retry = retry; this.errorType = errorType }
}
export function failureAdvice(retry?: string): FailureAdvice {
  switch (retry) {
    case 'NEW_SESSION': return { hint: '新开一个对话后再试，本次不计次。', newSession: true }
    case 'LATER': return { hint: '请稍后再试，本次不计次。', newSession: false }
    case 'RETRY': return { hint: '可以换种说法再试一次，本次不计次。', newSession: false }
    default: return { hint: '', newSession: false }
  }
}
/** The browser aborted its own request (the stop button, a closed panel); the backend then marks the turn as stopped. */
export function isStopped(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' : (error as { name?: string })?.name === 'AbortError'
}
