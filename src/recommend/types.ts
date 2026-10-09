/** Mirrors RecommendationService.OutfitView on the server; all text is computed server-side. */
export type EvidenceLine = { text: string; positive: boolean }
export type Dimension = { key: string; label: string; score: number; weight: number; evidence: EvidenceLine[] }
export type RecommendedGarment = { id: string; name: string; role: string; color: string; categories: string[]; reasons: string[]; imageStyle?: string | null }
export type OuterSuggestion = { id: string; name: string; reasons: string[] }
/** D45: optional accessories shown next to the outfit (never part of it, never scored). */
export type AccessorySuggestion = { id: string; name: string; role: string; reasons: string[] }
export type RecommendedOutfit = {
  key: string; logId: string | null; rank: number; name: string; score: number
  highlights: string[]; warnings: string[]; tags: string[]
  garments: RecommendedGarment[]; dimensions: Dimension[]; outers: OuterSuggestion[]; template: string | null
  /** Absent on cards stored before the full-body enhancement. */
  accessories?: AccessorySuggestion[]; tips?: string[]
}
export type Verdict = 'UP' | 'DOWN'

export const FEEDBACK_REASONS = [
  { value: 'COLOR_CLASH', label: '颜色不搭' },
  { value: 'TOO_HOT', label: '太热' },
  { value: 'TOO_COLD', label: '太冷' },
  { value: 'TOO_FORMAL', label: '太正式' },
  { value: 'TOO_CASUAL', label: '太随意' },
  { value: 'DISLIKE_ITEM', label: '不喜欢某一件' },
  { value: 'STYLE_MISMATCH', label: '画风不统一' },
] as const

export const OCCASIONS = [
  { value: 'DAILY', label: '日常' }, { value: 'COMMUTE', label: '通勤' }, { value: 'DATE', label: '约会' }, { value: 'SPORT', label: '运动' },
  { value: 'OUTDOOR', label: '户外' }, { value: 'FORMAL', label: '正式' }, { value: 'TRAVEL', label: '度假' }, { value: 'HOME', label: '居家' },
] as const
export type Occasion = typeof OCCASIONS[number]['value']

/** Body of POST /api/recommendations (design 5.1). */
export type IntentInput = {
  occasion?: Occasion; temperatureC?: number | null; season?: string; wantStyles?: string[]; wantColors?: string[]; avoidColors?: string[]
  freeText?: string; requiredGarmentIds?: string[]; excludedGarmentIds?: string[]; wantCategories?: string[]; count?: number
}
/** Intent echoed by the server: the input fields plus a plain-language description. */
export type IntentEcho = IntentInput & { description: string; sources?: Record<string, string> }
export type RecommendationView = {
  runId: string; intent: IntentEcho; outfits: RecommendedOutfit[]; limits: string[]; notes: string[]; emptyReason: string; hasMore: boolean
}
export type SwapAlternative = { garment: RecommendedGarment; delta: number; outfit: RecommendedOutfit }
export type SwapView = { runId: string; replaced: string; alternatives: SwapAlternative[] }
export type ExplainRule = { id: string; label: string; kind: 'HARD' | 'SOFT' | 'BONUS'; hit: boolean; delta: number; evidence: string }
export type Explanation = {
  runId: string; intent: string; status: 'EXCLUDED' | 'CUT' | 'RANKED' | 'SHOWN' | 'NOT_IN_CLOSET' | 'NOT_COMBINED' | 'NO_VALID_OUTFIT'
  summary: string[]; name?: string
  bestOutfit?: { key: string; rank: number; of: number; score: number; garments: string; rules: ExplainRule[] }
  outfit?: { key: string; rank: number; of: number; score: number; garments: string; rules: ExplainRule[] }
}
export type WearSummary = { garmentId: string; count: number; lastWornOn: string | null; daysSince: number | null }
export type Statement = { key: string; kind: string; text: string; evidence: number; weight: number }
export type Cooldown = { garmentId: string; name: string; dislikes: number; daysLeft: number }
export type ProfileSettings = {
  boldness: 'CONSERVATIVE' | 'BALANCED' | 'BOLD'; exploration: boolean; profileEnabled: boolean; city: string | null
  blocked: string[]; resetAtMs: number; styleMixing: 'AUTO' | 'ALLOW' | 'FORBID'; semanticStrictness: number | null
}
export type StrictnessLevel = { level: number; threshold: number; margin: number }
export type StyleProfileView = {
  settings: ProfileSettings; statements: Statement[]; cooldowns: Cooldown[]
  offsets: { warmth: number; formality: number; warmthEvidence: number; formalityEvidence: number }; offsetCaps: { warmth: number; formality: number }
  strictness: StrictnessLevel & { recommended: number; levels: StrictnessLevel[] }
  feedbackHalfLifeDays: { negative: number; positive: number }
  templates: { active: number; pendingReview: number }
}

export const ROLE_LABELS: Record<string, string> = {
  TOP: '上装', INNER: '打底', OUTER: '外层', BOTTOM: '下装', ONE_PIECE: '连衣裙/连体', OVERALL: '背带裙/背带裤', SHOES: '鞋',
  HAT: '帽子', HEADWEAR: '头饰', BAG: '包', HANDHELD: '手持物', GLASSES: '眼镜', SCARF: '围巾', BELT: '腰带', SOCKS: '袜子/裤袜', GLOVES: '手套', ACCESSORY: '配饰', OTHER: '其他',
}

export function scoreTone(score: number): 'success' | 'normal' | 'exception' {
  return score >= 75 ? 'success' : score >= 50 ? 'normal' : 'exception'
}

/** GET /api/recommendations/inspiration (P4 今日灵感): reviewed templates filled with the user's own clothes. */
export type InspirationIdea = { key: string; templateId: string; text: string; kind: 'CLASSIC' | 'TREND'; label: string }
export type InspirationGap = { templateId: string; text: string; kind: 'CLASSIC' | 'TREND'; missing: string; have: string[]; hint: string }
export type InspirationView = { view: RecommendationView; ideas: InspirationIdea[]; gaps: InspirationGap[]; approvedTemplates: number; applicableTemplates: number }

/** GET /api/recommendations/stats (P4): adoption and model cost over the last N days. */
export type RecommendationStats = {
  days: number
  effect: {
    shown: number; adopted: number; adoptionRate: number | null; liked: number; disliked: number; likeRate: number | null
    openedInWorkspace: number; wornWithin3Days: number; swaps: number; swapPerShown: number | null
    bySource: Record<string, { shown: number; adopted: number }>; definition: string
  }
  cost: {
    agentMessages: number; imageCredits: number; agentCalls: number; inputTokens: number; outputTokens: number; unknownUsage: number
    zeroModelRecommendations: number; note: string
  }
}
