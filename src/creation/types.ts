import type { PoseChoice } from '../services/platform'

export type Light = 'DEFAULT' | 'WARM' | 'COOL'
export type CreationTemplate = {
  id: string; version: number; name: string; description: string; previewUrl: string | null
  personRequired: boolean; options: { light?: Light[] }; maxGarments: number
  available: boolean; unavailableReason: string | null
}
export type CreationCatalog = { enabled: boolean; templates: CreationTemplate[] }
export type CreationInput = {
  templateId: string; templateVersion: number; garments: { id: string; revision: number }[]
  outfitId?: string; outfitRevision?: number; baselineId?: string; baselineRevision?: number
  pose?: PoseChoice; options: { light: Light }; note?: string; parentJobId?: string
}
export type CreationPreparation = { preparationId: string; expiresAt: number; quotaUnits: number }
export type CreationStatus = 'QUEUED' | 'WAITING_RESOURCE' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED' | 'DELETED'
export type CreationJob = {
  id: string; status: CreationStatus; templateId: string; templateVersion: number; templateName: string
  createdAtMs: number; updatedAtMs: number; mediaUrl: string | null; errorCode?: string; errorMessage?: string
  quotaUnits: number; parentJobId: string | null; canCancel: boolean; canExport: boolean; canRecreate: boolean
  waitReason?: string | null
}
export type CreationPage = { items: CreationJob[]; total: number; page: number; size: number }
export type PendingCreation = { key: string; preparationId: string }
