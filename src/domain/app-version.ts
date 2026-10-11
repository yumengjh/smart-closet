/** Build identity of the web app and the server, shown at the bottom of Settings. */
export type BuildInfo = { version: string; commit: string; builtAt: string }
export type ServerInfo = { version?: string; commit?: string }

/** "v1.2.0 · abc1234": a tag build shows its tag, a branch build its package version; the commit is shortened. */
export function formatVersion(info: { version?: string; commit?: string } | null | undefined): string {
  const version = (info?.version || '').trim()
  const commit = (info?.commit || '').trim().slice(0, 7)
  const label = !version ? '' : /^\d/.test(version) ? `v${version}` : version
  return [label, commit].filter(Boolean).join(' · ') || '未知'
}

/** Local time of the build, "2026-10-11 08:30"; empty when unknown. */
export function formatBuildTime(iso: string): string {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Strips a leading "v" from a tag such as v1.2.0 so it reads like package.json versions. */
export function versionFromTag(tag: string | undefined, fallback: string): string {
  const value = (tag || '').trim()
  return /^v\d/.test(value) ? value.slice(1) : value || fallback
}
