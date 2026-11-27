import { platformRequest } from './platform'

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

/** 档位开启时只发送 tier；关闭时保留原有 provider/model。 */
export function renderChoice(enabled: boolean, tier: Tier, capability?: { provider: string; model: string }) {
  return enabled ? { tier } : { provider: capability!.provider, model: capability!.model }
}

export function withRenderTier<T extends object>(input: T, enabled: boolean, tier: Tier): T & { tier?: Tier } {
  return enabled ? { ...input, tier } : input
}

/** 未传 tier 的请求按高质量单位计。档位接口上线前，每张是 1 次。 */
export function legacyRenderUnits(config: RenderTiers | null, baseUnits = 1): number {
  return baseUnits * (config?.tiers.find(item => item.tier === 'PREMIUM')?.units ?? 1)
}

export function tierFallbackMessage(job: { tierRequested?: Tier | null; tierUsed?: Tier | null; quotaUnits?: number | null }): string {
  if (job.tierRequested !== 'PREMIUM' || job.tierUsed !== 'STANDARD') return ''
  return `高质量暂时不可用，这张用标准完成${job.quotaUnits == null ? '' : `，只用了 ${job.quotaUnits} 次`}`
}
