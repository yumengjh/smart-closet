import { ref } from 'vue'
import { tryOnApi, type Capabilities } from './api'
export const tryOnAccess = ref<Capabilities | null>(null)
let requestNumber = 0
export async function refreshTryOnAccess() {
  const version = ++requestNumber
  try { const result = await tryOnApi.capabilities(); if (version === requestNumber) tryOnAccess.value = result }
  catch { if (version === requestNumber) tryOnAccess.value = null }
}
export function resetTryOnAccess() { requestNumber++; tryOnAccess.value = null }
