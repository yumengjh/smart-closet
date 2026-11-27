import { platformRequest, PlatformRequestError } from './platform'

export type Tier = 'STANDARD' | 'PREMIUM'
export type RenderTiers = {
  enabled: boolean
  selected: Tier
  degradeEnabled: boolean
  tiers: { tier: Tier; units: number; available: boolean; reason?: string | null }[]
}
export type RealtimeTiers = {
  enabled: boolean
  selected: Tier
  tiers: { tier: Tier; available: boolean; reason?: string | null }[]
}
export type ModelTiers = { render: RenderTiers; realtime: RealtimeTiers }

export const getModelTiers = () => platformRequest<ModelTiers>('/api/me/model-tiers')
export const putModelTiers = (body: { render?: Tier; realtime?: Tier }) => platformRequest<ModelTiers>('/api/me/model-tiers', 'PUT', body)

export async function getRenderTiers(): Promise<RenderTiers> {
  try { return (await getModelTiers()).render }
  catch (cause) {
    if (cause instanceof PlatformRequestError && cause.status === 404) return { enabled: false, selected: 'STANDARD', degradeEnabled: false, tiers: [] }
    throw cause
  }
}

export function renderTierAvailable(config: RenderTiers, tier: Tier) {
  const option = config.tiers.find(item => item.tier === tier)
  return !!option && (option.available || (tier === 'PREMIUM' && config.degradeEnabled && config.tiers.some(item => item.tier === 'STANDARD' && item.available)))
}

/** The server prices requests without a tier at the premium rate. */
export function renderUnits(config: RenderTiers | null, requested?: Tier | null, baseUnits = 1) {
  const units = config?.tiers.find(item => item.tier === (requested ?? 'PREMIUM'))?.units
  return units == null ? undefined : units * baseUnits
}

/** 档位开启时只发送 tier；关闭时保留原有 provider/model。 */
export function renderChoice(enabled: boolean, tier: Tier, capability?: { provider: string; model: string }) {
  return enabled ? { tier } : { provider: capability!.provider, model: capability!.model }
}

export function withRenderTier<T extends object>(input: T, enabled: boolean, tier: Tier): T & { tier?: Tier } {
  return enabled ? { ...input, tier } : input
}

export function tierFallbackMessage(job: { tierRequested?: Tier | null; tierUsed?: Tier | null; quotaUnits?: number | null }, compact = false): string {
  if (job.tierRequested !== 'PREMIUM' || job.tierUsed !== 'STANDARD') return ''
  if (compact) return job.quotaUnits == null ? '标准完成' : `标准完成 · ${job.quotaUnits} 次`
  return `高质量暂时不可用，这张用标准完成${job.quotaUnits == null ? '' : `，只用了 ${job.quotaUnits} 次`}`
}
