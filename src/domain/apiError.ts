/** Structured server failures, still compatible with existing Error handlers. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly retryAfter: string | null
  constructor(message: string, status: number, code?: string, retryAfter: string | null = null) {
    super(message)
    this.name = 'ApiError'; this.status = status; this.code = code; this.retryAfter = retryAfter
  }
}
