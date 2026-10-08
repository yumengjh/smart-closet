/** Mirrors RecommendationService.OutfitView on the server; all text is computed server-side. */
export type EvidenceLine = { text: string; positive: boolean }
export type Dimension = { key: string; label: string; score: number; weight: number; evidence: EvidenceLine[] }
export type RecommendedGarment = { id: string; name: string; role: string; color: string; categories: string[]; reasons: string[] }
export type OuterSuggestion = { id: string; name: string; reasons: string[] }
export type RecommendedOutfit = {
  key: string; logId: string | null; rank: number; name: string; score: number
  highlights: string[]; warnings: string[]; tags: string[]
  garments: RecommendedGarment[]; dimensions: Dimension[]; outers: OuterSuggestion[]; template: string | null
}
export type Verdict = 'UP' | 'DOWN'

export const FEEDBACK_REASONS = [
  { value: 'COLOR_CLASH', label: '颜色不搭' },
  { value: 'TOO_HOT', label: '太热' },
  { value: 'TOO_COLD', label: '太冷' },
  { value: 'TOO_FORMAL', label: '太正式' },
  { value: 'TOO_CASUAL', label: '太随意' },
  { value: 'DISLIKE_ITEM', label: '不喜欢某一件' },
] as const

export const ROLE_LABELS: Record<string, string> = {
  TOP: '上装', INNER: '打底', OUTER: '外层', BOTTOM: '下装', ONE_PIECE: '连衣裙/连体', SHOES: '鞋',
  HAT: '帽子', BAG: '包', GLASSES: '眼镜', SCARF: '围巾', BELT: '腰带', SOCKS: '袜子', GLOVES: '手套', ACCESSORY: '配饰', OTHER: '其他',
}

export function scoreTone(score: number): 'success' | 'normal' | 'exception' {
  return score >= 75 ? 'success' : score >= 50 ? 'normal' : 'exception'
}
