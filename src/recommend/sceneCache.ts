import { candidateScene } from '../agent/bridge'
import type { OutfitScene } from '../domain/outfit'
import type { RecommendedOutfit } from './types'

const scenes = new Map<string, Promise<OutfitScene>>()
/** Auto-laid-out preview scene of a recommended outfit, cached by its garment set. */
export function outfitScene(outfit: RecommendedOutfit): Promise<OutfitScene> {
  const key = outfit.garments.map(g => g.id).sort().join(',')
  let p = scenes.get(key)
  if (!p) { p = candidateScene({ name: outfit.name, reason: '', garmentIds: outfit.garments.map(g => g.id) }); scenes.set(key, p); p.catch(() => scenes.delete(key)) }
  return p
}
