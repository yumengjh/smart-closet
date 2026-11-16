import { platformRequest } from '../services/platform'
import type { CreationCatalog, CreationInput, CreationJob, CreationPage, CreationPreparation, PendingCreation } from './types'

const root = '/api/creations'
const jobPath = (id: string) => `${root}/jobs/${encodeURIComponent(id)}`
export const creationApi = {
  catalog: () => platformRequest<CreationCatalog>(`${root}/catalog`),
  prepare: (body: CreationInput) => platformRequest<CreationPreparation>(`${root}/preparations`, 'POST', body),
  submit: (pending: PendingCreation) => platformRequest<CreationJob>(`${root}/jobs`, 'POST', { preparationId: pending.preparationId }, pending.key),
  jobs: (page = 1) => platformRequest<CreationPage>(`${root}/jobs?page=${page}&size=12`),
  cancel: (id: string) => platformRequest<unknown>(`${jobPath(id)}/cancel`, 'POST'),
  remove: (id: string) => platformRequest<unknown>(jobPath(id), 'DELETE'),
  feedback: (id: string, reason: string) => platformRequest<unknown>(`${jobPath(id)}/feedback`, 'POST', { reason }),
  export: (id: string, title: string, brand: boolean) => platformRequest<Blob>(`${jobPath(id)}/export`, 'POST', { title: title.trim() || undefined, brand }, undefined, { responseType: 'blob' }),
}
