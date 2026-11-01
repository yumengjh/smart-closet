/** In-memory, one-time explicit handoff; never persists a private file in browser storage. */
import { activeAccount, accountIsStale } from '../domain/accountSession'
let pending: { file: File; owner: string | null } | undefined
export function setTryOnIntake(file: File) { pending = { file, owner: activeAccount() } }
export function takeTryOnIntake() { const value = pending; pending = undefined; return value && !accountIsStale() && value.owner === activeAccount() ? value.file : undefined }
