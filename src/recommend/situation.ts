import type { ActivityTags, IntentInput, RecommendationScene, RecommendationView, RecommendedOutfit } from './types.ts'

/** Only the scorer can identify the exact outer used for warmth. Older cached cards can be recomputed. */
export function displayOuter(outfit: Pick<RecommendedOutfit, 'displayOuter' | 'outers'>) {
  return outfit.displayOuter || null
}

export type RecommendationSource = { recommendationLogId?: string | null; accessoryStates?: Record<string, boolean> }
/** Only a change to a suggested accessory counts as an edit, so untouched suggestions create no removal signal. */
export function accessoryChanges(source: RecommendationSource, presentIds: string[]) {
  const present = new Set(presentIds)
  const events: { kind: 'ACCESSORY_KEPT' | 'ACCESSORY_REMOVED'; logId: string; garmentId: string }[] = []
  if (!source.recommendationLogId) return events
  for (const [garmentId, previous] of Object.entries(source.accessoryStates || {})) {
    const current = present.has(garmentId)
    if (current === previous) continue
    events.push({ kind: current ? 'ACCESSORY_KEPT' : 'ACCESSORY_REMOVED', logId: source.recommendationLogId, garmentId })
    source.accessoryStates![garmentId] = current
  }
  return events
}

export function activityOptions(catalog: ActivityTags | null, occasion: IntentInput['occasion']) {
  if (!catalog?.enabled || !occasion) return []
  return catalog.occasions[occasion] || []
}

export function sceneView(view: RecommendationView, group: RecommendationScene): RecommendationView {
  return { ...view, runId: group.runId, outfits: group.outfits, hasMore: true, groups: undefined, pendingGroups: false,
    intent: { ...view.intent, occasion: group.occasion, activity: undefined, situation: undefined, description: group.label } }
}
