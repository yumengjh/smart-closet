import { shallowRef } from 'vue'
import { usingMocks } from '../services/api'
import { onAccountChange } from '../domain/accountSession'
import { creationApi } from './api'
import type { CreationCatalog } from './types'

export const creationCatalog = shallowRef<CreationCatalog | null>(null)
let pending: Promise<void> | undefined
onAccountChange(() => { creationCatalog.value = null; pending = undefined })
export function loadCreationCatalog(refresh = false): Promise<void> {
  if (usingMocks) { creationCatalog.value = { enabled: false, templates: [] }; return Promise.resolve() }
  if (!refresh && creationCatalog.value) return Promise.resolve()
  if (pending) return pending
  pending = creationApi.catalog().then(value => { creationCatalog.value = value }).finally(() => { pending = undefined })
  return pending
}
