import type { BuildInfo, ServerInfo } from '../domain/app-version'
import { apiUrl } from './urls'
import { usingMocks } from './api'

/** Injected by vite.config.ts at build time. */
export const webBuild: BuildInfo = { version: __APP_VERSION__, commit: __APP_COMMIT__, builtAt: __APP_BUILT_AT__ }

/** The server's version from the public /api/health; null when it cannot be reached. */
export async function serverBuild(): Promise<ServerInfo | null> {
  if (usingMocks) return { version: 'mock' }
  try {
    const response = await fetch(apiUrl('/api/health'), { credentials: 'include' })
    return response.ok ? await response.json() as ServerInfo : null
  } catch { return null }
}
