import type { Router } from 'vue-router'
import { candidateScene } from '../agent/bridge'
import { createUuid } from '../domain/id'
import type { RecommendedOutfit } from './types'
import { recommendApi } from './api'

/** Opens a recommended outfit as a new local draft in the workspace, marked as coming from a recommendation (design 8.3). */
export async function openInWorkspace(router: Router, username: string, outfit: RecommendedOutfit, runId?: string, selectedAccessoryIds: string[] = []) {
  const selected = (outfit.accessories || []).filter(item => selectedAccessoryIds.includes(item.id))
  const scene = await candidateScene({ name: outfit.name, reason: '', garmentIds: [...outfit.garments.map(g => g.id), ...selected.map(item => item.id)] })
  const id = createUuid()
  localStorage.setItem(`yixu.outfit-draft.v1:${username}:new:${id}`, JSON.stringify({ name: outfit.name, revision: null, scene, savedAt: Date.now(), recommendationLogId: outfit.logId, accessoryStates: Object.fromEntries((outfit.accessories || []).map(item => [item.id, selected.some(value => value.id === item.id)])) }))
  if (outfit.logId) {
    recommendApi.signal({ kind: 'OPEN_WORKSPACE', logId: outfit.logId })
    for (const item of selected) recommendApi.signal({ kind: 'ACCESSORY_KEPT', logId: outfit.logId, garmentId: item.id })
  }
  await router.push({ path: '/outfits/new', query: { draft: id, from: 'recommend', ...(runId ? { run: runId, key: outfit.key } : {}) } })
}
