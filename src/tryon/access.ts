import { ref } from 'vue'
import { tryOnApi, type Capabilities } from './api'
export const tryOnAccess = ref<Capabilities | null>(null)
let requestNumber = 0
export async function refreshTryOnAccess() {
  const version = ++requestNumber
  try { const result = await tryOnApi.capabilities(); if (version === requestNumber) tryOnAccess.value = result }
  catch { if (version === requestNumber) tryOnAccess.value = null }
}
/** The try-on page already asked; share its answer instead of asking again (smart-closet-server#198). */
export function setTryOnAccess(result: Capabilities) { requestNumber++; tryOnAccess.value = result }
export function resetTryOnAccess() { requestNumber++; tryOnAccess.value = null }
